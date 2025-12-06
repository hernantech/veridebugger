# VeriDebugger - New Features

## Overview

VeriDebugger now includes two major capabilities that move beyond "it looks right" to "it runs right":

1. **Step Debugging** - VCD waveform analysis for root-cause failure detection
2. **Autonomous Test Generation** - LLM-driven testbench creation with verification loops

---

## Step Debugging

### What It Does

When a simulation fails, the agent doesn't just report the error—it analyzes the waveform data to understand *why* it failed.

### How It Works

```
Simulation Fails
      ↓
VCD Waveform Captured
      ↓
Parse Signal Transitions
      ↓
Trace Backwards from Failure
      ↓
Identify Causal Signals
      ↓
LLM Analyzes Trace + Code
      ↓
Suggest Targeted Fix
```

### Technical Details

#### VCD Parser (`vcd_parser.py`)

The VCD (Value Change Dump) parser extracts signal data from simulation waveforms:

```python
from vcd_parser import parse_vcd, trace_failure

# Parse waveform file
waveform = parse_vcd("/path/to/dump.vcd")

# Get signal value at specific time
value = waveform.get_value_at_time("clk", time=100)

# Trace backwards from a failure
causal_chain = trace_failure(
    waveform,
    failure_signal="result",
    failure_time=500,
    window_ns=100  # Look back 100ns
)
```

**Key Features:**
- Parses standard VCD format from iverilog/vvp
- Extracts signal hierarchies and widths
- Queries values at any simulation time
- Finds transitions within time windows
- Traces causal chains for failure analysis

#### Debug Node in Agent

When simulation fails, the agent enters a debug phase:

1. Parses the VCD file generated during simulation
2. Extracts signal transitions around the failure time
3. Builds a "causal chain" of signals that changed before the failure
4. Sends the trace + code to the LLM with a specialized prompt
5. LLM suggests a fix based on the signal behavior

```python
# Example debug analysis prompt context
{
    "failure_signal": "result",
    "failure_time": 500,
    "causal_chain": [
        {"signal": "state", "time_ns": 480, "value": "010", "delta_ns": 20},
        {"signal": "enable", "time_ns": 490, "value": "1", "delta_ns": 10}
    ]
}
```

### API Endpoint

```bash
POST /debug/vcd
Content-Type: application/json

{
    "design_code": "module ...",
    "testbench_code": "module tb; ..."
}

Response:
{
    "passed": false,
    "failures": [...],
    "vcd_path": "/tmp/fpga-agent/dump.vcd",
    "raw_output": "..."
}
```

---

## Autonomous Test Generation

### What It Does

Given only a Verilog module (no testbench), the agent:
1. Extracts the module interface
2. Generates a comprehensive testbench using LLM
3. Runs the full verification loop
4. Iterates until tests pass or optimizes LUT usage

### How It Works

```
Design Code Only
      ↓
Extract Module Interface
      ↓
Detect Clock/Reset/FSM
      ↓
Generate Edge Cases
      ↓
LLM Creates Testbench
      ↓
Run Verification Loop
      ↓
Debug Failures (if any)
      ↓
Optimize & Report
```

### Technical Details

#### Module Analyzer (`module_analyzer.py`)

Extracts structured information from Verilog modules:

```python
from module_analyzer import extract_module_interface, generate_edge_cases

code = """
module counter(
    input wire clk,
    input wire rst,
    input wire [7:0] max_count,
    output reg [7:0] count,
    output reg done
);
"""

interface = extract_module_interface(code)

print(interface.name)        # "counter"
print(interface.has_clock)   # True
print(interface.clock_name)  # "clk"
print(interface.has_reset)   # True

# Get all input ports
for port in interface.inputs:
    print(f"{port.name}: {port.width} bits")

# Generate edge case test values
edge_cases = generate_edge_cases(interface)
# Returns: [
#   {"port": "max_count", "cases": [
#     {"value": 0, "name": "zero"},
#     {"value": 255, "name": "max"},
#     {"value": 1, "name": "one"},
#     ...
#   ]}
# ]
```

**Extracted Information:**
- Module name
- Port declarations (name, direction, width, signed)
- Parameters and localparams
- Clock/reset detection (by naming convention)
- FSM detection (case statements, state registers)

#### Test Generator (`testgen.py`)

Creates testbenches using LLM with structured prompts:

```python
from testgen import generate_testbench, generate_testbench_skeleton

# LLM-generated comprehensive testbench
testbench = generate_testbench(interface)

# Fallback: deterministic skeleton (no LLM)
skeleton = generate_testbench_skeleton(interface)
```

**Generated Testbench Includes:**
- Clock generation (if module has clock)
- Reset sequence (active-high or active-low)
- Edge case tests for all inputs
- Structured output format (`[PASS]`/`[FAIL]`/`[DONE]`)
- VCD dump commands for waveform capture

#### Testgen Agent Flow

The `run_testgen_agent` function orchestrates the full workflow:

```python
async for step in run_testgen_agent(design_code, max_iterations=5):
    print(f"{step['phase']}: {step['reasoning']}")

    if step.get('testbench_code'):
        print(f"Generated testbench: {len(step['testbench_code'])} chars")

    if step.get('lut_history'):
        print(f"LUT count: {step['lut_history'][-1]}")
```

**Workflow Steps:**
1. `testgen/extract_interface` - Parse module
2. `testgen/generate_testbench` - LLM creates tests
3. `testgen/testbench_ready` - Testbench complete
4. `compile` - Compile design + testbench
5. `simulate` - Run tests (with VCD)
6. `debug` - Analyze failures (if any)
7. `synthesize` - Get LUT count
8. `fix` - Optimize (iterate)

### API Endpoints

#### Extract Interface
```bash
POST /testgen/interface
{
    "design_code": "module adder(input [7:0] a, b, output [8:0] sum); ..."
}

Response:
{
    "name": "adder",
    "ports": [
        {"name": "a", "direction": "input", "width": 8},
        {"name": "b", "direction": "input", "width": 8},
        {"name": "sum", "direction": "output", "width": 9}
    ],
    "has_clock": false,
    "has_reset": false,
    "fsm": null
}
```

#### Generate Testbench
```bash
POST /testgen/generate
{
    "design_code": "module ..."
}

Response:
{
    "testbench_code": "`timescale 1ns/1ps\nmodule tb; ...",
    "module_name": "adder",
    "generated_with": "llm"
}
```

#### Full Autonomous Flow (Streaming)
```bash
POST /testgen/start
{
    "design_code": "module ...",
    "max_iterations": 5
}

Response:
{
    "run_id": "abc123",
    "message": "Connect to WebSocket at /testgen/stream/abc123"
}

# Then connect via WebSocket to receive streaming updates
```

#### Full Autonomous Flow (Synchronous)
```bash
POST /testgen/full
{
    "design_code": "module ...",
    "max_iterations": 5
}

Response:
{
    "final_code": "module ... (optimized)",
    "generated_testbench": "`timescale 1ns/1ps ...",
    "interface": {...},
    "lut_history": [45, 42, 38],
    "iterations": 3,
    "reasoning": ["Generated testbench", "Fixed timing issue", ...]
}
```

---

## Agent Workflow Diagram

```
                                    ┌─────────────┐
                                    │   START     │
                                    └──────┬──────┘
                                           │
                              ┌────────────▼────────────┐
                              │      compile_node       │
                              │  (iverilog -Wall)       │
                              └────────────┬────────────┘
                                           │
                         ┌─────── success ─┴─ error ───────┐
                         │                                  │
                         ▼                                  ▼
              ┌──────────────────┐               ┌──────────────────┐
              │  simulate_node   │               │    fix_node      │
              │ (vvp + VCD dump) │               │  (LLM suggests)  │
              └────────┬─────────┘               └────────┬─────────┘
                       │                                  │
          ┌─── pass ───┴─── fail ───┐                     │
          │                         │                     │
          ▼                         ▼                     │
┌──────────────────┐     ┌──────────────────┐            │
│ synthesize_node  │     │   debug_node     │            │
│ (yosys + LUTs)   │     │ (VCD analysis)   │◄───────────┘
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        │
┌──────────────────┐              │
│    fix_node      │              │
│   (optimize)     │──────────────┘
└────────┬─────────┘
         │
         ▼
   ┌───────────┐
   │    END    │
   └───────────┘
```

---

## Example Usage

### Complete Testgen Flow

```python
import asyncio
from agent import run_testgen_agent

# Just provide the design - no testbench needed
design = """
module fibonacci(
    input wire clk,
    input wire rst,
    input wire next,
    output reg [15:0] fib
);
    reg [15:0] prev;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            fib <= 1;
            prev <= 0;
        end else if (next) begin
            fib <= fib + prev;
            prev <= fib;
        end
    end
endmodule
"""

async def main():
    async for step in run_testgen_agent(design, max_iterations=5):
        print(f"[{step['phase']}] {step.get('reasoning', '')[:50]}")

        if step.get('done'):
            print(f"\nFinal LUT count: {step.get('lut_history', [])}")
            break

asyncio.run(main())
```

**Output:**
```
[testgen] Extracting module interface from design
[testgen] Generating testbench for module 'fibonacci'
[testgen] Generated testbench using llm
[simulate] Compilation successful, moving to simulation
[synthesize] All tests passed, moving to synthesis
[optimize] Synthesis complete: 45 LUTs
[compile] Optimizing shift register implementation...
[synthesize] All tests passed, moving to synthesis
[optimize] Synthesis complete: 38 LUTs

Final LUT count: [45, 38]
```

---

## Configuration

### Environment Variables

```bash
# Required for LLM features
GOOGLE_API_KEY=your_gemini_api_key

# Optional: change working directory
# Default: /tmp/fpga-agent
```

### Dependencies

```
# HDL Tools (system)
iverilog    # Verilog compilation
yosys       # Synthesis and LUT estimation

# Python packages
google-generativeai  # Gemini LLM
langgraph           # Agent workflow
fastapi             # API server
```

---

## Limitations

1. **VCD Parsing**: Simple regex-based parser handles standard VCD but may miss edge cases
2. **Module Extraction**: Regex-based; complex SystemVerilog may not parse correctly
3. **Test Generation**: Quality depends on LLM; fallback skeleton is basic
4. **Coverage**: Currently tracks toggle coverage only (no branch/expression)
5. **Formal Verification**: Not implemented - relies on simulation-based testing

---

## Future Improvements

- [ ] FSM state coverage tracking
- [ ] Formal equivalence checking integration
- [ ] Multi-module design support
- [ ] Constraint-based random test generation
- [ ] Coverage-driven test expansion loop
- [ ] SystemVerilog interface/package support
