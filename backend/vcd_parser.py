"""
Simple VCD (Value Change Dump) parser for step debugging.
Extracts signal values and transitions from simulation waveforms.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Signal:
    name: str
    width: int
    identifier: str
    hierarchy: str

    @property
    def full_path(self) -> str:
        return f"{self.hierarchy}.{self.name}" if self.hierarchy else self.name


@dataclass
class Transition:
    time_ns: int
    value: str


@dataclass
class Waveform:
    signals: dict[str, Signal] = field(default_factory=dict)
    transitions: dict[str, list[Transition]] = field(default_factory=dict)
    timescale: str = "1ns"
    end_time: int = 0

    def get_value_at_time(self, signal_id: str, time: int) -> str | None:
        """Get signal value at specific time."""
        if signal_id not in self.transitions:
            return None

        trans = self.transitions[signal_id]
        value = None
        for t in trans:
            if t.time_ns <= time:
                value = t.value
            else:
                break
        return value

    def get_transitions_in_range(self, signal_id: str, start: int, end: int) -> list[Transition]:
        """Get transitions within time range."""
        if signal_id not in self.transitions:
            return []

        return [t for t in self.transitions[signal_id] if start <= t.time_ns <= end]


def parse_vcd(vcd_path: str | Path) -> Waveform:
    """Parse a VCD file into a Waveform object."""
    vcd_path = Path(vcd_path)
    if not vcd_path.exists():
        raise FileNotFoundError(f"VCD file not found: {vcd_path}")

    content = vcd_path.read_text()
    waveform = Waveform()

    # Parse timescale
    timescale_match = re.search(r'\$timescale\s+(\S+)\s+\$end', content)
    if timescale_match:
        waveform.timescale = timescale_match.group(1)

    # Parse signal definitions in $var sections
    # Format: $var wire 8 ! signal_name $end
    hierarchy_stack = []

    for line in content.split('\n'):
        line = line.strip()

        if line.startswith('$scope'):
            # $scope module testbench $end
            match = re.match(r'\$scope\s+\w+\s+(\S+)\s+\$end', line)
            if match:
                hierarchy_stack.append(match.group(1))

        elif line.startswith('$upscope'):
            if hierarchy_stack:
                hierarchy_stack.pop()

        elif line.startswith('$var'):
            # $var wire 8 ! signal_name $end
            # $var reg 1 " clk $end
            match = re.match(r'\$var\s+\w+\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+\[\d+:\d+\])?\s+\$end', line)
            if match:
                width, identifier, name = match.groups()
                hierarchy = '.'.join(hierarchy_stack)
                signal = Signal(
                    name=name,
                    width=int(width),
                    identifier=identifier,
                    hierarchy=hierarchy
                )
                waveform.signals[identifier] = signal
                waveform.transitions[identifier] = []

    # Parse value changes
    current_time = 0
    in_dumpvars = False

    for line in content.split('\n'):
        line = line.strip()

        if line.startswith('$dumpvars'):
            in_dumpvars = True
            continue
        elif line.startswith('$end') and in_dumpvars:
            in_dumpvars = False
            continue

        # Time marker: #1000
        if line.startswith('#'):
            try:
                current_time = int(line[1:])
                waveform.end_time = max(waveform.end_time, current_time)
            except ValueError:
                pass
            continue

        # Binary value change: 0! or 1! (single bit)
        if line and line[0] in '01xXzZ':
            value = line[0]
            identifier = line[1:]
            if identifier in waveform.transitions:
                waveform.transitions[identifier].append(
                    Transition(time_ns=current_time, value=value)
                )

        # Multi-bit value: b10101010 ! or bxxxxxxxx !
        elif line.startswith('b') or line.startswith('B'):
            parts = line.split()
            if len(parts) >= 2:
                value = parts[0][1:]  # Remove 'b' prefix
                identifier = parts[1]
                if identifier in waveform.transitions:
                    waveform.transitions[identifier].append(
                        Transition(time_ns=current_time, value=value)
                    )

    return waveform


def find_signal_by_name(waveform: Waveform, name: str) -> Signal | None:
    """Find signal by name (partial match supported)."""
    for sig in waveform.signals.values():
        if sig.name == name or sig.full_path.endswith(name):
            return sig
    return None


def trace_failure(
    waveform: Waveform,
    failure_signal: str,
    failure_time: int,
    window_ns: int = 100
) -> list[dict]:
    """
    Trace backwards from a failure to find potentially causal transitions.
    Returns list of transitions that occurred before the failure.
    """
    causal_chain = []
    start_time = max(0, failure_time - window_ns)

    for sig_id, signal in waveform.signals.items():
        transitions = waveform.get_transitions_in_range(sig_id, start_time, failure_time)
        for trans in transitions:
            causal_chain.append({
                "signal": signal.full_path,
                "time_ns": trans.time_ns,
                "value": trans.value,
                "delta_ns": failure_time - trans.time_ns
            })

    # Sort by time (most recent first)
    causal_chain.sort(key=lambda x: x["delta_ns"])

    return causal_chain[:20]  # Return top 20 most recent


def get_waveform_summary(waveform: Waveform) -> dict:
    """Get summary of waveform for API response."""
    signals_info = []
    for sig_id, signal in waveform.signals.items():
        trans_count = len(waveform.transitions.get(sig_id, []))
        signals_info.append({
            "id": sig_id,
            "name": signal.name,
            "path": signal.full_path,
            "width": signal.width,
            "transitions": trans_count
        })

    return {
        "timescale": waveform.timescale,
        "end_time": waveform.end_time,
        "signal_count": len(waveform.signals),
        "signals": signals_info
    }


if __name__ == "__main__":
    # Test with a simple VCD file
    test_vcd = """
$timescale 1ns $end
$scope module testbench $end
$var wire 1 ! clk $end
$var wire 8 " data [7:0] $end
$var wire 1 # valid $end
$upscope $end
$enddefinitions $end
$dumpvars
0!
b00000000 "
0#
$end
#10
1!
#20
0!
b00001111 "
1#
#30
1!
#40
0!
b11110000 "
#50
1!
0#
"""

    from tempfile import NamedTemporaryFile
    with NamedTemporaryFile(mode='w', suffix='.vcd', delete=False) as f:
        f.write(test_vcd)
        f.flush()

        wf = parse_vcd(f.name)
        print("Signals:", [(s.name, s.width) for s in wf.signals.values()])
        print("End time:", wf.end_time)
        print("\nData transitions:")
        for t in wf.transitions.get('"', []):
            print(f"  @{t.time_ns}ns: {t.value}")

        print("\nValue at t=25:", wf.get_value_at_time('"', 25))
        print("Value at t=45:", wf.get_value_at_time('"', 45))
