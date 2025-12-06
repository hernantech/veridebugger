"""
FastAPI backend for FPGA optimization agent.
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Dict
from dotenv import load_dotenv

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load environment variables from .env file
load_dotenv()

from agent import run_agent, run_agent_streaming


active_runs: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    active_runs.clear()


app = FastAPI(title="FPGA Optimization Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OptimizeRequest(BaseModel):
    design_code: str
    testbench_code: str
    max_iterations: int = 10


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/start")
async def start_optimization(request: OptimizeRequest):
    run_id = str(uuid.uuid4())[:8]

    active_runs[run_id] = {
        "design_code": request.design_code,
        "testbench_code": request.testbench_code,
        "max_iterations": request.max_iterations,
        "status": "pending",
        "history": []
    }

    return {"run_id": run_id, "message": f"Connect to WebSocket at /stream/{run_id}"}


@app.get("/status/{run_id}")
async def get_status(run_id: str):
    if run_id not in active_runs:
        raise HTTPException(status_code=404, detail="Run not found")

    run = active_runs[run_id]
    return {
        "run_id": run_id,
        "status": run["status"],
        "history": run["history"],
        "latest": run["history"][-1] if run["history"] else None
    }


@app.websocket("/stream/{run_id}")
async def stream_optimization(websocket: WebSocket, run_id: str):
    await websocket.accept()

    if run_id not in active_runs:
        await websocket.send_json({"error": "Run not found"})
        await websocket.close()
        return

    run = active_runs[run_id]
    run["status"] = "running"

    try:
        async for step in run_agent_streaming(
            design_code=run["design_code"],
            testbench_code=run["testbench_code"],
            max_iterations=run["max_iterations"]
        ):
            run["history"].append(step)
            await websocket.send_json(step)

            if step["done"]:
                break

        run["status"] = "completed"
        await websocket.send_json({"done": True, "status": "completed"})

    except WebSocketDisconnect:
        run["status"] = "disconnected"
    except Exception as e:
        run["status"] = "error"
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()


@app.post("/optimize")
async def optimize_sync(request: OptimizeRequest):
    results = []

    async for step in run_agent(
        design_code=request.design_code,
        testbench_code=request.testbench_code,
        max_iterations=request.max_iterations
    ):
        results.append(step)
        if step["done"]:
            break

    if not results:
        raise HTTPException(status_code=500, detail="Agent produced no results")

    final = results[-1]
    return {
        "final_code": final["code"],
        "lut_history": final["lut_history"],
        "iterations": final["iteration"],
        "reasoning": [r["reasoning"] for r in results if r.get("reasoning")]
    }


# Legacy endpoint for backward compatibility
@app.post("/run")
async def legacy_run(request: OptimizeRequest):
    """Legacy endpoint - redirects to /start."""
    return await start_optimization(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
