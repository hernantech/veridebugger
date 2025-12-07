"""
Tools for HDL compilation, simulation, synthesis, debugging, and test generation.
"""

import subprocess
import tempfile
import re
from pathlib import Path
from dataclasses import dataclass
from parsers import (
    parse_iverilog_compile,
    parse_vvp_simulation,
    parse_yosys_synth,
    CompileResult,
    SimResult,
    SynthResult,
    ConvertResult,
    result_to_dict
)


WORK_DIR = Path(tempfile.gettempdir()) / "fpga-agent"
WORK_DIR.mkdir(exist_ok=True)


@dataclass
class SimWithVCDResult:
    sim_result: SimResult
    vcd_path: Path | None


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


def simulate_with_vcd(design_code: str, testbench_code: str) -> SimWithVCDResult:
    """Run simulation with VCD waveform capture."""
    design_path = WORK_DIR / "design.v"
    tb_path = WORK_DIR / "testbench.v"
    sim_out = WORK_DIR / "sim.out"
    vcd_path = WORK_DIR / "dump.vcd"

    # Inject VCD commands if not present
    if "$dumpfile" not in testbench_code:
        # Find 'initial begin' and inject after it
        inject_code = '\n        $dumpfile("dump.vcd");\n        $dumpvars(0);'
        testbench_code = re.sub(
            r'(initial\s+begin)',
            r'\1' + inject_code,
            testbench_code,
            count=1
        )

    design_path.write_text(design_code)
    tb_path.write_text(testbench_code)

    compile_result = subprocess.run(
        ["iverilog", "-g2012", "-Wall", "-o", str(sim_out), str(design_path), str(tb_path)],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(WORK_DIR)
    )

    if compile_result.returncode != 0:
        output = compile_result.stdout + compile_result.stderr
        return SimWithVCDResult(
            sim_result=SimResult(
                passed=False,
                failures=[],
                raw_output=f"Compilation failed:\n{output}"
            ),
            vcd_path=None
        )

    sim_result = subprocess.run(
        ["vvp", str(sim_out)],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(WORK_DIR)
    )

    output = sim_result.stdout + sim_result.stderr
    parsed = parse_vvp_simulation(output, sim_result.returncode)

    return SimWithVCDResult(
        sim_result=parsed,
        vcd_path=vcd_path if vcd_path.exists() else None
    )


def extract_module_interface(design_code: str) -> dict:
    """Extract module interface from Verilog code."""
    from module_analyzer import extract_module_interface as _extract, to_dict

    interface = _extract(design_code)
    if interface:
        return to_dict(interface)
    return {"error": "Could not parse module interface"}


def generate_testbench_for_design(design_code: str, use_llm: bool = True) -> dict:
    """Generate a testbench for the given design."""
    from module_analyzer import extract_module_interface as _extract
    from testgen import generate_testbench, generate_testbench_skeleton

    interface = _extract(design_code)
    if not interface:
        return {"error": "Could not parse module interface"}

    try:
        if use_llm:
            testbench = generate_testbench(interface)
        else:
            testbench = generate_testbench_skeleton(interface)

        return {
            "testbench_code": testbench,
            "module_name": interface.name,
            "generated_with": "llm" if use_llm else "skeleton"
        }
    except Exception as e:
        # Fall back to skeleton on LLM failure
        testbench = generate_testbench_skeleton(interface)
        return {
            "testbench_code": testbench,
            "module_name": interface.name,
            "generated_with": "skeleton",
            "llm_error": str(e)
        }


def analyze_vcd(vcd_path: str) -> dict:
    """Analyze VCD file and return summary."""
    from vcd_parser import parse_vcd, get_waveform_summary

    try:
        waveform = parse_vcd(vcd_path)
        return get_waveform_summary(waveform)
    except Exception as e:
        return {"error": str(e)}


def trace_failure_in_vcd(vcd_path: str, failure_signal: str, failure_time: int) -> dict:
    """Trace back from a failure to find causal signals."""
    from vcd_parser import parse_vcd, trace_failure, find_signal_by_name

    try:
        waveform = parse_vcd(vcd_path)

        # Find the signal
        signal = find_signal_by_name(waveform, failure_signal)
        if not signal:
            return {"error": f"Signal '{failure_signal}' not found"}

        causal_chain = trace_failure(waveform, failure_signal, failure_time)
        return {
            "failure_signal": failure_signal,
            "failure_time": failure_time,
            "causal_chain": causal_chain
        }
    except Exception as e:
        return {"error": str(e)}


def check_c_syntax(code: str) -> ConvertResult:
    """Check C code syntax using gcc -fsyntax-only."""
    filepath = WORK_DIR / "design.c"
    filepath.write_text(code)

    try:
        result = subprocess.run(
            ["gcc", "-fsyntax-only", "-Wall", "-Wextra", str(filepath)],
            capture_output=True,
            text=True,
            timeout=10
        )

        errors = []
        # Parse gcc error format: file:line:col: error: message
        for line in result.stderr.split('\n'):
            if ': error:' in line or ': warning:' in line:
                errors.append(line.strip())

        return ConvertResult(
            success=result.returncode == 0,
            verilog_code=None,
            errors=errors,
            raw_output=result.stderr
        )
    except FileNotFoundError:
        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["gcc not found - please install gcc"],
            raw_output=""
        )
    except subprocess.TimeoutExpired:
        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["gcc timed out"],
            raw_output=""
        )


def convert_c_to_verilog(code: str, top_function: str = "main") -> ConvertResult:
    """Convert C code to Verilog using BAMBU HLS.

    Fails fast: checks C syntax first, then runs BAMBU.
    No auto-fix on failure - returns errors for user to fix.
    """
    # Step 1: Check C syntax first (fail fast)
    syntax_check = check_c_syntax(code)
    if not syntax_check.success:
        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["C syntax errors - fix before conversion:"] + syntax_check.errors,
            raw_output=syntax_check.raw_output
        )

    # Step 2: Run BAMBU HLS
    c_file = WORK_DIR / "design.c"
    c_file.write_text(code)
    bambu_out = WORK_DIR / "bambu_out"
    bambu_out.mkdir(exist_ok=True)

    try:
        result = subprocess.run(
            [
                "bambu",
                str(c_file),
                f"--top-fname={top_function}",
                "-v0",
                "--std=c99"  # Enable C99 for loop declarations
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(WORK_DIR)
        )

        if result.returncode != 0:
            errors = []
            for line in result.stderr.split('\n'):
                if 'error' in line.lower() or 'Error' in line:
                    errors.append(line.strip())
            if not errors:
                errors = ["BAMBU conversion failed - see raw output"]
            return ConvertResult(
                success=False,
                verilog_code=None,
                errors=errors,
                raw_output=result.stdout + result.stderr
            )

        # Find generated Verilog - BAMBU outputs to cwd with name based on top function
        expected_output = WORK_DIR / f"{top_function}.v"
        if expected_output.exists():
            verilog_code = expected_output.read_text()
            return ConvertResult(
                success=True,
                verilog_code=verilog_code,
                errors=[],
                raw_output=result.stdout
            )

        # Fallback: look for any .v files
        verilog_files = [f for f in WORK_DIR.glob("*.v") if f.name != "design.v"]
        if verilog_files:
            verilog_code = verilog_files[0].read_text()
            return ConvertResult(
                success=True,
                verilog_code=verilog_code,
                errors=[],
                raw_output=result.stdout
            )

        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["BAMBU completed but no Verilog output found"],
            raw_output=result.stdout + result.stderr
        )

    except FileNotFoundError:
        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["BAMBU not found - install from https://panda.deib.polimi.it"],
            raw_output=""
        )
    except subprocess.TimeoutExpired:
        return ConvertResult(
            success=False,
            verilog_code=None,
            errors=["BAMBU timed out after 120 seconds"],
            raw_output=""
        )


def execute_tool(name: str, args: dict) -> dict:
    """Execute a tool and return result as dict."""
    if name == "compile_verilog":
        result = compile_verilog(args["code"])
        return result_to_dict(result)

    elif name == "simulate":
        result = simulate(args["design_code"], args["testbench_code"])
        return result_to_dict(result)

    elif name == "simulate_with_vcd":
        result = simulate_with_vcd(args["design_code"], args["testbench_code"])
        return {
            **result_to_dict(result.sim_result),
            "vcd_path": str(result.vcd_path) if result.vcd_path else None
        }

    elif name == "estimate_resources":
        result = estimate_resources(args["code"], args.get("target", "generic"))
        return result_to_dict(result)

    elif name == "edit_code":
        edited = edit_code(
            args["original"],
            args["edit_type"],
            args["line_start"],
            args.get("line_end"),
            args.get("new_content", "")
        )
        return {"edited_code": edited}

    elif name == "extract_interface":
        return extract_module_interface(args["design_code"])

    elif name == "generate_testbench":
        return generate_testbench_for_design(
            args["design_code"],
            args.get("use_llm", True)
        )

    elif name == "analyze_vcd":
        return analyze_vcd(args["vcd_path"])

    elif name == "trace_failure":
        return trace_failure_in_vcd(
            args["vcd_path"],
            args["signal"],
            args["time"]
        )

    elif name == "check_c_syntax":
        result = check_c_syntax(args["code"])
        return result_to_dict(result)

    elif name == "convert_c_to_verilog":
        result = convert_c_to_verilog(
            args["code"],
            args.get("top_function", "main")
        )
        return result_to_dict(result)

    else:
        return {"error": f"Unknown tool: {name}"}


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
