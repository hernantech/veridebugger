"""
FastAPI backend for Verilog optimization agent.
"""
import asyncio
import uuid
from typing import Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import create_agent_graph, AgentState


# Store for active runs
runs: dict[str, AgentState] = {}
run_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanup on shutdown
    for task in run_tasks.values():
        task.cancel()


app = FastAPI(
    title="Verilog Optimization Agent",
    description="Iteratively optimize Verilog code using AI",
    version="0.1.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    target: str = "4x4 matmul"
    max_iterations: int = 5


class RunResponse(BaseModel):
    run_id: str
    status: str


class StatusResponse(BaseModel):
    iteration: int
    state: Literal["generating", "simulating", "estimating", "complete", "failed"]
    code: str
    lut_count: int | None
    lut_history: list[int]
    agent_reasoning: str
    sim_passed: bool
    error: str | None


@app.post("/run", response_model=RunResponse)
async def start_run(request: RunRequest):
    """Start a new optimization run."""
    run_id = str(uuid.uuid4())

    initial_state: AgentState = {
        "iteration": 0,
        "max_iterations": request.max_iterations,
        "current_code": "",
        "best_code": "",
        "lut_count": 0,
        "best_lut_count": None,
        "lut_history": [],
        "sim_passed": False,
        "error": None,
        "agent_reasoning": "",
        "state": "generating"
    }

    runs[run_id] = initial_state

    # Start the agent in background
    async def run_agent():
        agent = create_agent_graph()
        # Run synchronously since langgraph doesn't have native async
        loop = asyncio.get_event_loop()
        final_state = await loop.run_in_executor(
            None,
            lambda: agent.invoke(initial_state)
        )
        runs[run_id] = final_state

    task = asyncio.create_task(run_agent())
    run_tasks[run_id] = task

    return RunResponse(run_id=run_id, status="started")


@app.get("/status/{run_id}", response_model=StatusResponse)
async def get_status(run_id: str):
    """Get the current status of a run."""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")

    state = runs[run_id]

    return StatusResponse(
        iteration=state["iteration"],
        state=state["state"],
        code=state["current_code"],
        lut_count=state["lut_count"] if state["lut_count"] else None,
        lut_history=state["lut_history"],
        agent_reasoning=state["agent_reasoning"],
        sim_passed=state["sim_passed"],
        error=state["error"]
    )


@app.websocket("/stream/{run_id}")
async def stream_updates(websocket: WebSocket, run_id: str):
    """Stream real-time updates for a run."""
    await websocket.accept()

    if run_id not in runs:
        await websocket.send_json({"error": "Run not found"})
        await websocket.close()
        return

    try:
        last_state = None
        while True:
            state = runs.get(run_id)

            if state and state != last_state:
                await websocket.send_json({
                    "iteration": state["iteration"],
                    "state": state["state"],
                    "code": state["current_code"],
                    "lut_count": state["lut_count"] if state["lut_count"] else None,
                    "lut_history": state["lut_history"],
                    "agent_reasoning": state["agent_reasoning"],
                    "sim_passed": state["sim_passed"],
                    "error": state["error"]
                })
                last_state = state.copy() if state else None

                if state["state"] in ("complete", "failed"):
                    break

            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
