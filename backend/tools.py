"""
Verilog simulation and synthesis tools.
Requires: iverilog, vvp, yosys
"""
import subprocess
import tempfile
import os
import re
from pathlib import Path


def simulate(verilog_code: str, testbench: str) -> dict:
    """
    Run iverilog + vvp simulation.

    Args:
        verilog_code: The Verilog module code
        testbench: The testbench code

    Returns:
        dict with keys: passed, output, error
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        design_path = Path(tmpdir) / "design.v"
        tb_path = Path(tmpdir) / "testbench.v"
        out_path = Path(tmpdir) / "sim.out"

        design_path.write_text(verilog_code)
        tb_path.write_text(testbench)

        # Compile with iverilog
        compile_result = subprocess.run(
            ["iverilog", "-o", str(out_path), str(design_path), str(tb_path)],
            capture_output=True,
            text=True,
            timeout=30
        )

        if compile_result.returncode != 0:
            return {
                "passed": False,
                "output": compile_result.stdout,
                "error": compile_result.stderr or "Compilation failed"
            }

        # Run simulation with vvp
        sim_result = subprocess.run(
            ["vvp", str(out_path)],
            capture_output=True,
            text=True,
            timeout=60
        )

        output = sim_result.stdout
        error = sim_result.stderr

        # Check for common pass/fail patterns
        passed = (
            "PASS" in output.upper() or
            "ALL TESTS PASSED" in output.upper() or
            ("FAIL" not in output.upper() and sim_result.returncode == 0)
        )

        return {
            "passed": passed,
            "output": output,
            "error": error if error else None
        }


def estimate_luts(verilog_code: str) -> dict:
    """
    Run Yosys synthesis to estimate LUT count.

    Args:
        verilog_code: The Verilog module code

    Returns:
        dict with keys: lut_count, cell_counts, raw_stats, error
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        design_path = Path(tmpdir) / "design.v"
        design_path.write_text(verilog_code)

        # Yosys synthesis script
        yosys_script = f"""
read_verilog {design_path}
synth -top matmul
stat
"""

        result = subprocess.run(
            ["yosys", "-p", yosys_script],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            return {
                "lut_count": None,
                "cell_counts": {},
                "raw_stats": None,
                "error": result.stderr or "Synthesis failed"
            }

        output = result.stdout

        # Parse the stats output
        cell_counts = {}
        lut_count = 0

        # Look for "Number of cells:" line and subsequent cell breakdown
        stats_section = False
        for line in output.split('\n'):
            if 'Number of cells:' in line:
                stats_section = True
                match = re.search(r'Number of cells:\s+(\d+)', line)
                if match:
                    lut_count = int(match.group(1))
            elif stats_section and '$' in line:
                # Parse individual cell counts like "$_AND_  42"
                match = re.search(r'(\$\w+)\s+(\d+)', line)
                if match:
                    cell_counts[match.group(1)] = int(match.group(2))

        return {
            "lut_count": lut_count,
            "cell_counts": cell_counts,
            "raw_stats": output,
            "error": None
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
    print(f"  Passed: {sim_result['passed']}")
    print(f"  Output: {sim_result['output'][:200] if sim_result['output'] else 'None'}")

    print("\nTesting LUT estimation...")
    lut_result = estimate_luts(test_verilog)
    print(f"  LUT count: {lut_result['lut_count']}")
    print(f"  Cell counts: {lut_result['cell_counts']}")

    return sim_result['passed'] and lut_result['lut_count'] is not None


if __name__ == "__main__":
    success = test_toolchain()
    print(f"\nToolchain test: {'PASSED' if success else 'FAILED'}")
