"""
Module analyzer for extracting Verilog interface information.
Used to generate testbenches from module definitions.
"""

import re
from dataclasses import dataclass, field


@dataclass
class Port:
    name: str
    direction: str  # input, output, inout
    width: int = 1
    is_signed: bool = False
    is_array: bool = False
    array_dims: list[tuple[int, int]] = field(default_factory=list)

    @property
    def declaration(self) -> str:
        """Generate Verilog declaration string."""
        width_str = f"[{self.width-1}:0] " if self.width > 1 else ""
        signed_str = "signed " if self.is_signed else ""
        return f"{self.direction} {signed_str}{width_str}{self.name}"

    @property
    def max_value(self) -> int:
        return (1 << self.width) - 1

    @property
    def bit_width_str(self) -> str:
        return f"{self.width}'d" if self.width <= 32 else f"{self.width}'h"


@dataclass
class Parameter:
    name: str
    default_value: str | None = None


@dataclass
class FSMInfo:
    state_reg: str
    states: list[str]
    state_width: int


@dataclass
class ModuleInterface:
    name: str
    ports: list[Port] = field(default_factory=list)
    parameters: list[Parameter] = field(default_factory=list)
    fsm: FSMInfo | None = None

    @property
    def inputs(self) -> list[Port]:
        return [p for p in self.ports if p.direction == "input"]

    @property
    def outputs(self) -> list[Port]:
        return [p for p in self.ports if p.direction == "output"]

    @property
    def has_clock(self) -> bool:
        return any(p.name.lower() in ("clk", "clock") for p in self.inputs)

    @property
    def has_reset(self) -> bool:
        return any(p.name.lower() in ("rst", "reset", "rst_n", "reset_n") for p in self.inputs)

    @property
    def clock_name(self) -> str | None:
        for p in self.inputs:
            if p.name.lower() in ("clk", "clock"):
                return p.name
        return None

    @property
    def reset_name(self) -> str | None:
        for p in self.inputs:
            if p.name.lower() in ("rst", "reset", "rst_n", "reset_n"):
                return p.name
        return None

    @property
    def is_reset_active_low(self) -> bool:
        reset = self.reset_name
        return reset and "_n" in reset.lower()


def extract_module_interface(verilog_code: str) -> ModuleInterface | None:
    """Extract module interface from Verilog code."""

    # Find module declaration - try multiple patterns
    # Pattern 1: ANSI-style module name (...);
    # Pattern 2: module name #(...) (...);
    # Pattern 3: module name (\n  ports... \n);  (multi-line)

    patterns = [
        # Standard: module name(...);
        r'module\s+(\w+)\s*(?:#\s*\([^)]*\))?\s*\(([^;]*)\)\s*;',
        # Without trailing semicolon after ports (some tools)
        r'module\s+(\w+)\s*(?:#\s*\([^)]*\))?\s*\(([^)]+)\)',
        # Verilog-2001 with port list only in header
        r'module\s+(\w+)\s*\(([^)]*)\)',
    ]

    module_match = None
    for pattern in patterns:
        # Find ALL modules and use the LAST one (top-level in BAMBU output)
        matches = list(re.finditer(pattern, verilog_code, re.DOTALL))
        if matches:
            module_match = matches[-1]  # Last module is typically the top-level
            break

    if not module_match:
        return None

    module_name = module_match.group(1)
    interface = ModuleInterface(name=module_name)

    # Extract just this module's code (from module declaration to endmodule)
    module_start = module_match.start()
    endmodule_match = re.search(r'\bendmodule\b', verilog_code[module_start:])
    if endmodule_match:
        module_code = verilog_code[module_start:module_start + endmodule_match.end()]
    else:
        module_code = verilog_code[module_start:]

    # Extract parameters
    param_pattern = r'parameter\s+(?:\[\d+:\d+\]\s*)?(\w+)\s*=\s*([^,;]+)'
    for match in re.finditer(param_pattern, module_code):
        interface.parameters.append(Parameter(
            name=match.group(1),
            default_value=match.group(2).strip()
        ))

    # Extract localparams (often FSM states)
    localparam_pattern = r'localparam\s+(?:\[\d+:\d+\]\s*)?(\w+)\s*=\s*([^,;]+)'
    localparams = {}
    for match in re.finditer(localparam_pattern, module_code):
        localparams[match.group(1)] = match.group(2).strip()

    # Extract port declarations - handle multiple styles

    # Style 1: ANSI-style in module header
    # input wire [7:0] data,
    # input [7:0] data,
    # input data,
    ansi_patterns = [
        # Full: input wire signed [7:0] name [3:0]
        r'(input|output|inout)\s+(wire|reg)?\s*(signed)?\s*(?:\[(\d+):(\d+)\])?\s*(\w+)(?:\s*\[(\d+):(\d+)\])?',
        # Without wire/reg: input [7:0] name
        r'(input|output|inout)\s+(signed)?\s*\[(\d+):(\d+)\]\s*(\w+)',
        # Simple: input name
        r'(input|output|inout)\s+(\w+)\s*(?:,|$|\))',
    ]

    port_section = module_match.group(2)

    # Try full pattern first
    for match in re.finditer(ansi_patterns[0], port_section):
        direction, _, signed, msb, lsb, name, arr_msb, arr_lsb = match.groups()

        width = 1
        if msb and lsb:
            width = abs(int(msb) - int(lsb)) + 1

        is_array = arr_msb is not None
        array_dims = []
        if is_array:
            array_dims = [(int(arr_msb), int(arr_lsb))]

        interface.ports.append(Port(
            name=name,
            direction=direction,
            width=width,
            is_signed=signed is not None,
            is_array=is_array,
            array_dims=array_dims
        ))

    # Try simpler patterns if full pattern didn't find ports
    if not interface.ports:
        # Pattern: input [7:0] name (without wire/reg)
        for match in re.finditer(ansi_patterns[1], port_section):
            direction, signed, msb, lsb, name = match.groups()
            width = abs(int(msb) - int(lsb)) + 1
            interface.ports.append(Port(
                name=name,
                direction=direction,
                width=width,
                is_signed=signed is not None
            ))

    if not interface.ports:
        # Pattern: input name (simple, 1-bit)
        for match in re.finditer(ansi_patterns[2], port_section):
            direction, name = match.groups()
            # Skip if name looks like a keyword
            if name.lower() not in ('wire', 'reg', 'signed', 'integer'):
                interface.ports.append(Port(
                    name=name,
                    direction=direction,
                    width=1,
                    is_signed=False
                ))

    # Style 2: Non-ANSI style declarations in body
    # input clk; input [7:0] data;
    if not interface.ports:
        body_pattern = r'(input|output|inout)\s*(wire|reg)?\s*(signed)?\s*(?:\[(\d+):(\d+)\])?\s*([\w,\s]+);'
        for match in re.finditer(body_pattern, module_code):
            direction, _, signed, msb, lsb, names = match.groups()

            width = 1
            if msb and lsb:
                width = abs(int(msb) - int(lsb)) + 1

            for name in names.split(','):
                name = name.strip()
                if name and not name.startswith('//'):
                    interface.ports.append(Port(
                        name=name,
                        direction=direction,
                        width=width,
                        is_signed=signed is not None
                    ))

    # Detect FSM
    interface.fsm = detect_fsm(module_code, localparams)

    return interface


def detect_fsm(verilog_code: str, localparams: dict) -> FSMInfo | None:
    """Detect FSM state machine from code patterns."""

    # Look for case(state) patterns
    case_match = re.search(r'case\s*\((\w+)\)', verilog_code)
    if not case_match:
        return None

    state_reg = case_match.group(1)

    # Find state register declaration
    reg_match = re.search(rf'reg\s*\[(\d+):(\d+)\]\s*{state_reg}', verilog_code)
    if not reg_match:
        return None

    msb, lsb = int(reg_match.group(1)), int(reg_match.group(2))
    state_width = abs(msb - lsb) + 1

    # Find states used in case statements
    states = []
    for param_name, param_value in localparams.items():
        # Check if this localparam is used in case statement for this state reg
        if re.search(rf'{state_reg}\s*<=\s*{param_name}|case.*{param_name}:', verilog_code):
            states.append(param_name)

    if not states:
        # Fall back to looking for patterns like: STATE_NAME: begin
        state_pattern = rf'(\w+)\s*:\s*begin'
        for match in re.finditer(state_pattern, verilog_code):
            candidate = match.group(1)
            if candidate.upper() == candidate and '_' in candidate:  # SCREAMING_CASE
                states.append(candidate)

    if states:
        return FSMInfo(
            state_reg=state_reg,
            states=states,
            state_width=state_width
        )

    return None


def generate_edge_cases(interface: ModuleInterface) -> list[dict]:
    """Generate edge case test values for all input ports."""
    edge_cases = []

    for port in interface.inputs:
        # Skip clock and reset
        if port.name.lower() in ("clk", "clock", "rst", "reset", "rst_n", "reset_n"):
            continue

        if port.is_array:
            continue  # Skip arrays for now

        cases = []
        w = port.width

        # Boundary values
        cases.append({"value": 0, "name": "zero"})
        cases.append({"value": port.max_value, "name": "max"})

        if w > 1:
            cases.append({"value": 1, "name": "one"})
            cases.append({"value": port.max_value - 1, "name": "max_minus_one"})

        # Powers of 2
        for i in range(min(w, 8)):
            val = 1 << i
            if val <= port.max_value:
                cases.append({"value": val, "name": f"pow2_{i}"})

        # Alternating bits
        if w >= 2:
            cases.append({"value": int('10' * (w // 2), 2), "name": "alternating_10"})
            cases.append({"value": int('01' * (w // 2), 2), "name": "alternating_01"})

        edge_cases.append({
            "port": port.name,
            "width": port.width,
            "cases": cases
        })

    return edge_cases


def to_dict(interface: ModuleInterface) -> dict:
    """Convert interface to dict for JSON serialization."""
    return {
        # Frontend expects module_name
        "module_name": interface.name,
        # Also include 'name' for backward compatibility
        "name": interface.name,
        # Frontend expects separate inputs/outputs arrays
        "inputs": [
            {"name": p.name, "width": p.width}
            for p in interface.ports if p.direction == "input"
        ],
        "outputs": [
            {"name": p.name, "width": p.width}
            for p in interface.ports if p.direction == "output"
        ],
        # Also include full ports list for backward compatibility
        "ports": [
            {
                "name": p.name,
                "direction": p.direction,
                "width": p.width,
                "is_signed": p.is_signed,
                "is_array": p.is_array
            }
            for p in interface.ports
        ],
        "parameters": {
            p.name: p.default_value for p in interface.parameters
        },
        "has_clock": interface.has_clock,
        "has_reset": interface.has_reset,
        "clock_name": interface.clock_name,
        "reset_name": interface.reset_name,
        "fsm": {
            "state_reg": interface.fsm.state_reg,
            "states": interface.fsm.states,
            "state_width": interface.fsm.state_width
        } if interface.fsm else None
    }


if __name__ == "__main__":
    # Test with sample module
    test_code = """
module matmul_4x4 (
    input wire clk,
    input wire rst,
    input wire start,
    input wire [7:0] a [0:3][0:3],
    input wire [7:0] b [0:3][0:3],
    output reg [15:0] c [0:3][0:3],
    output reg done
);

    reg [2:0] state;

    localparam IDLE = 3'b000;
    localparam COMPUTE = 3'b001;
    localparam DONE_STATE = 3'b010;

    always @(posedge clk) begin
        case (state)
            IDLE: state <= COMPUTE;
            COMPUTE: state <= DONE_STATE;
            DONE_STATE: state <= IDLE;
        endcase
    end
endmodule
"""

    iface = extract_module_interface(test_code)
    if iface:
        print(f"Module: {iface.name}")
        print(f"Ports: {len(iface.ports)}")
        for p in iface.ports:
            print(f"  {p.declaration}")
        print(f"Has clock: {iface.has_clock} ({iface.clock_name})")
        print(f"Has reset: {iface.has_reset} ({iface.reset_name})")
        if iface.fsm:
            print(f"FSM: {iface.fsm.state_reg} with states {iface.fsm.states}")
        print("\nEdge cases:")
        for ec in generate_edge_cases(iface):
            print(f"  {ec['port']}: {[c['name'] for c in ec['cases']]}")
