# VeriDebug - AI-Powered Verilog Debugger & Optimizer

An AI agent that iteratively debugs, tests, and optimizes Verilog/HDL code using Gemini and LangGraph. Supports direct Verilog input or C-to-Verilog conversion via BAMBU HLS.

## Why VeriDebug?

**FPGA development is painful.** Synthesis can take 30+ minutes, error messages are cryptic, and LUT optimization requires deep expertise. The traditional workflow is:

```
write HDL → wait for synthesis → get cryptic error → guess at fix → repeat
```

This cycle is slow, frustrating, and expensive.

### The Problem: LLMs Write Broken HDL

Large language models can generate Verilog, but they make mistakes: undeclared signals, bit-width mismatches, timing issues, blocking vs non-blocking confusion. Raw LLM output rarely compiles on the first try, let alone simulates correctly.

### The Solution: An Agent That Debugs Its Own Mistakes

VeriDebug wraps LLM generation in an agentic loop with **structured error feedback**:

```
write HDL → compile fails → parse error → fix → compile succeeds →
simulate fails → analyze VCD → fix → simulate passes →
synthesize → too many LUTs → optimize → repeat
```

The key innovation is **turning cryptic tool output into LLM-friendly feedback**:

```python
# Instead of raw iverilog output:
"matmul.v:47: error: Unable to bind wire/reg/memory `result_reg[31:0]'"

# The agent gets structured feedback:
{
    "line": 47,
    "type": "binding",
    "message": "Undeclared identifier 'result_reg'",
    "hint": "Declare 'reg [31:0] result_reg' or check spelling"
}
```

### What Makes This Work

1. **Structured error parsing**: Compilation errors, simulation failures, and synthesis results are parsed into machine-readable formats with contextual hints
2. **VCD waveform analysis**: When simulation fails, the agent traces signals backward through time to find the root cause—not just "test failed" but "signal X diverged at cycle 12 because Y was 0 when it should have been 1"
3. **Goal-aware routing**: Different stopping conditions for different use cases (just compile, verify correctness, or optimize for LUTs)
4. **Iterative refinement**: The agent makes targeted edits (not full rewrites), preserving working code while fixing broken parts

### The Result

An agent that can take buggy Verilog, fix compilation errors, debug simulation failures using waveform analysis, and iteratively reduce LUT count—all without human intervention.

## What It Does

VeriDebug uses an AI agent to automatically:
- **Fix compilation errors** in your Verilog code
- **Debug simulation failures** by analyzing VCD waveforms
- **Optimize for fewer LUTs** through iterative refinement
- **Convert C to Verilog** using BAMBU HLS, then debug/optimize the result
- **Generate testbenches** for your designs

## Use Cases

### 1. Optimize Verilog for Fewer LUTs

Paste your Verilog code, provide a testbench, and let the agent iterate until it uses fewer LUTs while passing all tests.

```
1. Paste your Verilog module in the Design Code editor
2. Paste your testbench in the Testbench editor (or click "Auto-generate")
3. Set Goal to "Optimize"
4. Click "Start Optimization"
5. Watch the agent compile → simulate → synthesize → optimize in a loop
6. LUT count decreases with each iteration until convergence
```

The agent will:
- Compile with `iverilog`
- Run simulation with `vvp`
- Synthesize with `yosys` to count LUTs
- Ask Gemini for optimizations
- Apply edits and repeat

### 2. Convert C Code to Verilog

Write bare C code and convert it to synthesizable Verilog using BAMBU HLS.

```
1. Switch language to "C"
2. Write your C function (e.g., matrix multiply, FIR filter)
3. Click "Convert to Verilog"
4. The agent auto-detects your top function and runs BAMBU
5. Result: synthesizable Verilog ready for simulation
```

Example C input:
```c
void fir_filter(int input[8], int coeffs[8], int *output) {
    int sum = 0;
    for (int i = 0; i < 8; i++) {
        sum += input[i] * coeffs[i];
    }
    *output = sum;
}
```

### 3. Debug Failing Simulations

If your testbench fails, the agent analyzes VCD waveforms to find the root cause.

```
1. Paste buggy Verilog + testbench
2. Set Goal to "Verify"
3. Click "Start"
4. Agent compiles, simulates, captures VCD
5. On failure: traces signals backward to find the bug
6. Gemini analyzes the signal trace and suggests a fix
7. Agent applies fix and re-runs until tests pass
```

### 4. Just Compile (Syntax Check)

Set Goal to "Compile" to only fix syntax errors without running simulation.

### 5. Auto-Generate Testbenches

Click "Auto-generate Testbench" to create a testbench from your module's interface. The agent extracts ports, clock/reset signals, and generates appropriate test vectors.

## Architecture: LangGraph Agent

The backend uses [LangGraph](https://github.com/langchain-ai/langgraph) to orchestrate a multi-phase debugging workflow.

### State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                      LangGraph Agent                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐    ┌──────────┐    ┌────────────┐            │
│   │ COMPILE │───►│ SIMULATE │───►│ SYNTHESIZE │            │
│   └────┬────┘    └────┬─────┘    └─────┬──────┘            │
│        │              │                │                    │
│        │ errors       │ failures       │ success            │
│        ▼              ▼                ▼                    │
│   ┌─────────┐    ┌─────────┐     ┌──────────┐              │
│   │   FIX   │◄───│  DEBUG  │     │ OPTIMIZE │              │
│   │ (Gemini)│    │  (VCD)  │     │ (Gemini) │              │
│   └────┬────┘    └─────────┘     └────┬─────┘              │
│        │                              │                     │
│        └──────────────────────────────┘                     │
│                    loop until done                          │
└─────────────────────────────────────────────────────────────┘
```

### Nodes (Phases)

| Node | Tool Used | Description |
|------|-----------|-------------|
| `compile` | `iverilog` | Compile Verilog, collect errors |
| `simulate` | `vvp` | Run testbench, capture VCD waveforms |
| `debug` | VCD parser | Trace signals backward from failure point |
| `synthesize` | `yosys` | Estimate LUT/cell count |
| `fix` | Gemini API | Generate code edits based on errors |
| `optimize` | Gemini API | Suggest LUT-reducing transformations |

### Goal-Aware Routing

The agent's behavior changes based on the selected goal:

- **`compile`**: Stop after successful compilation
- **`verify`**: Stop after all tests pass
- **`optimize`**: Continue iterating to reduce LUTs until convergence

### Error-Specific Prompts

The agent uses specialized prompts for different error types:
- **Syntax errors**: Focus on semicolons, begin/end matching
- **Binding errors**: Focus on undeclared signals, typos
- **Logic errors**: Analyze VCD trace, explain signal behavior

## Project Structure

```
veridebugger/
├── backend/
│   ├── agent.py          # LangGraph state machine
│   ├── tools.py          # iverilog, yosys, BAMBU wrappers
│   ├── parsers.py        # Parse tool outputs
│   ├── module_analyzer.py # Extract Verilog interfaces
│   ├── testgen.py        # Auto-generate testbenches
│   ├── vcd_parser.py     # Parse VCD waveforms
│   └── main.py           # FastAPI endpoints
├── src/                   # React frontend
│   ├── components/
│   ├── store/            # Zustand state
│   └── api/              # Backend API client
├── package.json          # Frontend deps
└── vercel.json           # Vercel deployment config
```

## Installation

### Backend

```bash
cd backend

# Install Python deps
pip install -r requirements.txt

# Install HDL tools
sudo apt install iverilog yosys

# Install BAMBU HLS (for C-to-Verilog)
# See: https://panda.dei.polimi.it/?page_id=31

# Set API key
export GOOGLE_API_KEY=your_gemini_api_key

# Run
uvicorn main:app --reload --port 8080
```

### Frontend

```bash
# Install deps
npm install

# Configure backend URL
cp .env.example .env
# Edit .env with your backend URL

# Run dev server
npm run dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/start` | POST | Start optimization run |
| `/stream/{run_id}` | WS | Stream agent progress |
| `/convert` | POST | Convert C to Verilog |
| `/testgen/generate` | POST | Generate testbench |
| `/testgen/interface` | POST | Extract module interface |

## Environment Variables

### Frontend (`.env`)
```
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

### Backend
```
GOOGLE_API_KEY=your_gemini_api_key
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Zustand, Monaco Editor
- **Backend**: FastAPI, LangGraph, Google Gemini API
- **HDL Tools**: Icarus Verilog (iverilog), Yosys, BAMBU HLS

## License

MIT
