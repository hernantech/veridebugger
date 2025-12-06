"""
LangGraph agent for iterative Verilog optimization.
"""
import re
import os
from typing import TypedDict, Annotated, Literal
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI

from tools import simulate, estimate_luts
from prompts import SYSTEM_PROMPT, INITIAL_PROMPT, ITERATION_PROMPT, TESTBENCH_4X4

load_dotenv()


class AgentState(TypedDict):
    """State for the optimization agent."""
    iteration: int
    max_iterations: int
    current_code: str
    best_code: str
    lut_count: int
    best_lut_count: int
    lut_history: list[int]
    sim_passed: bool
    error: str | None
    agent_reasoning: str
    state: Literal["generating", "simulating", "estimating", "complete", "failed"]


def extract_verilog_code(response: str) -> str | None:
    """Extract Verilog code from LLM response."""
    # Try to find code block
    pattern = r"```(?:verilog)?\s*(module[\s\S]*?endmodule)\s*```"
    match = re.search(pattern, response, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Fallback: look for module...endmodule
    pattern = r"(module\s+\w+[\s\S]*?endmodule)"
    match = re.search(pattern, response, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    return None


def extract_reasoning(response: str) -> str:
    """Extract reasoning from LLM response."""
    pattern = r"REASONING:\s*([\s\S]*?)(?:CODE:|```)"
    match = re.search(pattern, response, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return response[:500]  # Fallback to first 500 chars


def create_llm():
    """Create the Gemini LLM instance."""
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        temperature=0.7,
    )


def generate_code(state: AgentState) -> AgentState:
    """Generate or improve Verilog code."""
    llm = create_llm()

    if state["iteration"] == 0:
        # Initial generation
        prompt = INITIAL_PROMPT
    else:
        # Improvement iteration
        error_context = ""
        if state["error"]:
            error_context = f"Previous error: {state['error']}\nPlease fix this issue."
        elif not state["sim_passed"]:
            error_context = "Previous code failed simulation. Please fix the functionality."

        prompt = ITERATION_PROMPT.format(
            iteration=state["iteration"],
            max_iterations=state["max_iterations"],
            prev_lut_count=state["lut_count"] or "N/A",
            best_lut_count=state["best_lut_count"] or "N/A",
            lut_history=state["lut_history"],
            previous_code=state["current_code"] or "None",
            error_context=error_context
        )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt}
    ]

    response = llm.invoke(messages)
    response_text = response.content

    code = extract_verilog_code(response_text)
    reasoning = extract_reasoning(response_text)

    if not code:
        return {
            **state,
            "state": "failed",
            "error": "Failed to extract Verilog code from LLM response",
            "agent_reasoning": reasoning
        }

    return {
        **state,
        "current_code": code,
        "agent_reasoning": reasoning,
        "state": "simulating",
        "error": None
    }


def run_simulation(state: AgentState) -> AgentState:
    """Run simulation on current code."""
    result = simulate(state["current_code"], TESTBENCH_4X4)

    return {
        **state,
        "sim_passed": result["passed"],
        "error": result["error"] if not result["passed"] else None,
        "state": "estimating" if result["passed"] else "generating"
    }


def estimate_resources(state: AgentState) -> AgentState:
    """Estimate LUT usage."""
    result = estimate_luts(state["current_code"])

    if result["error"]:
        return {
            **state,
            "error": result["error"],
            "state": "generating"  # Try again
        }

    lut_count = result["lut_count"]
    lut_history = state["lut_history"] + [lut_count]

    # Update best if this is better
    best_code = state["best_code"]
    best_lut_count = state["best_lut_count"]

    if best_lut_count is None or lut_count < best_lut_count:
        best_code = state["current_code"]
        best_lut_count = lut_count

    # Check if we should continue
    iteration = state["iteration"] + 1
    if iteration >= state["max_iterations"]:
        next_state = "complete"
    else:
        next_state = "generating"

    return {
        **state,
        "iteration": iteration,
        "lut_count": lut_count,
        "lut_history": lut_history,
        "best_code": best_code,
        "best_lut_count": best_lut_count,
        "state": next_state
    }


def should_continue(state: AgentState) -> Literal["generate", "simulate", "estimate", "end"]:
    """Determine next step based on state."""
    if state["state"] == "complete" or state["state"] == "failed":
        return "end"
    elif state["state"] == "generating":
        return "generate"
    elif state["state"] == "simulating":
        return "simulate"
    elif state["state"] == "estimating":
        return "estimate"
    return "end"


def create_agent_graph():
    """Create the LangGraph agent."""
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("generate", generate_code)
    workflow.add_node("simulate", run_simulation)
    workflow.add_node("estimate", estimate_resources)

    # Add conditional edges
    workflow.add_conditional_edges(
        "__start__",
        should_continue,
        {
            "generate": "generate",
            "end": END
        }
    )

    workflow.add_conditional_edges(
        "generate",
        should_continue,
        {
            "simulate": "simulate",
            "generate": "generate",  # Retry on extraction failure
            "end": END
        }
    )

    workflow.add_conditional_edges(
        "simulate",
        should_continue,
        {
            "estimating": "estimate",
            "generate": "generate",  # Retry on sim failure
            "estimate": "estimate",
            "end": END
        }
    )

    workflow.add_conditional_edges(
        "estimate",
        should_continue,
        {
            "generate": "generate",
            "end": END
        }
    )

    return workflow.compile()


def run_optimization(max_iterations: int = 5) -> AgentState:
    """Run the optimization loop."""
    agent = create_agent_graph()

    initial_state: AgentState = {
        "iteration": 0,
        "max_iterations": max_iterations,
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

    final_state = agent.invoke(initial_state)
    return final_state


if __name__ == "__main__":
    print("Running optimization agent...")
    result = run_optimization(max_iterations=3)
    print(f"\nFinal state: {result['state']}")
    print(f"Iterations: {result['iteration']}")
    print(f"Best LUT count: {result['best_lut_count']}")
    print(f"LUT history: {result['lut_history']}")
