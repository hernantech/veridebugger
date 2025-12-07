"""
LangGraph agent for iterative HDL debugging, optimization, and test generation.
"""

import os
import json
from typing import Literal, TypedDict
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
import google.generativeai as genai

from tools import execute_tool

# Load environment variables from .env file
load_dotenv()

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))


class AgentState(TypedDict):
    design_code: str
    testbench_code: str
    phase: Literal["compile", "simulate", "synthesize", "optimize", "debug", "done"]
    compile_result: dict | None
    sim_result: dict | None
    synth_result: dict | None
    lut_history: list[int]
    iterations: int
    max_iterations: int
    reasoning: list[str]
    error: str | None
    # Debug/VCD fields
    vcd_path: str | None
    debug_trace: list[dict] | None
    # Testgen fields
    generated_testbench: str | None
    interface_info: dict | None
    # Improvement 1: Iteration tracking
    phase_history: list[str]
    goal: str


SYSTEM_PROMPT = """You are an expert FPGA engineer debugging and optimizing Verilog code.

Your task is to fix HDL code errors. When given compilation errors, provide fixes.

You MUST respond with this EXACT JSON structure:
{
    "reasoning": "Brief explanation of what you're fixing",
    "edit": {
        "edit_type": "replace",
        "line_start": <line number to start replacing>,
        "line_end": <line number to end replacing, or same as line_start for single line>,
        "new_content": "<the new code to insert>"
    }
}

Example - to add a missing declaration after line 10:
{
    "reasoning": "Adding missing state register declaration",
    "edit": {
        "edit_type": "replace",
        "line_start": 11,
        "line_end": 11,
        "new_content": "    reg [2:0] state;\\n"
    }
}
"""

# Error-specific prompts for different error types
ERROR_PROMPTS = {
    "syntax": """SYNTAX ERROR DETECTED

The code has syntax errors (missing semicolons, mismatched begin/end, invalid keywords).

Common fixes:
- Add missing semicolons at end of statements
- Match every 'begin' with 'end'
- Check for typos in keywords (assign, wire, reg, etc.)
- Ensure parentheses and brackets are balanced

Errors:
{errors}

Fix the syntax errors by providing an edit.""",

    "binding": """BINDING/UNDECLARED ERROR DETECTED

The code references undeclared signals or has binding issues.

Common fixes:
- Declare missing signals as 'wire' or 'reg'
- Check signal names for typos
- Ensure signals are declared before use
- Verify port connections in module instantiations

Errors:
{errors}

Fix the binding errors by providing an edit.""",

    "logic": """LOGIC ERROR DETECTED

The simulation is failing - the logic doesn't match expected behavior.

Common issues:
- Incorrect combinational logic
- Missing or wrong sequential logic (clock/reset)
- Off-by-one errors in counters or state machines
- Wrong bit-width assignments

Test failures:
{errors}

Raw simulation output:
{raw}

Analyze the failures and fix the logic error by providing an edit."""
}


def add_line_numbers(code: str) -> str:
    lines = code.split('\n')
    return '\n'.join(f"{i+1:3d}| {line}" for i, line in enumerate(lines))


def call_llm(state: AgentState, context: str) -> dict:
    model = genai.GenerativeModel('gemini-2.0-flash')

    message = f"""{SYSTEM_PROMPT}

Current Verilog code (with line numbers):
```verilog
{add_line_numbers(state["design_code"])}
```

{context}

Respond with the exact JSON format specified above. Include "reasoning" and "edit" fields."""

    response = model.generate_content(
        [{"role": "user", "parts": [message]}],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json"
        )
    )

    try:
        result = json.loads(response.text)
        # Ensure we always return a dict
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            return {"error": "LLM returned non-dict response", "raw": response.text}
        return result
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return {"error": "Failed to parse LLM response", "raw": response.text}


def compile_node(state: AgentState) -> dict:
    result = execute_tool("compile_verilog", {"code": state["design_code"]})

    reasoning = list(state["reasoning"])
    phase_history = list(state.get("phase_history", []))
    phase_history.append("compile")

    if result["success"]:
        reasoning.append("Compilation successful, moving to simulation")
        return {
            "compile_result": result,
            "phase": "simulate",
            "reasoning": reasoning,
            "phase_history": phase_history
        }
    else:
        reasoning.append(f"Compilation failed with {len(result['errors'])} errors")
        return {
            "compile_result": result,
            "reasoning": reasoning,
            "phase_history": phase_history
        }


def simulate_node(state: AgentState) -> dict:
    # Use VCD simulation to capture waveforms for debugging
    result = execute_tool("simulate_with_vcd", {
        "design_code": state["design_code"],
        "testbench_code": state["testbench_code"]
    })

    reasoning = list(state["reasoning"])
    phase_history = list(state.get("phase_history", []))
    phase_history.append("simulate")
    vcd_path = result.get("vcd_path")

    if result["passed"]:
        reasoning.append("All tests passed, moving to synthesis")
        return {
            "sim_result": result,
            "vcd_path": vcd_path,
            "phase": "synthesize",
            "reasoning": reasoning,
            "phase_history": phase_history
        }
    else:
        reasoning.append(f"Simulation failed with {len(result.get('failures', []))} failures")
        return {
            "sim_result": result,
            "vcd_path": vcd_path,
            "phase": "debug",  # Go to debug phase on failure
            "reasoning": reasoning,
            "phase_history": phase_history
        }


def synthesize_node(state: AgentState) -> dict:
    result = execute_tool("estimate_resources", {"code": state["design_code"], "target": "generic"})

    reasoning = list(state["reasoning"])
    phase_history = list(state.get("phase_history", []))
    phase_history.append("synthesize")
    lut_history = list(state["lut_history"])

    if result["success"] and result["luts"]:
        lut_history.append(result["luts"])
        reasoning.append(f"Synthesis complete: {result['luts']} LUTs")
        return {
            "synth_result": result,
            "lut_history": lut_history,
            "phase": "optimize",
            "reasoning": reasoning,
            "phase_history": phase_history
        }
    else:
        reasoning.append(f"Synthesis failed: {result.get('errors', [])}")
        return {
            "synth_result": result,
            "reasoning": reasoning,
            "phase_history": phase_history
        }


def fix_node(state: AgentState) -> dict:
    iterations = state["iterations"] + 1
    reasoning = list(state["reasoning"])
    phase_history = list(state.get("phase_history", []))
    phase_history.append("fix")

    if iterations > state["max_iterations"]:
        return {
            "iterations": iterations,
            "phase": "done",
            "error": "Max iterations reached",
            "phase_history": phase_history
        }

    phase = state["phase"]
    if phase == "compile" and state["compile_result"]:
        errors = state["compile_result"].get("errors", [])
        # Classify error type from first error
        error_type = "syntax"
        if errors and isinstance(errors, list) and len(errors) > 0:
            first_error = errors[0]
            if isinstance(first_error, dict):
                error_type = first_error.get("type", "syntax")

        # Use error-specific prompt
        if error_type in ERROR_PROMPTS:
            context = ERROR_PROMPTS[error_type].format(errors=json.dumps(errors, indent=2), raw="")
        else:
            context = f"Compilation errors:\n{json.dumps(errors, indent=2)}\n\nFix these errors by providing an edit."
    elif phase == "simulate" and state["sim_result"]:
        failures = state["sim_result"].get("failures", [])
        raw = state["sim_result"].get("raw_output", "")
        # Use logic error prompt
        context = ERROR_PROMPTS["logic"].format(errors=json.dumps(failures, indent=2), raw=raw[:500])
    elif phase == "optimize":
        context = f"""Current LUT count: {state["synth_result"]["luts"]}
LUT history: {state["lut_history"]}

Optimize the design to reduce LUT count while maintaining correctness. Provide an edit."""
    else:
        context = "Analyze the code and suggest improvements with an edit."

    response = call_llm(state, context)

    if "error" in response:
        reasoning.append(response.get("reasoning", response["error"]))
        return {
            "iterations": iterations,
            "error": response["error"],
            "reasoning": reasoning,
            "phase_history": phase_history
        }

    reasoning.append(response.get("reasoning", ""))

    # Check for edit action
    if "edit" in response:
        edit = response["edit"]
        edited = execute_tool("edit_code", {
            "original": state["design_code"],
            "edit_type": edit.get("edit_type", "replace"),
            "line_start": edit.get("line_start", 1),
            "line_end": edit.get("line_end"),
            "new_content": edit.get("new_content", "")
        })

        new_phase = "compile" if phase == "optimize" else phase
        return {
            "iterations": iterations,
            "design_code": edited["edited_code"],
            "phase": new_phase,
            "reasoning": reasoning,
            "phase_history": phase_history
        }

    return {
        "iterations": iterations,
        "reasoning": reasoning,
        "phase_history": phase_history
    }


DEBUG_ANALYSIS_PROMPT = """You are analyzing a simulation failure using VCD waveform data.

## Failure Context
The simulation failed. Here is the raw output:
{raw_output}

## Causal Signal Trace
These signals changed around the time of failure:
{causal_chain}

## Design Code (with line numbers)
```verilog
{design_code}
```

## Your Task
1. Analyze which signal transitions led to the failure
2. Identify the root cause in the code
3. Provide a fix

Respond with JSON:
{{
    "reasoning": "Explanation of the bug and how signal trace reveals it",
    "root_cause": "Brief description of the bug",
    "edit": {{
        "edit_type": "replace",
        "line_start": <line number>,
        "line_end": <line number>,
        "new_content": "<fixed code>"
    }}
}}
"""


def debug_node(state: AgentState) -> dict:
    """Analyze VCD waveform to understand simulation failures."""
    reasoning = list(state["reasoning"])
    phase_history = list(state.get("phase_history", []))
    phase_history.append("debug")
    iterations = state["iterations"] + 1

    if iterations > state["max_iterations"]:
        return {
            "iterations": iterations,
            "phase": "done",
            "error": "Max iterations reached during debugging",
            "phase_history": phase_history
        }

    vcd_path = state.get("vcd_path")
    sim_result = state.get("sim_result", {})

    # If we have VCD, analyze it
    causal_chain = []
    if vcd_path:
        try:
            vcd_summary = execute_tool("analyze_vcd", {"vcd_path": vcd_path})
            # Try to trace the first failure
            failures = sim_result.get("failures", [])
            if failures:
                first_fail = failures[0]
                trace = execute_tool("trace_failure", {
                    "vcd_path": vcd_path,
                    "signal": first_fail.get("signal", ""),
                    "time": first_fail.get("time_ns", 0) or 0
                })
                causal_chain = trace.get("causal_chain", [])
        except Exception as e:
            reasoning.append(f"VCD analysis failed: {e}")

    # Call LLM with debug context
    model = genai.GenerativeModel('gemini-2.0-flash')

    prompt = DEBUG_ANALYSIS_PROMPT.format(
        raw_output=sim_result.get("raw_output", "")[:2000],
        causal_chain=json.dumps(causal_chain[:10], indent=2) if causal_chain else "No trace available",
        design_code=add_line_numbers(state["design_code"])
    )

    response = model.generate_content(
        [{"role": "user", "parts": [prompt]}],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json"
        )
    )

    try:
        result = json.loads(response.text)
        if isinstance(result, list):
            result = result[0] if result else {}
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if match:
            result = json.loads(match.group())
        else:
            reasoning.append("Failed to parse debug analysis")
            return {
                "iterations": iterations,
                "reasoning": reasoning,
                "phase": "simulate"  # Retry simulation
            }

    reasoning.append(f"Debug: {result.get('reasoning', result.get('root_cause', 'Analysis complete'))}")

    # Apply fix if provided
    if "edit" in result:
        edit = result["edit"]
        edited = execute_tool("edit_code", {
            "original": state["design_code"],
            "edit_type": edit.get("edit_type", "replace"),
            "line_start": edit.get("line_start", 1),
            "line_end": edit.get("line_end"),
            "new_content": edit.get("new_content", "")
        })

        return {
            "iterations": iterations,
            "design_code": edited["edited_code"],
            "debug_trace": causal_chain,
            "phase": "compile",  # Go back to compile to verify fix
            "reasoning": reasoning,
            "phase_history": phase_history
        }

    return {
        "iterations": iterations,
        "debug_trace": causal_chain,
        "reasoning": reasoning,
        "phase": "simulate",
        "phase_history": phase_history
    }


def should_continue(state: AgentState) -> Literal["fix", "debug", "compile", "simulate", "synthesize", "end"]:
    if state.get("error") or state["phase"] == "done":
        return "end"

    if state.get("iterations", 0) >= state.get("max_iterations", 10):
        return "end"

    phase = state["phase"]
    goal = state.get("goal", "optimize")

    if phase == "compile":
        if state["compile_result"] and state["compile_result"]["success"]:
            # Goal: compile - stop after successful compilation
            if goal == "compile":
                return "end"
            return "simulate"
        elif state["compile_result"]:
            return "fix"
        else:
            return "compile"

    elif phase == "simulate":
        if state.get("sim_result") and state["sim_result"].get("passed"):
            # Goal: verify - stop after all tests pass
            if goal == "verify":
                return "end"
            return "synthesize"
        elif state.get("sim_result"):
            return "debug"  # Go to debug on failure
        else:
            return "simulate"

    elif phase == "debug":
        # After debug analysis, go back to compile to verify fix
        return "compile"

    elif phase == "synthesize":
        if state["synth_result"] and state["synth_result"]["success"]:
            # Goal: optimize - continue to optimization
            if goal == "optimize":
                return "fix"
            # Other goals stop after synthesis
            return "end"
        elif state["synth_result"]:
            return "fix"
        else:
            return "synthesize"

    elif phase == "optimize":
        lut_history = state["lut_history"]
        if len(lut_history) >= 3:
            if len(lut_history) >= 2 and lut_history[-1] >= lut_history[-2]:
                return "end"
        return "fix"

    return "end"


def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("compile", compile_node)
    workflow.add_node("simulate", simulate_node)
    workflow.add_node("synthesize", synthesize_node)
    workflow.add_node("fix", fix_node)
    workflow.add_node("debug", debug_node)

    workflow.set_entry_point("compile")

    # All nodes can potentially transition to any other node based on state
    # Include all possible should_continue return values in each mapping
    all_routes = {
        "compile": "compile",
        "simulate": "simulate",
        "synthesize": "synthesize",
        "fix": "fix",
        "debug": "debug",
        "end": END
    }

    workflow.add_conditional_edges("compile", should_continue, all_routes)
    workflow.add_conditional_edges("simulate", should_continue, all_routes)
    workflow.add_conditional_edges("debug", should_continue, all_routes)
    workflow.add_conditional_edges("synthesize", should_continue, all_routes)
    workflow.add_conditional_edges("fix", should_continue, all_routes)

    return workflow.compile()


async def run_agent(design_code: str, testbench_code: str, max_iterations: int = 10, goal: str = "optimize"):
    """Run the debugging/optimization agent and yield steps."""
    graph = build_graph()

    initial_state: AgentState = {
        "design_code": design_code,
        "testbench_code": testbench_code,
        "phase": "compile",
        "compile_result": None,
        "sim_result": None,
        "synth_result": None,
        "lut_history": [],
        "iterations": 0,
        "max_iterations": max_iterations,
        "reasoning": [],
        "error": None,
        "vcd_path": None,
        "debug_trace": None,
        "generated_testbench": None,
        "interface_info": None,
        "phase_history": [],
        "goal": goal
    }

    try:
        # Set recursion limit high enough for max_iterations * steps_per_iteration
        config = {"recursion_limit": max(50, max_iterations * 5)}
        final_state = graph.invoke(initial_state, config)

        yield {
            "phase": final_state["phase"],
            "action": "complete",
            "reasoning": final_state["reasoning"][-1] if final_state["reasoning"] else "",
            "code": final_state["design_code"],
            "result": final_state["compile_result"] or final_state["sim_result"] or final_state["synth_result"],
            "lut_history": final_state["lut_history"],
            "iteration": final_state["iterations"],
            "done": True
        }
    except Exception as e:
        yield {
            "phase": "done",
            "action": "error",
            "reasoning": str(e),
            "code": design_code,
            "result": None,
            "lut_history": [],
            "iteration": 0,
            "done": True
        }


async def run_agent_streaming(design_code: str, testbench_code: str, max_iterations: int = 10, goal: str = "optimize"):
    """Run the agent with streaming updates at each step."""
    graph = build_graph()

    initial_state: AgentState = {
        "design_code": design_code,
        "testbench_code": testbench_code,
        "phase": "compile",
        "compile_result": None,
        "sim_result": None,
        "synth_result": None,
        "lut_history": [],
        "iterations": 0,
        "max_iterations": max_iterations,
        "reasoning": [],
        "error": None,
        "vcd_path": None,
        "debug_trace": None,
        "generated_testbench": None,
        "interface_info": None,
        "phase_history": [],
        "goal": goal
    }

    try:
        # Set recursion limit high enough for max_iterations * steps_per_iteration
        config = {"recursion_limit": max(50, max_iterations * 5)}
        for output in graph.stream(initial_state, config):
            if isinstance(output, dict):
                for node_name, node_state in output.items():
                    if isinstance(node_state, dict):
                        # Calculate errors before/after
                        result = node_state.get("compile_result") or node_state.get("sim_result") or node_state.get("synth_result")
                        errors_before = 0
                        errors_after = 0

                        if node_state.get("compile_result"):
                            errors_after = len(node_state["compile_result"].get("errors", []))
                        elif node_state.get("sim_result"):
                            errors_after = len(node_state["sim_result"].get("failures", []))

                        # Merge with current state knowledge
                        yield {
                            "phase": node_state.get("phase", "unknown"),
                            "action": node_name,
                            "reasoning": node_state.get("reasoning", [""])[-1] if node_state.get("reasoning") else "",
                            "code": node_state.get("design_code", design_code),
                            "result": result,
                            "lut_history": node_state.get("lut_history", []),
                            "iteration": node_state.get("iterations", 0),
                            "vcd_path": node_state.get("vcd_path"),
                            "debug_trace": node_state.get("debug_trace"),
                            "phase_history": node_state.get("phase_history", []),
                            "errors_after": errors_after,
                            "done": node_state.get("phase") == "done"
                        }
    except Exception as e:
        yield {
            "phase": "done",
            "action": "error",
            "reasoning": str(e),
            "code": design_code,
            "result": None,
            "lut_history": [],
            "iteration": 0,
            "phase_history": [],
            "errors_after": 0,
            "done": True
        }


async def run_testgen_agent(design_code: str, max_iterations: int = 3):
    """
    Generate a testbench for the design, then run the full debug loop.
    This is a complete agentic workflow: generate tests → run → debug → optimize.
    """
    # Step 1: Extract interface and generate testbench
    yield {
        "phase": "testgen",
        "action": "extract_interface",
        "reasoning": "Extracting module interface from design",
        "done": False
    }

    interface = execute_tool("extract_interface", {"design_code": design_code})
    if "error" in interface:
        yield {
            "phase": "done",
            "action": "error",
            "reasoning": f"Failed to extract interface: {interface['error']}",
            "done": True
        }
        return

    yield {
        "phase": "testgen",
        "action": "generate_testbench",
        "reasoning": f"Generating testbench for module '{interface.get('name', 'unknown')}'",
        "interface": interface,
        "done": False
    }

    tb_result = execute_tool("generate_testbench", {"design_code": design_code, "use_llm": True})
    if "error" in tb_result:
        yield {
            "phase": "done",
            "action": "error",
            "reasoning": f"Failed to generate testbench: {tb_result['error']}",
            "done": True
        }
        return

    testbench_code = tb_result["testbench_code"]

    yield {
        "phase": "testgen",
        "action": "testbench_ready",
        "reasoning": f"Generated testbench using {tb_result.get('generated_with', 'llm')}",
        "testbench_code": testbench_code,
        "done": False
    }

    # Step 2: Run the main debug/optimize agent with generated testbench
    async for step in run_agent_streaming(design_code, testbench_code, max_iterations):
        # Pass through all steps, adding testgen context
        step["generated_testbench"] = testbench_code
        step["interface"] = interface
        yield step


if __name__ == "__main__":
    import asyncio

    # Test with buggy matmul
    with open('../fixtures/matmul_buggy.v') as f:
        design = f.read()
    with open('../fixtures/matmul_tb.v') as f:
        tb = f.read()

    async def test():
        print("Starting agent...")
        async for step in run_agent(design, tb, max_iterations=5):
            print(f"[{step['iteration']}] {step['phase']}: {step['reasoning'][:60] if step['reasoning'] else 'N/A'}...")
            if step['done']:
                print("\nFinal LUT history:", step['lut_history'])
                break

    asyncio.run(test())
