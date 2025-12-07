# Veridebug Implementation Plan: From "It Looks Right" to "It Runs Right"

## Executive Summary

Your current system has a solid foundation but is missing the **verification loops** and **proof-driven reasoning** that would make it truly autonomous and high-confidence. This plan transforms the system from a "fix-and-hope" approach to a rigorous "prove-it-works" approach.

---

## Part 1: Gap Analysis

### What Currently Exists

| Component | Status | Location |
|-----------|--------|----------|
| State machine (compile→sim→synth→optimize) | ✅ Works | `agent.py:522-550` |
| Error-specific prompts | ✅ Partial | `prompts.py:72-120`, `agent.py:72-120` |
| VCD debugging | ✅ Basic | `agent.py:330-461` |
| LLM testbench generation | ✅ Basic | `testgen.py:68-89` |
| Goal-aware routing | ✅ Works | `agent.py:464-519` |

### Critical Gaps Identified

#### Gap 1: No Proof/Verification Loop
**Current**: Tests pass → assume correct
**Needed**: Tests pass → generate more tests → prove coverage → confidence score

**Evidence**: `fix_node` at line 248 just calls the LLM and applies edits. No verification that the fix actually works beyond re-running the same tests.

#### Gap 2: Prompts Lack Verification Strategy
**Current**: `SYSTEM_PROMPT` (line 44-69) is a generic "fix errors" prompt
**Needed**: Structured reasoning that asks for:
- Preconditions/postconditions
- Invariants
- Edge case enumeration
- Proof of termination (for sequential logic)

#### Gap 3: No Iterative Test Refinement
**Current**: `TESTBENCH_PROMPT` generates tests once (testgen.py:16-37)
**Needed**: Coverage-driven loop that:
1. Generates initial tests
2. Measures coverage
3. Generates targeted tests for uncovered paths
4. Repeats until coverage threshold

#### Gap 4: Debug is Reactive, Not Proactive
**Current**: `debug_node` only triggers on simulation failure (agent.py:364-461)
**Needed**: Proactive bug hunting via:
- Mutation testing
- Fault injection
- Boundary probing

#### Gap 5: No Confidence Scoring
**Current**: Binary pass/fail
**Needed**: Graduated confidence:
- Test coverage %
- Assertion coverage
- Corner cases tested
- Formal property check results

#### Gap 6: Missing Formal Verification Integration
**Current**: Only dynamic simulation
**Needed**: Static analysis / formal methods for provable correctness

---

## Part 2: Implementation Plan

### Phase 1: Enhanced Prompt Engineering (High Impact, Low Effort)

#### 1.1 Create a Structured Reasoning System Prompt

```python
# New: prompts.py

VERIFICATION_SYSTEM_PROMPT = """You are an expert FPGA verification engineer using formal reasoning.

## Your Verification Methodology

For every code change, you MUST follow this process:

### Step 1: Understand the Specification
- What are the INPUTS and their valid ranges?
- What are the OUTPUTS and their expected behaviors?
- What INVARIANTS must always hold?

### Step 2: Enumerate Edge Cases
List ALL boundary conditions:
- Zero/empty inputs
- Maximum values
- Overflow conditions
- Reset behavior
- Clock domain crossings (if applicable)

### Step 3: Generate Proof Obligations
For each function/always block, state:
- PRECONDITION: What must be true before execution
- POSTCONDITION: What must be true after execution
- INVARIANT: What must remain true throughout

### Step 4: Write Verification Code
Generate assertions that will FAIL if the code is wrong:
```verilog
assert property (@(posedge clk) condition) else $error("...");
```

### Step 5: Confidence Assessment
Rate your confidence (0-100%) with justification:
- What scenarios are proven?
- What scenarios remain unverified?
- What formal properties could be checked?

## Response Format
```json
{
  "specification": {
    "inputs": [...],
    "outputs": [...],
    "invariants": [...]
  },
  "edge_cases": [...],
  "proof_obligations": {
    "preconditions": [...],
    "postconditions": [...],
    "invariants": [...]
  },
  "verification_code": "...",
  "confidence": {
    "score": 0-100,
    "proven": [...],
    "unverified": [...],
    "formal_recommendations": [...]
  },
  "edit": { ... }
}
```
"""
```

#### 1.2 Create Phase-Specific Verification Prompts

```python
VERIFICATION_PROMPTS = {
    "pre_fix": """Before making any changes, analyze:

1. ROOT CAUSE ANALYSIS
   - What is the exact failure mode?
   - Trace the data flow that leads to the bug
   - Is this a logic error, timing error, or interface error?

2. FIX STRATEGY
   - What is the minimal change that fixes this?
   - What other code paths could this affect?
   - What tests would catch a regression?

3. VERIFICATION PLAN
   - How will you prove the fix works?
   - What edge cases must be tested?
   - What assertions should be added?
""",

    "post_fix": """After applying the fix, verify:

1. IMMEDIATE VERIFICATION
   - Does the original failing test now pass?
   - Run 3 related edge case tests

2. REGRESSION CHECK
   - List all functions that share state with the fixed code
   - Generate tests that exercise those paths

3. PROOF COMPLETION
   - Add assertions that would catch if this bug reappears
   - State the invariant that was violated and is now preserved
""",

    "optimization": """Before optimizing for LUTs:

1. CORRECTNESS PRESERVATION
   - Document the current input→output contract
   - List all test vectors that must continue passing

2. OPTIMIZATION STRATEGY
   - What transformation are you applying?
   - Prove it preserves semantics (e.g., algebraic equivalence)

3. VERIFICATION
   - After optimization, run equivalence checking mentally:
     "For all inputs X, old_code(X) == new_code(X)"
   - Generate test cases that stress the optimization boundaries
"""
}
```

#### 1.3 Create Test Generation Prompts with Coverage Goals

```python
COVERAGE_DRIVEN_TESTGEN_PROMPT = """Generate tests to achieve {coverage_goal}% coverage.

## Current Coverage Report
{coverage_report}

## Uncovered Scenarios
{uncovered_paths}

## Your Task
Generate test vectors that specifically target:
1. Uncovered branches
2. Untested state transitions
3. Boundary conditions not exercised

## Test Vector Format
For each test, provide:
```json
{
  "name": "descriptive_test_name",
  "rationale": "why this test is needed",
  "inputs": {...},
  "expected_outputs": {...},
  "assertions": ["property that must hold"],
  "coverage_target": "what this test covers"
}
```

Generate {num_tests} tests prioritized by coverage impact.
"""

MUTATION_TESTING_PROMPT = """Verify robustness via mutation testing.

## Original Code
{original_code}

## Proposed Mutations
I will introduce these bugs. Your tests should catch ALL of them:

1. Off-by-one: Change `i < N` to `i <= N`
2. Wrong operator: Change `+` to `-` in arithmetic
3. Missing reset: Remove reset condition
4. Bit truncation: Reduce wire width by 1
5. Swapped signals: Exchange two similar signals

## Your Task
For each mutation:
1. Predict what test would fail
2. If no test would fail, generate one that would
3. Add that test to the suite

## Output
{
  "mutation_coverage": [...],
  "new_tests_needed": [...],
  "test_suite_strength": "percentage of mutations caught"
}
"""
```

---

### Phase 2: Verification Loop Architecture (Core Feature)

#### 2.1 New Agent State with Verification Fields

```python
# agent.py - Enhanced AgentState

class AgentState(TypedDict):
    # ... existing fields ...

    # NEW: Verification state
    verification: VerificationState
    confidence_score: float  # 0.0 to 1.0
    proof_obligations: list[ProofObligation]
    coverage_report: CoverageReport | None
    assertions_added: list[str]
    mutation_test_results: MutationResults | None

class VerificationState(TypedDict):
    tests_passed: int
    tests_failed: int
    coverage_percent: float
    assertions_checked: int
    assertions_violated: int
    edge_cases_tested: list[str]
    edge_cases_remaining: list[str]
    formal_properties_proven: list[str]

class ProofObligation(TypedDict):
    name: str
    precondition: str
    postcondition: str
    status: Literal["unverified", "tested", "proven", "violated"]
```

#### 2.2 New Verification Nodes

```python
def verify_node(state: AgentState) -> dict:
    """
    Comprehensive verification after any code change.
    This is the core of "prove it works".
    """
    verification = state.get("verification", default_verification())

    # Step 1: Run all existing tests
    sim_result = execute_tool("simulate_with_vcd", {
        "design_code": state["design_code"],
        "testbench_code": state["testbench_code"]
    })

    if not sim_result["passed"]:
        return {
            "phase": "debug",
            "verification": update_verification(verification, sim_result)
        }

    # Step 2: Compute coverage
    coverage = compute_coverage(state)
    verification["coverage_percent"] = coverage["overall_toggle_pct"]

    # Step 3: Check if we need more tests
    if coverage["overall_toggle_pct"] < 80:  # Configurable threshold
        return {
            "phase": "generate_tests",
            "verification": verification,
            "coverage_report": coverage
        }

    # Step 4: Run mutation testing for high confidence
    if state.get("goal") == "optimize":
        mutation_results = run_mutation_tests(state)
        if mutation_results["mutations_caught_pct"] < 90:
            return {
                "phase": "strengthen_tests",
                "mutation_test_results": mutation_results
            }

    # Step 5: Calculate confidence score
    confidence = calculate_confidence(
        tests_passed=sim_result["passed_count"],
        coverage=coverage["overall_toggle_pct"],
        mutations_caught=mutation_results.get("mutations_caught_pct", 0),
        assertions_held=verification["assertions_checked"]
    )

    return {
        "phase": "synthesize" if confidence >= 0.8 else "generate_tests",
        "verification": verification,
        "confidence_score": confidence
    }


def generate_tests_node(state: AgentState) -> dict:
    """Generate targeted tests for uncovered paths."""
    coverage = state.get("coverage_report", {})

    prompt = COVERAGE_DRIVEN_TESTGEN_PROMPT.format(
        coverage_goal=95,
        coverage_report=json.dumps(coverage, indent=2),
        uncovered_paths=identify_uncovered_paths(coverage),
        num_tests=5
    )

    response = call_llm_for_tests(prompt)
    new_tests = parse_test_vectors(response)

    # Append new tests to testbench
    updated_testbench = append_tests_to_testbench(
        state["testbench_code"],
        new_tests
    )

    return {
        "testbench_code": updated_testbench,
        "phase": "verify",  # Go back to verify with new tests
        "reasoning": [f"Generated {len(new_tests)} tests for coverage"]
    }


def strengthen_tests_node(state: AgentState) -> dict:
    """Generate tests that catch mutations."""
    mutation_results = state.get("mutation_test_results", {})

    prompt = MUTATION_TESTING_PROMPT.format(
        original_code=state["design_code"],
        mutations_not_caught=mutation_results.get("uncaught_mutations", [])
    )

    response = call_llm_for_tests(prompt)
    killer_tests = parse_mutation_killer_tests(response)

    updated_testbench = append_tests_to_testbench(
        state["testbench_code"],
        killer_tests
    )

    return {
        "testbench_code": updated_testbench,
        "phase": "verify",
        "reasoning": [f"Added {len(killer_tests)} mutation-killing tests"]
    }
```

#### 2.3 Updated State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
    ┌─────────┐   ┌────────┐   ┌──────────┐   ┌────────────────┐ │
    │ compile │──▶│ verify │──▶│synthesize│──▶│   optimize     │─┘
    └─────────┘   └────────┘   └──────────┘   └────────────────┘
         │             │             │               │
         │             │             │               │
         ▼             ▼             ▼               ▼
    ┌─────────┐   ┌──────────┐  ┌─────────┐   ┌─────────────┐
    │  fix    │   │gen_tests │  │  fix    │   │strengthen   │
    └─────────┘   └──────────┘  └─────────┘   │   tests     │
         │             │             │        └─────────────┘
         │             │             │               │
         └─────────────┴─────────────┴───────────────┘
                              │
                              ▼
                         ┌─────────┐
                         │  debug  │ (VCD analysis)
                         └─────────┘
```

---

### Phase 3: Confidence Scoring System

#### 3.1 Confidence Calculation

```python
def calculate_confidence(
    tests_passed: int,
    tests_total: int,
    coverage_percent: float,
    mutations_caught_percent: float,
    assertions_held: int,
    assertions_total: int,
    formal_properties_proven: int = 0
) -> float:
    """
    Calculate confidence score (0.0 - 1.0) that code is correct.

    Weights:
    - Test pass rate: 25%
    - Code coverage: 25%
    - Mutation score: 25%
    - Assertion coverage: 15%
    - Formal proofs: 10%
    """
    test_score = (tests_passed / tests_total) if tests_total > 0 else 0
    coverage_score = coverage_percent / 100
    mutation_score = mutations_caught_percent / 100
    assertion_score = (assertions_held / assertions_total) if assertions_total > 0 else 0.5
    formal_score = min(1.0, formal_properties_proven / 3)  # Cap at 3 proofs

    confidence = (
        0.25 * test_score +
        0.25 * coverage_score +
        0.25 * mutation_score +
        0.15 * assertion_score +
        0.10 * formal_score
    )

    return round(confidence, 3)
```

#### 3.2 Confidence Thresholds

```python
CONFIDENCE_THRESHOLDS = {
    "compile": 0.0,    # Just needs to compile
    "verify": 0.70,    # Tests pass, decent coverage
    "optimize": 0.85,  # High confidence before optimization
    "pr_ready": 0.95   # Ready for PR merge
}

def should_proceed(state: AgentState) -> bool:
    goal = state.get("goal", "verify")
    threshold = CONFIDENCE_THRESHOLDS.get(goal, 0.70)
    return state.get("confidence_score", 0) >= threshold
```

---

### Phase 4: Integration with Gemini 3 Capabilities

#### 4.1 Structured Output Mode

```python
def call_llm_with_verification(state: AgentState, context: str) -> dict:
    """Use Gemini's structured output for verification tasks."""

    model = genai.GenerativeModel('gemini-2.0-flash')  # or gemini-3 when available

    # Define response schema for verification
    response_schema = {
        "type": "object",
        "properties": {
            "reasoning": {"type": "string"},
            "verification": {
                "type": "object",
                "properties": {
                    "preconditions": {"type": "array", "items": {"type": "string"}},
                    "postconditions": {"type": "array", "items": {"type": "string"}},
                    "invariants": {"type": "array", "items": {"type": "string"}},
                    "edge_cases_covered": {"type": "array", "items": {"type": "string"}},
                    "edge_cases_missing": {"type": "array", "items": {"type": "string"}}
                }
            },
            "confidence": {
                "type": "object",
                "properties": {
                    "score": {"type": "number", "minimum": 0, "maximum": 100},
                    "justification": {"type": "string"}
                }
            },
            "edit": {
                "type": "object",
                "properties": {
                    "edit_type": {"type": "string"},
                    "line_start": {"type": "integer"},
                    "line_end": {"type": "integer"},
                    "new_content": {"type": "string"}
                }
            }
        },
        "required": ["reasoning", "verification", "confidence"]
    }

    response = model.generate_content(
        [{"role": "user", "parts": [VERIFICATION_SYSTEM_PROMPT + "\n\n" + context]}],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=response_schema
        )
    )

    return json.loads(response.text)
```

#### 4.2 Chain-of-Thought Verification

```python
CHAIN_OF_THOUGHT_PROMPT = """Think step by step to verify this code change.

## Step 1: Understand the Change
What exactly is being modified? What was the original behavior?

## Step 2: Impact Analysis
What other parts of the code could be affected?

## Step 3: Test Case Generation
What test cases would definitively prove correctness?

## Step 4: Edge Case Analysis
What boundary conditions must be checked?

## Step 5: Formal Reasoning
Can you state a loop invariant or inductive property that proves correctness?

## Step 6: Confidence Assessment
Given all the above, how confident are you (0-100%) that this is correct?

Show your work for each step.
"""
```

---

### Phase 5: New Tools for Verification

#### 5.1 Assertion Injection Tool

```python
def inject_assertions(design_code: str, assertions: list[str]) -> str:
    """Inject SVA assertions into Verilog code."""
    assertion_block = "\n// Auto-generated verification assertions\n"
    for assertion in assertions:
        assertion_block += f"assert property ({assertion});\n"

    # Find module end and inject before
    return re.sub(
        r'(endmodule)',
        f'{assertion_block}\n\\1',
        design_code
    )

def generate_assertions_for_module(interface: ModuleInterface) -> list[str]:
    """Generate basic assertions based on module interface."""
    assertions = []

    for port in interface.outputs:
        if port.width > 1:
            # Check for X/Z in outputs
            assertions.append(f"@(posedge clk) !$isunknown({port.name})")

    if interface.has_reset:
        rst = interface.reset_name
        # Check reset behavior
        assertions.append(f"@(posedge clk) {rst} |-> ##1 known_reset_state")

    return assertions
```

#### 5.2 Mutation Testing Tool

```python
def generate_mutations(design_code: str) -> list[dict]:
    """Generate code mutations for testing."""
    mutations = []

    # Mutation operators
    operators = {
        "arithmetic": [("+", "-"), ("-", "+"), ("*", "+"), ("/", "*")],
        "comparison": [("<", "<="), (">", ">="), ("==", "!="), ("<=", "<")],
        "logical": [("&&", "||"), ("||", "&&"), ("!", "")],
        "bitwise": [("&", "|"), ("|", "&"), ("^", "&")]
    }

    lines = design_code.split('\n')
    for i, line in enumerate(lines):
        for category, ops in operators.items():
            for orig, repl in ops:
                if orig in line:
                    mutated_line = line.replace(orig, repl, 1)
                    mutations.append({
                        "line": i + 1,
                        "category": category,
                        "original": line.strip(),
                        "mutated": mutated_line.strip(),
                        "mutation": f"{orig} → {repl}"
                    })

    return mutations[:20]  # Limit to 20 mutations

def run_mutation_test(design_code: str, testbench_code: str, mutation: dict) -> bool:
    """Run a single mutation test. Returns True if mutation was CAUGHT (test failed)."""
    lines = design_code.split('\n')
    lines[mutation["line"] - 1] = mutation["mutated"]
    mutated_code = '\n'.join(lines)

    result = simulate(mutated_code, testbench_code)
    return not result.passed  # Caught = test failed on mutant
```

#### 5.3 Coverage Analysis Tool

```python
def analyze_coverage(vcd_path: str, design_code: str) -> dict:
    """Analyze test coverage from VCD file."""
    waveform = parse_vcd(vcd_path)

    coverage = {
        "toggle_coverage": {},
        "branch_coverage": {},
        "fsm_coverage": {},
        "overall_percent": 0
    }

    # Toggle coverage
    for signal in waveform.signals:
        transitions = len(signal.changes)
        coverage["toggle_coverage"][signal.name] = {
            "toggled": transitions > 0,
            "transitions": transitions
        }

    # Analyze always blocks for branch coverage
    always_blocks = extract_always_blocks(design_code)
    for block in always_blocks:
        branches_hit = analyze_branches_hit(block, waveform)
        coverage["branch_coverage"][block["name"]] = branches_hit

    # FSM state coverage
    fsm_signals = [s for s in waveform.signals if "state" in s.name.lower()]
    for fsm in fsm_signals:
        states_visited = set(fsm.values)
        coverage["fsm_coverage"][fsm.name] = list(states_visited)

    # Calculate overall
    toggled = sum(1 for t in coverage["toggle_coverage"].values() if t["toggled"])
    total = len(coverage["toggle_coverage"])
    coverage["overall_percent"] = (toggled / total * 100) if total > 0 else 0

    return coverage
```

---

### Phase 6: Updated Pipeline Flow

#### 6.1 New Endpoints

```python
# main.py - New verification-focused endpoints

@app.post("/verify/full")
async def full_verification_pipeline(request: VerifyRequest):
    """
    Complete verification pipeline:
    1. Compile
    2. Generate comprehensive tests
    3. Run simulation with coverage
    4. Mutation testing
    5. Calculate confidence
    6. Iterate until confidence threshold met
    """
    pass

@app.post("/verify/confidence")
async def get_confidence_score(request: ConfidenceRequest):
    """Get current confidence score for a design."""
    pass

@app.post("/verify/mutations")
async def run_mutation_tests(request: MutationRequest):
    """Run mutation testing on current test suite."""
    pass

@app.post("/verify/coverage")
async def get_coverage_report(request: CoverageRequest):
    """Get detailed coverage report."""
    pass
```

#### 6.2 WebSocket Streaming Updates

```python
# Stream verification progress
async def stream_verification_step(websocket, step: dict):
    await websocket.send_json({
        "type": "verification_update",
        "phase": step["phase"],
        "confidence": step.get("confidence_score", 0),
        "coverage": step.get("coverage_percent", 0),
        "tests_passed": step.get("tests_passed", 0),
        "tests_total": step.get("tests_total", 0),
        "mutations_caught": step.get("mutations_caught", 0),
        "mutations_total": step.get("mutations_total", 0),
        "message": step.get("reasoning", ""),
        "done": step.get("done", False)
    })
```

---

## Part 3: Implementation Priority

### Week 1: High-Impact Prompt Changes
1. [ ] Implement `VERIFICATION_SYSTEM_PROMPT`
2. [ ] Add `VERIFICATION_PROMPTS` dictionary
3. [ ] Update `call_llm()` to use structured verification output
4. [ ] Add confidence field to all responses

### Week 2: Verification Loop
1. [ ] Add `verify_node` to state machine
2. [ ] Add `generate_tests_node` for coverage-driven generation
3. [ ] Implement confidence scoring
4. [ ] Update `should_continue()` to use confidence thresholds

### Week 3: Test Strengthening
1. [ ] Implement mutation testing tool
2. [ ] Add `strengthen_tests_node`
3. [ ] Integrate mutation results into confidence score
4. [ ] Add assertion generation

### Week 4: Integration & Polish
1. [ ] New API endpoints
2. [ ] WebSocket streaming for verification status
3. [ ] Frontend updates to show confidence/coverage
4. [ ] End-to-end testing

---

## Part 4: Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Test coverage before optimization | ~30% | >90% |
| Mutations caught by test suite | Unknown | >85% |
| Confidence score before PR | N/A | >0.95 |
| False positive rate (wrong fixes) | High | <5% |
| Time to debug simulation failure | Manual | <30s |

---

## Appendix: File Changes Summary

| File | Changes |
|------|---------|
| `prompts.py` | Add VERIFICATION_SYSTEM_PROMPT, VERIFICATION_PROMPTS, COVERAGE_DRIVEN_TESTGEN_PROMPT, MUTATION_TESTING_PROMPT |
| `agent.py` | Add VerificationState to AgentState, add verify_node, generate_tests_node, strengthen_tests_node, update state machine |
| `tools.py` | Add inject_assertions, generate_mutations, run_mutation_test, analyze_coverage |
| `testgen.py` | Add coverage-driven test generation, mutation killer test generation |
| `main.py` | Add /verify/* endpoints, update streaming |
| `parsers.py` | Add coverage parsing, mutation result parsing |
