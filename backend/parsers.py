"""
Parsers for iverilog and yosys output.
Converts raw tool output into structured, LLM-friendly feedback.
"""

import re
from dataclasses import dataclass, asdict
from typing import Literal


@dataclass
class CompileError:
    line: int
    column: int | None
    type: str  # syntax, binding, type, warning
    message: str
    hint: str | None = None


@dataclass
class CompileResult:
    success: bool
    errors: list[CompileError]
    raw_output: str


@dataclass
class SimFailure:
    cycle: int | None
    time_ns: int | None
    signal: str
    expected: str
    actual: str


@dataclass
class SimResult:
    passed: bool
    failures: list[SimFailure]
    raw_output: str


@dataclass
class SynthResult:
    success: bool
    luts: int | None
    ffs: int | None
    cells: dict[str, int]
    errors: list[str]
    raw_output: str


@dataclass
class ConvertResult:
    """Result of C-to-Verilog HLS conversion."""
    success: bool
    verilog_code: str | None
    errors: list[str]
    raw_output: str


def parse_iverilog_compile(output: str, returncode: int) -> CompileResult:
    """Parse iverilog compilation output."""
    errors = []

    pattern = r'([^:]+):(\d+):\s*(error|warning|syntax error):\s*(.+)'

    for match in re.finditer(pattern, output, re.MULTILINE):
        filename, line, err_type, message = match.groups()

        if 'syntax' in err_type:
            err_type = 'syntax'
        elif 'warning' in err_type:
            err_type = 'warning'
        else:
            err_type = classify_error(message)

        hint = generate_hint(err_type, message)

        errors.append(CompileError(
            line=int(line),
            column=None,
            type=err_type,
            message=message.strip(),
            hint=hint
        ))

    simple_pattern = r'([^:]+):(\d+):\s*syntax error'
    for match in re.finditer(simple_pattern, output, re.MULTILINE):
        if not any(e.line == int(match.group(2)) for e in errors):
            errors.append(CompileError(
                line=int(match.group(2)),
                column=None,
                type='syntax',
                message='Syntax error',
                hint='Check for missing semicolons, mismatched parentheses, or invalid keywords'
            ))

    success = returncode == 0 and not any(e.type != 'warning' for e in errors)

    return CompileResult(success=success, errors=errors, raw_output=output)


def classify_error(message: str) -> str:
    message_lower = message.lower()

    if 'bind' in message_lower or 'undeclared' in message_lower:
        return 'binding'
    elif 'type' in message_lower or 'width' in message_lower:
        return 'type'
    elif 'port' in message_lower:
        return 'port'
    elif 'range' in message_lower:
        return 'range'
    else:
        return 'error'


def generate_hint(err_type: str, message: str) -> str | None:
    hints = {
        'binding': "Check that all signals are declared as 'wire' or 'reg' before use",
        'syntax': "Check for missing semicolons, mismatched begin/end, or invalid keywords",
        'type': "Check bit widths match between assignments and declarations",
        'port': "Check module port declarations match instantiation",
        'range': "Check array/vector indices are within declared bounds",
    }
    return hints.get(err_type)


def parse_vvp_simulation(output: str, returncode: int) -> SimResult:
    """Parse vvp simulation output."""
    failures = []
    passed = True

    fail_pattern = r'\[FAIL\]\s*(\w+)=(\S+)\s+expected=(\S+)\s+actual=(\S+)(?:\s+cycle=(\d+))?(?:\s+time=(\d+))?'

    for match in re.finditer(fail_pattern, output):
        signal, _, expected, actual, cycle, time_ns = match.groups()
        failures.append(SimFailure(
            cycle=int(cycle) if cycle else None,
            time_ns=int(time_ns) if time_ns else None,
            signal=signal,
            expected=expected,
            actual=actual
        ))
        passed = False

    done_pattern = r'\[DONE\]\s*passed=(\d+)\s+failed=(\d+)'
    done_match = re.search(done_pattern, output)
    if done_match:
        _, failed_count = done_match.groups()
        if int(failed_count) > 0:
            passed = False

    if returncode != 0:
        passed = False

    if re.search(r'\$stop|\$fatal|ERROR', output, re.IGNORECASE):
        passed = False

    # Check for FAIL pattern used in existing testbench
    if re.search(r'FAIL:', output):
        passed = False

    # Check for PASS pattern
    if re.search(r'PASS|All tests passed', output, re.IGNORECASE) and not re.search(r'FAIL', output, re.IGNORECASE):
        passed = True

    return SimResult(passed=passed, failures=failures, raw_output=output)


def parse_yosys_synth(output: str, returncode: int) -> SynthResult:
    """Parse yosys synthesis output for resource usage."""
    cells = {}
    luts = None
    ffs = None
    errors = []

    if returncode != 0:
        error_pattern = r'ERROR:\s*(.+)'
        for match in re.finditer(error_pattern, output):
            errors.append(match.group(1).strip())
        return SynthResult(
            success=False, luts=None, ffs=None,
            cells={}, errors=errors, raw_output=output
        )

    cell_pattern = r'^\s+(\$?\w+)\s+(\d+)\s*$'
    in_stats = False

    for line in output.split('\n'):
        if 'Number of cells' in line:
            in_stats = True
            continue

        if in_stats:
            match = re.match(cell_pattern, line)
            if match:
                cell_name, count = match.groups()
                cells[cell_name] = int(count)
            elif line.strip() and not line.startswith(' '):
                in_stats = False

    lut_cells = ['$_AND_', '$_OR_', '$_XOR_', '$_NOT_', '$_MUX_', '$_NAND_', '$_NOR_',
                 '$lut', '$_LUT4_', '$_LUT6_', 'LUT4', 'LUT6', 'SB_LUT4']
    luts = sum(cells.get(c, 0) for c in lut_cells)

    if luts == 0:
        logic_cells = ['$_AND_', '$_OR_', '$_XOR_', '$_NOT_', '$_NAND_', '$_NOR_', '$_XNOR_']
        luts = sum(cells.get(c, 0) for c in logic_cells) // 4 + 1

    ff_cells = ['$_DFF_P_', '$_DFF_N_', '$_DFFE_PP_', '$_SDFF', '$dff', 'SB_DFF']
    ffs = sum(v for k, v in cells.items() if any(ff in k for ff in ff_cells))

    return SynthResult(
        success=True,
        luts=luts,
        ffs=ffs,
        cells=cells,
        errors=[],
        raw_output=output
    )


def result_to_dict(result: CompileResult | SimResult | SynthResult | ConvertResult) -> dict:
    """Convert dataclass result to dict for JSON serialization."""
    if isinstance(result, CompileResult):
        return {
            'success': result.success,
            'errors': [asdict(e) for e in result.errors],
            'raw_output': result.raw_output
        }
    elif isinstance(result, SimResult):
        return {
            'passed': result.passed,
            'failures': [asdict(f) for f in result.failures],
            'raw_output': result.raw_output
        }
    elif isinstance(result, SynthResult):
        return {
            'success': result.success,
            'luts': result.luts,
            'ffs': result.ffs,
            'cells': result.cells,
            'errors': result.errors,
            'raw_output': result.raw_output
        }
    elif isinstance(result, ConvertResult):
        return {
            'success': result.success,
            'verilog_code': result.verilog_code,
            'errors': result.errors,
            'raw_output': result.raw_output
        }
    return asdict(result)
