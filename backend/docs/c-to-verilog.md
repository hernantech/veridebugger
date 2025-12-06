# C-to-Verilog HLS Conversion

This feature enables automatic conversion of C code to synthesizable Verilog using the BAMBU High-Level Synthesis (HLS) tool.

## Overview

The C-to-Verilog conversion pipeline allows developers who are familiar with C but not Verilog to generate hardware descriptions. The generated Verilog can then be debugged and optimized using the existing VeriDebugger agent workflow.

```
C Code → [gcc syntax check] → [BAMBU HLS] → Verilog → [Debug/Optimize Pipeline]
```

## API Endpoints

### POST /convert

Converts C code to Verilog using BAMBU HLS.

**Request:**
```json
{
  "c_code": "int add(int a, int b) { return a + b; }",
  "top_function": "add"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "verilog_code": "// Politecnico di Milano\n// Code created using PandA...",
  "message": "C code successfully converted to Verilog"
}
```

**Error Response (400):**
```json
{
  "detail": {
    "success": false,
    "errors": ["C syntax errors - fix before conversion:", "..."],
    "raw_output": "..."
  }
}
```

### POST /convert/check

Validates C code syntax without performing conversion. Use this for quick validation before attempting full HLS conversion.

**Request:**
```json
{
  "c_code": "int add(int a, int b) { return a + b; }"
}
```

**Response:**
```json
{
  "success": true,
  "errors": [],
  "raw_output": ""
}
```

## Fail-Fast Behavior

The conversion pipeline validates C syntax using `gcc -fsyntax-only` before invoking BAMBU. This provides:

1. **Faster feedback** - gcc syntax checking is instant; BAMBU can take 10-30 seconds
2. **Better error messages** - gcc errors are well-understood and actionable
3. **No wasted cycles** - invalid C never reaches the HLS tool

## HLS Constraints

Not all valid C code can be synthesized to hardware. The following constructs are **not supported**:

| Construct | Example | Reason |
|-----------|---------|--------|
| Dynamic allocation | `malloc()`, `free()` | Hardware has fixed resources |
| Recursion | `int fib(n) { return fib(n-1)... }` | Requires unbounded stack |
| Unbounded loops | `while(1)` without pragma | Must be statically analyzable |
| Function pointers | `void (*fn)() = ...` | Dynamic dispatch not synthesizable |

## Dependencies

The conversion feature requires:

- **gcc** - For C syntax validation (typically pre-installed)
- **clang-12** - Required by BAMBU for preprocessing
- **BAMBU HLS** - The actual C-to-Verilog synthesis tool

### BAMBU Installation

BAMBU is distributed as an AppImage. To install:

```bash
# Download AppImage
curl -L -o /tmp/bambu.AppImage https://release.bambuhls.eu/bambu-0.9.7.AppImage
chmod +x /tmp/bambu.AppImage

# Extract (FUSE not required)
cd /tmp && ./bambu.AppImage --appimage-extract

# Create symlinks (requires sudo)
sudo ln -sf /tmp/squashfs-root/usr/share/panda /usr/share/panda
sudo ln -sf /tmp/squashfs-root/usr/gcc_plugins /usr/gcc_plugins
sudo ln -sf /tmp/squashfs-root/usr/bin/bambu /usr/local/bin/bambu
sudo ln -sf /tmp/squashfs-root/usr/bin/gcc-4.9 /usr/bin/gcc-4.9
sudo ln -sf /tmp/squashfs-root/usr/bin/gcc-7 /usr/bin/gcc-7
sudo ln -sf /tmp/squashfs-root/usr/bin/g++-4.9 /usr/bin/g++-4.9
sudo ln -sf /tmp/squashfs-root/usr/bin/g++-7 /usr/bin/g++-7

# Install clang-12
sudo apt install -y clang-12
```

## Example: Simple Adder

**Input C code:**
```c
int add(int a, int b) {
    return a + b;
}
```

**Generated Verilog (excerpt):**
```verilog
module add(
  input clock,
  input reset,
  input start_port,
  input [31:0] a,
  input [31:0] b,
  output done_port,
  output [31:0] return_port
);
  // FSM and datapath logic...
  assign return_port = a + b;
endmodule
```

## Integration with Debug Pipeline

After conversion, the generated Verilog can be fed into the existing optimization pipeline:

```bash
# Step 1: Convert C to Verilog
curl -X POST http://localhost:8080/convert \
  -H "Content-Type: application/json" \
  -d '{"c_code": "...", "top_function": "myfunction"}' \
  > result.json

# Step 2: Extract Verilog and optimize
VERILOG=$(jq -r '.verilog_code' result.json)
curl -X POST http://localhost:8080/optimize \
  -H "Content-Type: application/json" \
  -d "{\"design_code\": \"$VERILOG\", \"testbench_code\": \"...\", \"max_iterations\": 10}"
```

## Files Changed

| File | Changes |
|------|---------|
| `parsers.py` | Added `ConvertResult` dataclass |
| `tools.py` | Added `check_c_syntax()` and `convert_c_to_verilog()` functions |
| `main.py` | Added `/convert` and `/convert/check` endpoints |

## References

- [BAMBU HLS Project](https://panda.deib.polimi.it/)
- [BAMBU GitHub](https://github.com/ferrandi/PandA-bambu)
- [BAMBU AppImage Downloads](https://release.bambuhls.eu/)
