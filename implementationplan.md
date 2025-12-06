# FPGA Vibe Debugger - Implementation Plan

## Overview

An AI agent that takes buggy Verilog, iteratively debugs it, then optimizes LUT usage.

**Stack:** FastAPI + LangGraph + Gemini + iverilog + yosys

---

## File Structure

```
fpga-agent/
├── backend/
│   ├── main.py          # FastAPI endpoints
│   ├── agent.py         # LangGraph workflow  
│   ├── tools.py         # iverilog/yosys wrappers
│   ├── parsers.py       # Error parsing (the secret sauce)
│   └── requirements.txt
├── frontend/            # Vibe code this
├── fixtures/
│   ├── matmul_buggy.v   # Demo input (has 5 intentional bugs)
│   └── matmul_tb.v      # Testbench
├── Dockerfile
└── .env
```

---

## API Specification

### Endpoints

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/health` | GET | - | `{"status": "ok"}` |
| `/start` | POST | `{design_code, testbench_code, max_iterations}` | `{run_id}` |
| `/stream/{run_id}` | WebSocket | - | Stream of `AgentStep` |
| `/status/{run_id}` | GET | - | `{status, history, latest}` |
| `/optimize` | POST | `{design_code, testbench_code, max_iterations}` | `{final_code, lut_history}` |

### WebSocket Message Shape

```typescript
interface AgentStep {
  phase: "compile" | "simulate" | "synthesize" | "optimize" | "done";
  action: string;
  reasoning: string;
  code: string;
  result: CompileResult | SimResult | SynthResult | null;
  lut_history: number[];
  iteration: number;
  done: boolean;
}

interface CompileResult {
  success: boolean;
  errors: Array<{
    line: number;
    type: string;
    message: string;
    hint: string | null;
  }>;
}

interface SimResult {
  passed: boolean;
  failures: Array<{
    signal: string;
    expected: string;
    actual: string;
    cycle: number | null;
  }>;
}

interface SynthResult {
  success: boolean;
  luts: number | null;
  ffs: number | null;
  cells: Record<string, number>;
}
```

---

## Implementation Steps

### Step 1: Environment Setup (10 min)

```bash
# Install HDL tools
apt-get update && apt-get install -y iverilog yosys

# Verify
iverilog -v      # Should show version
yosys -V         # Should show version

# Setup Python
cd fpga-agent/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set API key
export GOOGLE_API_KEY=your_gemini_key
```

### Step 2: Test Fixtures (5 min)

```bash
cd fpga-agent/fixtures

# This SHOULD fail (buggy code)
iverilog -Wall -o sim.out matmul_buggy.v matmul_tb.v
# Expected: error about undeclared 'state'

# Test yosys (will also error on buggy code)
yosys -p "read_verilog matmul_buggy.v; synth; stat"
```

### Step 3: Test Parsers (10 min)

```bash
cd fpga-agent/backend
python3 << 'EOF'
from parsers import parse_iverilog_compile, parse_yosys_synth

# Test compile parser
compile_output = """matmul_buggy.v:23: error: Unable to bind wire/reg/memory `state'
matmul_buggy.v:47: warning: implicit definition of wire 'temp'"""

result = parse_iverilog_compile(compile_output, 1)
print("Compile result:", result)
print("Errors:", [(e.line, e.type, e.message) for e in result.errors])

# Test synth parser  
synth_output = """
=== design ===
   Number of wires:                 42
   Number of cells:                123
     $_AND_                         45
     $_DFF_P_                        8
     $_NOT_                         12
"""
result = parse_yosys_synth(synth_output, 0)
print("\nSynth result:", result)
print("LUTs:", result.luts, "FFs:", result.ffs)
EOF
```

### Step 4: Test Tools (10 min)

```bash
cd fpga-agent/backend
python3 << 'EOF'
from tools import compile_verilog, simulate, estimate_resources

# Read fixtures
with open('../fixtures/matmul_buggy.v') as f:
    design = f.read()
with open('../fixtures/matmul_tb.v') as f:
    tb = f.read()

# Test compile (should fail)
result = compile_verilog(design)
print("Compile success:", result.success)
print("Errors:", len(result.errors))
for e in result.errors[:3]:
    print(f"  Line {e.line}: {e.message}")
EOF
```

### Step 5: Test Agent (20 min)

```bash
cd fpga-agent/backend
python3 << 'EOF'
import asyncio
import os
from agent import run_agent

# Ensure API key is set
assert os.environ.get("GOOGLE_API_KEY"), "Set GOOGLE_API_KEY"

with open('../fixtures/matmul_buggy.v') as f:
    design = f.read()
with open('../fixtures/matmul_tb.v') as f:
    tb = f.read()

async def test():
    print("Starting agent...")
    async for step in run_agent(design, tb, max_iterations=5):
        print(f"[{step['iteration']}] {step['phase']}: {step['reasoning'][:60]}...")
        if step['done']:
            print("\nFinal LUT history:", step['lut_history'])
            break

asyncio.run(test())
EOF
```

### Step 6: Run Server (5 min)

```bash
cd fpga-agent/backend
uvicorn main:app --reload --port 8080

# In another terminal, test:
curl http://localhost:8080/health

# Test start endpoint
curl -X POST http://localhost:8080/start \
  -H "Content-Type: application/json" \
  -d '{"design_code":"module test; endmodule", "testbench_code":"module tb; endmodule", "max_iterations": 3}'
```

### Step 7: Vibe Code Frontend (30 min)

Give Claude Code this prompt:

```
Create a React frontend for an FPGA optimization agent. 

Backend runs at localhost:8080 with these endpoints:
- POST /start {design_code, testbench_code, max_iterations} → {run_id}
- WebSocket /stream/{run_id} → streams AgentStep messages

AgentStep shape:
{
  phase: "compile" | "simulate" | "synthesize" | "optimize" | "done",
  action: string,
  reasoning: string,
  code: string,
  result: object | null,
  lut_history: number[],
  iteration: number,
  done: boolean
}

UI requirements:
1. Two textareas: "Design Code" and "Testbench Code" (preload with demo code)
2. "Start Optimization" button
3. Code panel showing current Verilog (use Monaco editor or Prism for highlighting)
4. Error panel showing parsed errors from result (when phase is compile/simulate)
5. Agent log panel showing reasoning messages as they stream in
6. LUT chart (line chart) showing lut_history over iterations
7. Status indicator: compile → simulate → synthesize → optimize (checkmarks for completed)

Use:
- React + Vite
- Tailwind CSS
- Recharts for the LUT chart
- Native WebSocket API

Make it dark mode, clean, minimal.
```

### Step 8: Deploy (15 min)

```bash
cd fpga-agent

# Test Docker build locally
docker build -t fpga-agent .
docker run -p 8080:8080 -e GOOGLE_API_KEY=$GOOGLE_API_KEY fpga-agent

# Deploy to Fly.io
fly launch --name fpga-agent
fly secrets set GOOGLE_API_KEY=your_key
fly deploy

# Or Railway
railway login
railway init
railway up
```

---

## Code Files

### backend/parsers.py

```python
"""
Parsers for iverilog and yosys output.
Converts raw tool output into structured, LLM-friendly feedback.
"""

import re
from dataclasses import dataclass, asdict
from typing import Literal


@dataclass
class CompileError:
    line: int
    column: int | None
    type: str  # syntax, binding, type, warning
    message: str
    hint: str | None = None


@dataclass 
class CompileResult:
    success: bool
    errors: list[CompileError]
    raw_output: str


@dataclass
class SimFailure:
    cycle: int | None
    time_ns: int | None
    signal: str
    expected: str
    actual: str


@dataclass
class SimResult:
    passed: bool
    failures: list[SimFailure]
    raw_output: str


@dataclass
class SynthResult:
    success: bool
    luts: int | None
    ffs: int | None
    cells: dict[str, int]
    errors: list[str]
    raw_output: str


def parse_iverilog_compile(output: str, returncode: int) -> CompileResult:
    """Parse iverilog compilation output."""
    errors = []
    
    pattern = r'([^:]+):(\d+):\s*(error|warning|syntax error):\s*(.+)'
    
    for match in re.finditer(pattern, output, re.MULTILINE):
        filename, line, err_type, message = match.groups()
        
        if 'syntax' in err_type:
            err_type = 'syntax'
        elif 'warning' in err_type:
            err_type = 'warning'
        else:
            err_type = classify_error(message)
        
        hint = generate_hint(err_type, message)
        
        errors.append(CompileError(
            line=int(line),
            column=None,
            type=err_type,
            message=message.strip(),
            hint=hint
        ))
    
    simple_pattern = r'([^:]+):(\d+):\s*syntax error'
    for match in re.finditer(simple_pattern, output, re.MULTILINE):
        if not any(e.line == int(match.group(2)) for e in errors):
            errors.append(CompileError(
                line=int(match.group(2)),
                column=None,
                type='syntax',
                message='Syntax error',
                hint='Check for missing semicolons, mismatched parentheses, or invalid keywords'
            ))
    
    success = returncode == 0 and not any(e.type != 'warning' for e in errors)
    
    return CompileResult(success=success, errors=errors, raw_output=output)


def classify_error(message: str) -> str:
    message_lower = message.lower()
    
    if 'bind' in message_lower or 'undeclared' in message_lower:
        return 'binding'
    elif 'type' in message_lower or 'width' in message_lower:
        return 'type'
    elif 'port' in message_lower:
        return 'port'
    elif 'range' in message_lower:
        return 'range'
    else:
        return 'error'


def generate_hint(err_type: str, message: str) -> str | None:
    hints = {
        'binding': "Check that all signals are declared as 'wire' or 'reg' before use",
        'syntax': "Check for missing semicolons, mismatched begin/end, or invalid keywords",
        'type': "Check bit widths match between assignments and declarations",
        'port': "Check module port declarations match instantiation",
        'range': "Check array/vector indices are within declared bounds",
    }
    return hints.get(err_type)


def parse_vvp_simulation(output: str, returncode: int) -> SimResult:
    """Parse vvp simulation output."""
    failures = []
    passed = True
    
    fail_pattern = r'\[FAIL\]\s*(\w+)=(\S+)\s+expected=(\S+)\s+actual=(\S+)(?:\s+cycle=(\d+))?(?:\s+time=(\d+))?'
    
    for match in re.finditer(fail_pattern, output):
        signal, _, expected, actual, cycle, time_ns = match.groups()
        failures.append(SimFailure(
            cycle=int(cycle) if cycle else None,
            time_ns=int(time_ns) if time_ns else None,
            signal=signal,
            expected=expected,
            actual=actual
        ))
        passed = False
    
    done_pattern = r'\[DONE\]\s*passed=(\d+)\s+failed=(\d+)'
    done_match = re.search(done_pattern, output)
    if done_match:
        _, failed_count = done_match.groups()
        if int(failed_count) > 0:
            passed = False
    
    if returncode != 0:
        passed = False
    
    if re.search(r'\$stop|\$fatal|ERROR', output, re.IGNORECASE):
        passed = False
    
    return SimResult(passed=passed, failures=failures, raw_output=output)


def parse_yosys_synth(output: str, returncode: int) -> SynthResult:
    """Parse yosys synthesis output for resource usage."""
    cells = {}
    luts = None
    ffs = None
    errors = []
    
    if returncode != 0:
        error_pattern = r'ERROR:\s*(.+)'
        for match in re.finditer(error_pattern, output):
            errors.append(match.group(1).strip())
        return SynthResult(
            success=False, luts=None, ffs=None, 
            cells={}, errors=errors, raw_output=output
        )
    
    cell_pattern = r'^\s+(\$?\w+)\s+(\d+)\s*$'
    in_stats = False
    
    for line in output.split('\n'):
        if 'Number of cells' in line:
            in_stats = True
            continue
        
        if in_stats:
            match = re.match(cell_pattern, line)
            if match:
                cell_name, count = match.groups()
                cells[cell_name] = int(count)
            elif line.strip() and not line.startswith(' '):
                in_stats = False
    
    lut_cells = ['$_AND_', '$_OR_', '$_XOR_', '$_NOT_', '$_MUX_', '$_NAND_', '$_NOR_', 
                 '$lut', '$_LUT4_', '$_LUT6_', 'LUT4', 'LUT6', 'SB_LUT4']
    luts = sum(cells.get(c, 0) for c in lut_cells)
    
    if luts == 0:
        logic_cells = ['$_AND_', '$_OR_', '$_XOR_', '$_NOT_', '$_NAND_', '$_NOR_', '$_XNOR_']
        luts = sum(cells.get(c, 0) for c in logic_cells) // 4 + 1
    
    ff_cells = ['$_DFF_P_', '$_DFF_N_', '$_DFFE_PP_', '$_SDFF', '$dff', 'SB_DFF']
    ffs = sum(v for k, v in cells.items() if any(ff in k for ff in ff_cells))
    
    return SynthResult(
        success=True,
        luts=luts,
        ffs=ffs,
        cells=cells,
        errors=[],
        raw_output=output
    )


def result_to_dict(result: CompileResult | SimResult | SynthResult) -> dict:
    """Convert dataclass result to dict for JSON serialization."""
    if isinstance(result, CompileResult):
        return {
            'success': result.success,
            'errors': [asdict(e) for e in result.errors],
            'raw_output': result.raw_output
        }
    elif isinstance(result, SimResult):
        return {
            'passed': result.passed,
            'failures': [asdict(f) for f in result.failures],
            'raw_output': result.raw_output
        }
    elif isinstance(result, SynthResult):
        return {
            'success': result.success,
            'luts': result.luts,
            'ffs': result.ffs,
            'cells': result.cells,
            'errors': result.errors,
            'raw_output': result.raw_output
        }
    return asdict(result)
```

### backend/tools.py

```python
"""
Tools for HDL compilation, simulation, and synthesis.
"""

import subprocess
import tempfile
from pathlib import Path
from parsers import (
    parse_iverilog_compile, 
    parse_vvp_simulation, 
    parse_yosys_synth,
    CompileResult,
    SimResult,
    SynthResult,
    result_to_dict
)


WORK_DIR = Path(tempfile.gettempdir()) / "fpga-agent"
WORK_DIR.mkdir(exist_ok=True)


def compile_verilog(code: str, filename: str = "design.v") -> CompileResult:
    """Compile Verilog code using iverilog."""
    filepath = WORK_DIR / filename
    filepath.write_text(code)
    
    result = subprocess.run(
        ["iverilog", "-Wall", "-t", "null", str(filepath)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    output = result.stdout + result.stderr
    return parse_iverilog_compile(output, result.returncode)


def simulate(design_code: str, testbench_code: str) -> SimResult:
    """Compile and simulate Verilog design with testbench."""
    design_path = WORK_DIR / "design.v"
    tb_path = WORK_DIR / "testbench.v"
    sim_out = WORK_DIR / "sim.out"
    
    design_path.write_text(design_code)
    tb_path.write_text(testbench_code)
    
    compile_result = subprocess.run(
        ["iverilog", "-Wall", "-o", str(sim_out), str(design_path), str(tb_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if compile_result.returncode != 0:
        output = compile_result.stdout + compile_result.stderr
        return SimResult(
            passed=False,
            failures=[],
            raw_output=f"Compilation failed:\n{output}"
        )
    
    sim_result = subprocess.run(
        ["vvp", str(sim_out)],
        capture_output=True,
        text=True,
        timeout=60
    )
    
    output = sim_result.stdout + sim_result.stderr
    return parse_vvp_simulation(output, sim_result.returncode)


def estimate_resources(code: str, target: str = "generic") -> SynthResult:
    """Synthesize Verilog and estimate resource usage."""
    filepath = WORK_DIR / "design.v"
    filepath.write_text(code)
    
    if target == "ice40":
        synth_cmd = "synth_ice40"
    elif target == "ecp5":
        synth_cmd = "synth_ecp5"
    else:
        synth_cmd = "synth"
    
    yosys_script = f"""
read_verilog {filepath}
{synth_cmd}
stat
"""
    
    script_path = WORK_DIR / "synth.ys"
    script_path.write_text(yosys_script)
    
    result = subprocess.run(
        ["yosys", "-s", str(script_path)],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    output = result.stdout + result.stderr
    return parse_yosys_synth(output, result.returncode)


def edit_code(
    original: str,
    edit_type: str,
    line_start: int,
    line_end: int | None = None,
    new_content: str = ""
) -> str:
    """Apply a structured edit to code."""
    lines = original.split('\n')
    start_idx = line_start - 1
    end_idx = (line_end - 1) if line_end else start_idx
    
    if edit_type == "replace":
        new_lines = new_content.split('\n') if new_content else []
        lines = lines[:start_idx] + new_lines + lines[end_idx + 1:]
    elif edit_type == "insert_after":
        new_lines = new_content.split('\n')
        lines = lines[:start_idx + 1] + new_lines + lines[start_idx + 1:]
    elif edit_type == "delete":
        lines = lines[:start_idx] + lines[end_idx + 1:]
    
    return '\n'.join(lines)


def execute_tool(name: str, args: dict) -> dict:
    """Execute a tool and return result as dict."""
    if name == "compile_verilog":
        result = compile_verilog(args["code"])
    elif name == "simulate":
        result = simulate(args["design_code"], args["testbench_code"])
    elif name == "estimate_resources":
        result = estimate_resources(args["code"], args.get("target", "generic"))
    elif name == "edit_code":
        edited = edit_code(
            args["original"],
            args["edit_type"],
            args["line_start"],
            args.get("line_end"),
            args.get("new_content", "")
        )
        return {"edited_code": edited}
    else:
        return {"error": f"Unknown tool: {name}"}
    
    return result_to_dict(result)
```

### backend/agent.py

```python
"""
LangGraph agent for iterative HDL debugging and optimization.
"""

import os
import json
from typing import Literal
from dataclasses import dataclass, field

from langgraph.graph import StateGraph, END
import google.generativeai as genai

from tools import execute_tool


genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))


@dataclass
class AgentState:
    design_code: str
    testbench_code: str
    phase: Literal["compile", "simulate", "synthesize", "optimize", "done"] = "compile"
    compile_result: dict | None = None
    sim_result: dict | None = None
    synth_result: dict | None = None
    lut_history: list[int] = field(default_factory=list)
    iterations: int = 0
    max_iterations: int = 10
    reasoning: list[str] = field(default_factory=list)
    error: str | None = None


SYSTEM_PROMPT = """You are an expert FPGA engineer debugging and optimizing Verilog code.

Your task is to iteratively fix and optimize HDL code through these phases:
1. COMPILE: Fix syntax and semantic errors until code compiles cleanly
2. SIMULATE: Fix logic errors until all tests pass
3. OPTIMIZE: Reduce LUT count while maintaining correctness

Respond with JSON only:
{
    "reasoning": "explanation of what you're doing and why",
    "action": "compile" | "simulate" | "synthesize" | "edit",
    "edit": {
        "edit_type": "replace" | "insert_after" | "delete",
        "line_start": <int>,
        "line_end": <int or null>,
        "new_content": "<new code>"
    }
}
"""


def call_llm(state: AgentState, context: str) -> dict:
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    message = f"""Current Verilog code:
```verilog
{state.design_code}
```

Testbench:
```verilog
{state.testbench_code}
```

Current phase: {state.phase}
Iteration: {state.iterations}/{state.max_iterations}

{context}

Respond with JSON only, no markdown."""

    response = model.generate_content(
        [{"role": "user", "parts": [message]}],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json"
        )
    )
    
    try:
        return json.loads(response.text)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return {"error": "Failed to parse LLM response", "raw": response.text}


def compile_node(state: AgentState) -> AgentState:
    result = execute_tool("compile_verilog", {"code": state.design_code})
    state.compile_result = result
    
    if result["success"]:
        state.phase = "simulate"
        state.reasoning.append("Compilation successful, moving to simulation")
    else:
        state.reasoning.append(f"Compilation failed with {len(result['errors'])} errors")
    
    return state


def simulate_node(state: AgentState) -> AgentState:
    result = execute_tool("simulate", {
        "design_code": state.design_code,
        "testbench_code": state.testbench_code
    })
    state.sim_result = result
    
    if result["passed"]:
        state.phase = "synthesize"
        state.reasoning.append("All tests passed, moving to synthesis")
    else:
        state.reasoning.append(f"Simulation failed with {len(result['failures'])} failures")
    
    return state


def synthesize_node(state: AgentState) -> AgentState:
    result = execute_tool("estimate_resources", {"code": state.design_code, "target": "generic"})
    state.synth_result = result
    
    if result["success"] and result["luts"]:
        state.lut_history.append(result["luts"])
        state.reasoning.append(f"Synthesis complete: {result['luts']} LUTs")
        state.phase = "optimize"
    else:
        state.reasoning.append(f"Synthesis failed: {result.get('errors', [])}")
    
    return state


def fix_node(state: AgentState) -> AgentState:
    state.iterations += 1
    
    if state.iterations > state.max_iterations:
        state.phase = "done"
        state.error = "Max iterations reached"
        return state
    
    if state.phase == "compile" and state.compile_result:
        errors = state.compile_result.get("errors", [])
        context = f"Compilation errors:\n{json.dumps(errors, indent=2)}\n\nFix these errors."
    elif state.phase == "simulate" and state.sim_result:
        failures = state.sim_result.get("failures", [])
        raw = state.sim_result.get("raw_output", "")
        context = f"Simulation failures:\n{json.dumps(failures, indent=2)}\n\nRaw output:\n{raw}\n\nFix the logic errors."
    elif state.phase == "optimize":
        context = f"""Current LUT count: {state.synth_result['luts']}
LUT history: {state.lut_history}

Optimize the design to reduce LUT count while maintaining correctness."""
    else:
        context = "Analyze the code and suggest improvements."
    
    response = call_llm(state, context)
    
    if "error" in response:
        state.error = response["error"]
        return state
    
    state.reasoning.append(response.get("reasoning", ""))
    
    if response.get("action") == "edit" and "edit" in response:
        edit = response["edit"]
        edited = execute_tool("edit_code", {
            "original": state.design_code,
            "edit_type": edit["edit_type"],
            "line_start": edit["line_start"],
            "line_end": edit.get("line_end"),
            "new_content": edit.get("new_content", "")
        })
        state.design_code = edited["edited_code"]
        
        if state.phase == "optimize":
            state.phase = "compile"
    
    return state


def should_continue(state: AgentState) -> Literal["fix", "compile", "simulate", "synthesize", "end"]:
    if state.error or state.phase == "done":
        return "end"
    
    if state.iterations >= state.max_iterations:
        return "end"
    
    if state.phase == "compile":
        if state.compile_result and state.compile_result["success"]:
            return "simulate"
        elif state.compile_result:
            return "fix"
        else:
            return "compile"
    
    elif state.phase == "simulate":
        if state.sim_result and state.sim_result["passed"]:
            return "synthesize"
        elif state.sim_result:
            return "fix"
        else:
            return "simulate"
    
    elif state.phase == "synthesize":
        if state.synth_result and state.synth_result["success"]:
            return "fix"
        elif state.synth_result:
            return "fix"
        else:
            return "synthesize"
    
    elif state.phase == "optimize":
        if len(state.lut_history) >= 3:
            if len(state.lut_history) >= 2 and state.lut_history[-1] >= state.lut_history[-2]:
                state.phase = "done"
                return "end"
        return "fix"
    
    return "end"


def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("compile", compile_node)
    workflow.add_node("simulate", simulate_node)
    workflow.add_node("synthesize", synthesize_node)
    workflow.add_node("fix", fix_node)
    
    workflow.set_entry_point("compile")
    
    workflow.add_conditional_edges("compile", should_continue, {
        "simulate": "simulate", "fix": "fix", "compile": "compile", "end": END
    })
    workflow.add_conditional_edges("simulate", should_continue, {
        "synthesize": "synthesize", "fix": "fix", "simulate": "simulate", "end": END
    })
    workflow.add_conditional_edges("synthesize", should_continue, {
        "fix": "fix", "synthesize": "synthesize", "end": END
    })
    workflow.add_conditional_edges("fix", should_continue, {
        "compile": "compile", "simulate": "simulate", "synthesize": "synthesize", "fix": "fix", "end": END
    })
    
    return workflow.compile()


async def run_agent(design_code: str, testbench_code: str, max_iterations: int = 10):
    graph = build_graph()
    
    initial_state = AgentState(
        design_code=design_code,
        testbench_code=testbench_code,
        max_iterations=max_iterations
    )
    
    async for state in graph.astream(initial_state):
        if isinstance(state, dict):
            for node_name, node_state in state.items():
                if isinstance(node_state, AgentState):
                    yield {
                        "phase": node_state.phase,
                        "action": node_name,
                        "reasoning": node_state.reasoning[-1] if node_state.reasoning else "",
                        "code": node_state.design_code,
                        "result": node_state.compile_result or node_state.sim_result or node_state.synth_result,
                        "lut_history": node_state.lut_history,
                        "iteration": node_state.iterations,
                        "done": node_state.phase == "done"
                    }
```

### backend/main.py

```python
"""
FastAPI backend for FPGA optimization agent.
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import run_agent


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
        async for step in run_agent(
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

### backend/requirements.txt

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
websockets==14.1
pydantic==2.10.3
langgraph==0.2.60
google-generativeai==0.8.3
python-dotenv==1.0.1
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iverilog \
    yosys \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY fixtures/ ./fixtures/

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### fixtures/matmul_buggy.v

```verilog
// 4x4 Matrix Multiply - INTENTIONALLY BUGGY
module matmul_4x4 (
    input wire clk,
    input wire rst,
    input wire start,
    input wire [7:0] a [0:3][0:3],
    input wire [7:0] b [0:3][0:3],
    output reg [15:0] c [0:3][0:3],
    output reg done
);

    // BUG 1: Missing reg declaration for state
    // reg [2:0] state;
    
    localparam IDLE = 3'b000;
    localparam COMPUTE = 3'b001;
    localparam DONE_STATE = 3'b010;
    
    reg [1:0] i, j, k;
    reg [15:0] acc;
    
    always @(posedge clk or posedge rst) begin
        if (rst) begin
            state <= IDLE;  // BUG: state undeclared
            done <= 0;
            i <= 0;
            j <= 0;
            k <= 0;
            acc <= 0;
        end else begin
            case (state)
                IDLE: begin
                    done <= 0;
                    if (start) begin
                        state <= COMPUTE;
                        i <= 0;
                        j <= 0;
                        k <= 0;
                        acc <= 0;
                    end
                end
                
                COMPUTE: begin
                    acc = acc + a[i][k] * b[k][j];  // BUG: blocking in sequential
                    
                    if (k == 3) begin
                        c[i][j] <= acc;
                        acc <= 0;
                        k <= 0;
                        
                        if (j == 3) begin
                            j <= 0;
                            if (i == 3) begin
                                state <= DONE_STATE;
                            end else begin
                                i <= i + 1;
                            end
                        end else begin
                            j <= j + 1;
                        end
                    end else begin
                        k <= k + 1;
                    end
                end
                
                DONE_STATE: begin
                    done <= 1;
                    state <= IDLE;
                end
                
                default: state <= IDLE;
            endcase
        end
    end
endmodule
```

### fixtures/matmul_tb.v

```verilog
`timescale 1ns/1ps

module matmul_tb;
    reg clk;
    reg rst;
    reg start;
    reg [7:0] a [0:3][0:3];
    reg [7:0] b [0:3][0:3];
    wire [15:0] c [0:3][0:3];
    wire done;
    
    reg [15:0] expected [0:3][0:3];
    integer passed, failed;
    integer i, j;
    
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end
    
    matmul_4x4 dut (
        .clk(clk), .rst(rst), .start(start),
        .a(a), .b(b), .c(c), .done(done)
    );
    
    task compute_expected;
        integer ii, jj, kk;
        reg [15:0] sum;
        begin
            for (ii = 0; ii < 4; ii = ii + 1) begin
                for (jj = 0; jj < 4; jj = jj + 1) begin
                    sum = 0;
                    for (kk = 0; kk < 4; kk = kk + 1) begin
                        sum = sum + a[ii][kk] * b[kk][jj];
                    end
                    expected[ii][jj] = sum;
                end
            end
        end
    endtask
    
    task check_results;
        begin
            for (i = 0; i < 4; i = i + 1) begin
                for (j = 0; j < 4; j = j + 1) begin
                    if (c[i][j] === expected[i][j]) begin
                        passed = passed + 1;
                        $display("[PASS] c[%0d][%0d]=%0d", i, j, c[i][j]);
                    end else begin
                        failed = failed + 1;
                        $display("[FAIL] c[%0d][%0d]=%h expected=%h actual=%h", 
                                 i, j, expected[i][j], expected[i][j], c[i][j]);
                    end
                end
            end
        end
    endtask
    
    initial begin
        $dumpfile("matmul_tb.vcd");
        $dumpvars(0, matmul_tb);
        
        passed = 0;
        failed = 0;
        rst = 1;
        start = 0;
        
        for (i = 0; i < 4; i = i + 1) begin
            for (j = 0; j < 4; j = j + 1) begin
                a[i][j] = (i == j) ? 1 : 0;
                b[i][j] = (i == j) ? 2 : 0;
            end
        end
        
        compute_expected();
        
        #20 rst = 0;
        #10 start = 1;
        #10 start = 0;
        
        wait(done == 1);
        #10;
        
        $display("=== Test Case 1 ===");
        check_results();
        
        $display("[DONE] passed=%0d failed=%0d", passed, failed);
        
        #100;
        $finish;
    end
endmodule
```

---

## Time Breakdown

| Step | Time | Description |
|------|------|-------------|
| 1 | 10m | Install iverilog + yosys, verify |
| 2 | 5m | Test fixtures (should fail) |
| 3 | 10m | Test parsers |
| 4 | 10m | Test tools |
| 5 | 20m | Test agent loop |
| 6 | 5m | Run server |
| 7 | 30m | Vibe code frontend |
| 8 | 15m | Deploy |
| **Total** | **~1h 45m** | |

---

## Quick Reference

```bash
# Dev
cd fpga-agent/backend
export GOOGLE_API_KEY=xxx
uvicorn main:app --reload --port 8080

# Deploy
docker build -t fpga-agent .
fly launch && fly secrets set GOOGLE_API_KEY=xxx && fly deploy
```
