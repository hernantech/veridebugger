"""
LLM-driven testbench generation for Verilog modules.
"""

import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

from module_analyzer import ModuleInterface, generate_edge_cases, to_dict

load_dotenv()
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))


TESTBENCH_PROMPT = """You are an expert Verilog verification engineer. Generate a testbench for this module.

## Module Interface
{interface_json}

## Edge Cases to Test
{edge_cases_json}

## Requirements
1. Create a complete, syntactically correct Verilog testbench
2. Include clock generation if the module has a clock input
3. Include proper reset sequence if the module has reset
4. Test all edge cases provided
5. Use this output format for test results:
   - $display("[PASS] test_name: description");
   - $display("[FAIL] signal=%h expected=%h actual=%h", signal, expected, actual);
6. End with: $display("[DONE] passed=%0d failed=%0d", passed, failed);
7. Include $dumpfile("dump.vcd") and $dumpvars(0, testbench_name) for waveform capture
8. Use `timescale 1ns/1ps

Generate ONLY the Verilog testbench code, no explanations:
"""


COVERAGE_EXPANSION_PROMPT = """Analyze test coverage and generate additional test vectors.

## Current Coverage
{coverage_json}

## Module Interface
{interface_json}

## Existing Tests Summary
{existing_tests}

## Task
Generate additional test vectors to improve coverage. Focus on:
1. Untested input combinations
2. FSM state transitions not exercised
3. Boundary conditions missed

Respond with JSON array of test vectors:
[
    {{
        "name": "test_case_name",
        "inputs": {{"port_name": "value_in_verilog_format"}},
        "description": "what this tests"
    }}
]
"""


def generate_testbench(interface: ModuleInterface) -> str:
    """Generate a testbench using LLM."""
    model = genai.GenerativeModel('gemini-2.0-flash')

    interface_dict = to_dict(interface)
    edge_cases = generate_edge_cases(interface)

    prompt = TESTBENCH_PROMPT.format(
        interface_json=json.dumps(interface_dict, indent=2),
        edge_cases_json=json.dumps(edge_cases, indent=2)
    )

    response = model.generate_content([{"role": "user", "parts": [prompt]}])
    testbench = response.text

    # Clean up markdown code blocks if present
    if "```verilog" in testbench:
        testbench = testbench.split("```verilog")[1].split("```")[0]
    elif "```" in testbench:
        testbench = testbench.split("```")[1].split("```")[0]

    return testbench.strip()


def generate_testbench_skeleton(interface: ModuleInterface) -> str:
    """Generate a basic testbench skeleton without LLM (fallback)."""
    lines = []
    lines.append("`timescale 1ns/1ps")
    lines.append("")
    lines.append(f"module {interface.name}_tb;")
    lines.append("")

    # Declare test signals
    for port in interface.inputs:
        width_str = f"[{port.width-1}:0] " if port.width > 1 else ""
        lines.append(f"    reg {width_str}{port.name};")

    for port in interface.outputs:
        width_str = f"[{port.width-1}:0] " if port.width > 1 else ""
        lines.append(f"    wire {width_str}{port.name};")

    lines.append("")
    lines.append("    integer passed, failed;")
    lines.append("")

    # Clock generation
    if interface.has_clock:
        clk = interface.clock_name
        lines.append(f"    // Clock generation")
        lines.append(f"    initial begin")
        lines.append(f"        {clk} = 0;")
        lines.append(f"        forever #5 {clk} = ~{clk};")
        lines.append(f"    end")
        lines.append("")

    # DUT instantiation
    lines.append(f"    // Device Under Test")
    lines.append(f"    {interface.name} dut (")
    port_connections = []
    for port in interface.ports:
        if not port.is_array:
            port_connections.append(f"        .{port.name}({port.name})")
    lines.append(",\n".join(port_connections))
    lines.append("    );")
    lines.append("")

    # Test sequence
    lines.append("    initial begin")
    lines.append(f'        $dumpfile("{interface.name}_tb.vcd");')
    lines.append(f"        $dumpvars(0, {interface.name}_tb);")
    lines.append("")
    lines.append("        passed = 0;")
    lines.append("        failed = 0;")
    lines.append("")

    # Reset sequence
    if interface.has_reset:
        rst = interface.reset_name
        if interface.is_reset_active_low:
            lines.append(f"        {rst} = 0;")
            lines.append(f"        #20 {rst} = 1;")
        else:
            lines.append(f"        {rst} = 1;")
            lines.append(f"        #20 {rst} = 0;")
        lines.append("")

    # Initialize other inputs
    for port in interface.inputs:
        if port.name not in (interface.clock_name, interface.reset_name):
            if not port.is_array:
                lines.append(f"        {port.name} = 0;")

    lines.append("        #100;")
    lines.append("")
    lines.append('        $display("[DONE] passed=%0d failed=%0d", passed, failed);')
    lines.append("        $finish;")
    lines.append("    end")
    lines.append("")
    lines.append("endmodule")

    return "\n".join(lines)


def expand_tests_for_coverage(
    interface: ModuleInterface,
    coverage_report: dict,
    existing_tests: str
) -> list[dict]:
    """Generate additional tests based on coverage gaps."""
    model = genai.GenerativeModel('gemini-2.0-flash')

    interface_dict = to_dict(interface)

    prompt = COVERAGE_EXPANSION_PROMPT.format(
        coverage_json=json.dumps(coverage_report, indent=2),
        interface_json=json.dumps(interface_dict, indent=2),
        existing_tests=existing_tests[:2000]  # Truncate if too long
    )

    response = model.generate_content(
        [{"role": "user", "parts": [prompt]}],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json"
        )
    )

    try:
        vectors = json.loads(response.text)
        if isinstance(vectors, list):
            return vectors
    except json.JSONDecodeError:
        pass

    return []


def compute_basic_coverage(vcd_summary: dict, interface: ModuleInterface) -> dict:
    """Compute basic toggle coverage from VCD summary."""
    coverage = {
        "toggle_coverage": {},
        "overall_toggle_pct": 0.0,
        "signals_with_no_toggles": []
    }

    total_signals = 0
    toggled_signals = 0

    for sig_info in vcd_summary.get("signals", []):
        sig_name = sig_info["name"]
        transitions = sig_info.get("transitions", 0)

        if transitions > 0:
            coverage["toggle_coverage"][sig_name] = 100.0
            toggled_signals += 1
        else:
            coverage["toggle_coverage"][sig_name] = 0.0
            coverage["signals_with_no_toggles"].append(sig_name)

        total_signals += 1

    if total_signals > 0:
        coverage["overall_toggle_pct"] = (toggled_signals / total_signals) * 100

    return coverage


if __name__ == "__main__":
    from module_analyzer import extract_module_interface

    test_code = """
module adder (
    input wire [7:0] a,
    input wire [7:0] b,
    output wire [8:0] sum
);
    assign sum = a + b;
endmodule
"""

    iface = extract_module_interface(test_code)
    if iface:
        print("Module:", iface.name)
        print("\nGenerating testbench skeleton...")
        skeleton = generate_testbench_skeleton(iface)
        print(skeleton)

        print("\n" + "="*50)
        print("Generating LLM testbench...")
        try:
            tb = generate_testbench(iface)
            print(tb)
        except Exception as e:
            print(f"LLM generation failed: {e}")
