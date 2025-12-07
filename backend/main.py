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
    goal: str = "optimize"  # "compile", "verify", or "optimize"


class TestGenRequest(BaseModel):
    design_code: str
    max_iterations: int = 5


class DesignOnlyRequest(BaseModel):
    design_code: str


class ConvertRequest(BaseModel):
    c_code: str
    top_function: str = "main"


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
        "goal": request.goal,
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
            max_iterations=run["max_iterations"],
            goal=run.get("goal", "optimize")
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
        max_iterations=request.max_iterations,
        goal=request.goal
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


# ============== C to Verilog Conversion ==============

@app.post("/convert")
async def convert_c_to_verilog(request: ConvertRequest):
    """Convert C code to Verilog using BAMBU HLS.

    Fails fast: validates C syntax with gcc first, then runs BAMBU.
    No auto-fix on failure - returns errors for user to fix manually.
    """
    result = execute_tool("convert_c_to_verilog", {
        "code": request.c_code,
        "top_function": request.top_function
    })

    if result.get("success"):
        return {
            "success": True,
            "verilog_code": result["verilog_code"],
            "message": "C code successfully converted to Verilog"
        }
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "errors": result.get("errors", ["Unknown error"]),
                "raw_output": result.get("raw_output", "")
            }
        )


@app.post("/convert/check")
async def check_c_syntax(request: ConvertRequest):
    """Check C code syntax without conversion.

    Use this to validate C code before attempting full HLS conversion.
    """
    result = execute_tool("check_c_syntax", {"code": request.c_code})

    return {
        "success": result.get("success", False),
        "errors": result.get("errors", []),
        "raw_output": result.get("raw_output", "")
    }


class ConvertPipelineRequest(BaseModel):
    c_code: str
    top_function: str = "main"
    testbench_code: str = ""  # Optional testbench, will be generated if empty
    max_iterations: int = 10
    goal: str = "verify"  # Default to verify for C conversion


@app.post("/convert/pipeline")
async def convert_and_optimize_pipeline(request: ConvertPipelineRequest):
    """Full C-to-Verilog pipeline: syntax check, convert, then debug/optimize.

    Steps:
    1. Check C syntax (fail fast)
    2. Convert to Verilog via BAMBU
    3. Generate testbench if not provided
    4. Run full debug/optimize pipeline
    """
    # Step 1: Check C syntax
    syntax_result = execute_tool("check_c_syntax", {"code": request.c_code})
    if not syntax_result.get("success"):
        raise HTTPException(
            status_code=400,
            detail={
                "step": "syntax_check",
                "success": False,
                "errors": syntax_result.get("errors", ["C syntax check failed"]),
                "raw_output": syntax_result.get("raw_output", "")
            }
        )

    # Step 2: Convert to Verilog
    convert_result = execute_tool("convert_c_to_verilog", {
        "code": request.c_code,
        "top_function": request.top_function
    })

    if not convert_result.get("success"):
        raise HTTPException(
            status_code=400,
            detail={
                "step": "conversion",
                "success": False,
                "errors": convert_result.get("errors", ["Conversion failed"]),
                "raw_output": convert_result.get("raw_output", "")
            }
        )

    verilog_code = convert_result.get("verilog_code", "")

    # Step 3: Get or generate testbench
    testbench_code = request.testbench_code
    if not testbench_code:
        tb_result = execute_tool("generate_testbench", {
            "design_code": verilog_code,
            "use_llm": False  # Use skeleton for C-generated code
        })
        if "error" not in tb_result:
            testbench_code = tb_result.get("testbench_code", "")
        else:
            # Return partial result if testbench generation fails
            return {
                "step": "testbench_generation",
                "success": False,
                "verilog_code": verilog_code,
                "error": tb_result.get("error"),
                "message": "Conversion successful but testbench generation failed"
            }

    # Step 4: Run debug/optimize pipeline
    results = []
    async for step in run_agent(
        design_code=verilog_code,
        testbench_code=testbench_code,
        max_iterations=request.max_iterations,
        goal=request.goal
    ):
        results.append(step)
        if step["done"]:
            break

    if not results:
        raise HTTPException(status_code=500, detail="Pipeline produced no results")

    final = results[-1]
    return {
        "success": True,
        "c_code": request.c_code,
        "verilog_code": final["code"],
        "testbench_code": testbench_code,
        "lut_history": final["lut_history"],
        "iterations": final["iteration"],
        "reasoning": [r.get("reasoning") for r in results if r.get("reasoning")],
        "pipeline_steps": ["syntax_check", "conversion", "testbench_gen", "debug_optimize"]
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
