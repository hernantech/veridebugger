"""
FastAPI backend for FPGA optimization agent with debugging and test generation.
"""

import uuid
from contextlib import asynccontextmanager
from typing import Dict
from dotenv import load_dotenv

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load environment variables from .env file
load_dotenv()

from agent import run_agent, run_agent_streaming, run_testgen_agent
from tools import execute_tool


active_runs: Dict[str, dict] = {}
testgen_runs: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    active_runs.clear()
    testgen_runs.clear()


app = FastAPI(title="FPGA VeriDebugger Agent", lifespan=lifespan)

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


class TestGenRequest(BaseModel):
    design_code: str
    max_iterations: int = 5


class DesignOnlyRequest(BaseModel):
    design_code: str


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


# ============== Test Generation Endpoints ==============

@app.post("/testgen/interface")
async def extract_interface(request: DesignOnlyRequest):
    """Extract module interface from design code."""
    result = execute_tool("extract_interface", {"design_code": request.design_code})
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/testgen/generate")
async def generate_testbench(request: DesignOnlyRequest):
    """Generate a testbench for the design using LLM."""
    result = execute_tool("generate_testbench", {
        "design_code": request.design_code,
        "use_llm": True
    })
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/testgen/start")
async def start_testgen(request: TestGenRequest):
    """Start autonomous test generation and verification loop."""
    run_id = str(uuid.uuid4())[:8]

    testgen_runs[run_id] = {
        "design_code": request.design_code,
        "max_iterations": request.max_iterations,
        "status": "pending",
        "history": []
    }

    return {"run_id": run_id, "message": f"Connect to WebSocket at /testgen/stream/{run_id}"}


@app.websocket("/testgen/stream/{run_id}")
async def stream_testgen(websocket: WebSocket, run_id: str):
    """Stream test generation and verification progress."""
    await websocket.accept()

    if run_id not in testgen_runs:
        await websocket.send_json({"error": "Run not found"})
        await websocket.close()
        return

    run = testgen_runs[run_id]
    run["status"] = "running"

    try:
        async for step in run_testgen_agent(
            design_code=run["design_code"],
            max_iterations=run["max_iterations"]
        ):
            run["history"].append(step)
            await websocket.send_json(step)

            if step.get("done"):
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


@app.post("/testgen/full")
async def testgen_full_sync(request: TestGenRequest):
    """Run full test generation + verification synchronously."""
    results = []

    async for step in run_testgen_agent(
        design_code=request.design_code,
        max_iterations=request.max_iterations
    ):
        results.append(step)
        if step.get("done"):
            break

    if not results:
        raise HTTPException(status_code=500, detail="Agent produced no results")

    final = results[-1]
    return {
        "final_code": final.get("code", request.design_code),
        "generated_testbench": final.get("generated_testbench"),
        "interface": final.get("interface"),
        "lut_history": final.get("lut_history", []),
        "iterations": final.get("iteration", 0),
        "reasoning": [r.get("reasoning") for r in results if r.get("reasoning")]
    }


# ============== Debug Endpoints ==============

@app.post("/debug/vcd")
async def run_with_vcd(request: OptimizeRequest):
    """Run simulation with VCD capture and return waveform info."""
    result = execute_tool("simulate_with_vcd", {
        "design_code": request.design_code,
        "testbench_code": request.testbench_code
    })
    return result


@app.post("/debug/analyze")
async def analyze_vcd_endpoint(vcd_path: str):
    """Analyze a VCD file and return signal summary."""
    result = execute_tool("analyze_vcd", {"vcd_path": vcd_path})
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ============== Legacy ==============

@app.post("/run")
async def legacy_run(request: OptimizeRequest):
    """Legacy endpoint - redirects to /start."""
    return await start_optimization(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
