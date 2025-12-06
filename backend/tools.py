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
        ["iverilog", "-g2012", "-Wall", "-t", "null", str(filepath)],
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
        ["iverilog", "-g2012", "-Wall", "-o", str(sim_out), str(design_path), str(tb_path)],
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


# Legacy functions for backward compatibility with existing agent.py
def estimate_luts(verilog_code: str) -> dict:
    """
    Run Yosys synthesis to estimate LUT count.
    Legacy function for backward compatibility.
    """
    result = estimate_resources(verilog_code)
    return {
        "lut_count": result.luts,
        "cell_counts": result.cells,
        "raw_stats": result.raw_output,
        "error": result.errors[0] if result.errors else None
    }


# Quick test function
def test_toolchain():
    """Test that iverilog and yosys are working."""
    test_verilog = """
module matmul(
    input [7:0] a, b,
    output [15:0] result
);
    assign result = a * b;
endmodule
"""

    test_tb = """
module testbench;
    reg [7:0] a, b;
    wire [15:0] result;

    matmul uut(.a(a), .b(b), .result(result));

    initial begin
        a = 8'd3; b = 8'd4;
        #10;
        if (result == 16'd12) $display("PASS");
        else $display("FAIL: expected 12, got %d", result);
        $finish;
    end
endmodule
"""

    print("Testing simulation...")
    sim_result = simulate(test_verilog, test_tb)
    print(f"  Passed: {sim_result.passed}")
    print(f"  Output: {sim_result.raw_output[:200] if sim_result.raw_output else 'None'}")

    print("\nTesting LUT estimation...")
    lut_result = estimate_resources(test_verilog)
    print(f"  LUT count: {lut_result.luts}")
    print(f"  Cell counts: {lut_result.cells}")

    return sim_result.passed and lut_result.luts is not None


if __name__ == "__main__":
    success = test_toolchain()
    print(f"\nToolchain test: {'PASSED' if success else 'FAILED'}")
