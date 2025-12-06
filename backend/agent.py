"""
LangGraph agent for iterative HDL debugging and optimization.
"""

import os
import json
from typing import Literal, TypedDict, Annotated
import operator
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
    phase: Literal["compile", "simulate", "synthesize", "optimize", "done"]
    compile_result: dict | None
    sim_result: dict | None
    synth_result: dict | None
    lut_history: list[int]
    iterations: int
    max_iterations: int
    reasoning: list[str]
    error: str | None


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
    if result["success"]:
        reasoning.append("Compilation successful, moving to simulation")
        return {
            "compile_result": result,
            "phase": "simulate",
            "reasoning": reasoning
        }
    else:
        reasoning.append(f"Compilation failed with {len(result['errors'])} errors")
        return {
            "compile_result": result,
            "reasoning": reasoning
        }


def simulate_node(state: AgentState) -> dict:
    result = execute_tool("simulate", {
        "design_code": state["design_code"],
        "testbench_code": state["testbench_code"]
    })

    reasoning = list(state["reasoning"])
    if result["passed"]:
        reasoning.append("All tests passed, moving to synthesis")
        return {
            "sim_result": result,
            "phase": "synthesize",
            "reasoning": reasoning
        }
    else:
        reasoning.append(f"Simulation failed with {len(result['failures'])} failures")
        return {
            "sim_result": result,
            "reasoning": reasoning
        }


def synthesize_node(state: AgentState) -> dict:
    result = execute_tool("estimate_resources", {"code": state["design_code"], "target": "generic"})

    reasoning = list(state["reasoning"])
    lut_history = list(state["lut_history"])

    if result["success"] and result["luts"]:
        lut_history.append(result["luts"])
        reasoning.append(f"Synthesis complete: {result['luts']} LUTs")
        return {
            "synth_result": result,
            "lut_history": lut_history,
            "phase": "optimize",
            "reasoning": reasoning
        }
    else:
        reasoning.append(f"Synthesis failed: {result.get('errors', [])}")
        return {
            "synth_result": result,
            "reasoning": reasoning
        }


def fix_node(state: AgentState) -> dict:
    iterations = state["iterations"] + 1
    reasoning = list(state["reasoning"])

    if iterations > state["max_iterations"]:
        return {
            "iterations": iterations,
            "phase": "done",
            "error": "Max iterations reached"
        }

    phase = state["phase"]
    if phase == "compile" and state["compile_result"]:
        errors = state["compile_result"].get("errors", [])
        context = f"Compilation errors:\n{json.dumps(errors, indent=2)}\n\nFix these errors by providing an edit."
    elif phase == "simulate" and state["sim_result"]:
        failures = state["sim_result"].get("failures", [])
        raw = state["sim_result"].get("raw_output", "")
        context = f"Simulation failures:\n{json.dumps(failures, indent=2)}\n\nRaw output:\n{raw}\n\nFix the logic errors by providing an edit."
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
            "reasoning": reasoning
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
            "reasoning": reasoning
        }

    return {
        "iterations": iterations,
        "reasoning": reasoning
    }


def should_continue(state: AgentState) -> Literal["fix", "compile", "simulate", "synthesize", "end"]:
    if state.get("error") or state["phase"] == "done":
        return "end"

    if state["iterations"] >= state["max_iterations"]:
        return "end"

    phase = state["phase"]

    if phase == "compile":
        if state["compile_result"] and state["compile_result"]["success"]:
            return "simulate"
        elif state["compile_result"]:
            return "fix"
        else:
            return "compile"

    elif phase == "simulate":
        if state["sim_result"] and state["sim_result"]["passed"]:
            return "synthesize"
        elif state["sim_result"]:
            return "fix"
        else:
            return "simulate"

    elif phase == "synthesize":
        if state["synth_result"] and state["synth_result"]["success"]:
            return "fix"
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
        "error": None
    }

    try:
        final_state = graph.invoke(initial_state)

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


async def run_agent_streaming(design_code: str, testbench_code: str, max_iterations: int = 10):
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
        "error": None
    }

    try:
        for output in graph.stream(initial_state):
            if isinstance(output, dict):
                for node_name, node_state in output.items():
                    if isinstance(node_state, dict):
                        # Merge with current state knowledge
                        yield {
                            "phase": node_state.get("phase", "unknown"),
                            "action": node_name,
                            "reasoning": node_state.get("reasoning", [""])[-1] if node_state.get("reasoning") else "",
                            "code": node_state.get("design_code", design_code),
                            "result": node_state.get("compile_result") or node_state.get("sim_result") or node_state.get("synth_result"),
                            "lut_history": node_state.get("lut_history", []),
                            "iteration": node_state.get("iterations", 0),
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
            "done": True
        }


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
