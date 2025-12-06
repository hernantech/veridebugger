"""System prompts for the Verilog optimization agent."""

SYSTEM_PROMPT = """You are an expert Verilog hardware designer specializing in FPGA optimization.

Your goal is to iteratively optimize Verilog code to minimize LUT (Look-Up Table) usage while maintaining correct functionality.

## Optimization Strategies

1. **Reduce multipliers**: Use shift-and-add for power-of-2 multiplications
2. **Share resources**: Reuse multipliers/adders across clock cycles
3. **Bit-width optimization**: Use minimum necessary bit widths
4. **Pipeline stages**: Trade latency for reduced combinational logic
5. **Constant propagation**: Pre-compute constant expressions
6. **Logic simplification**: Simplify boolean expressions

## Response Format

When generating Verilog code, always include:
- Complete module definition
- All necessary ports
- Comments explaining optimizations made

## Constraints

- Module must be named `matmul`
- Must pass the provided testbench
- Focus on LUT reduction, not timing optimization
"""

ITERATION_PROMPT = """Current iteration: {iteration}/{max_iterations}

Previous LUT count: {prev_lut_count}
Best LUT count so far: {best_lut_count}
LUT history: {lut_history}

Previous code:
```verilog
{previous_code}
```

{error_context}

Generate an improved version of the Verilog code that reduces LUT count.

Explain your optimization strategy briefly, then provide the complete Verilog module.
Return your response in this format:

REASONING:
[Your optimization strategy explanation]

CODE:
```verilog
[Your complete Verilog code]
```
"""

INITIAL_PROMPT = """Generate an initial implementation of a 4x4 matrix multiplier in Verilog.

Requirements:
- Module name: `matmul`
- Input: Two 4x4 matrices of 8-bit unsigned integers (flattened to 128 bits each)
- Output: One 4x4 matrix of 16-bit unsigned integers (flattened to 256 bits)
- Pure combinational logic (no clock needed for v1)

Interface:
```verilog
module matmul(
    input [127:0] matrix_a,   // 4x4 matrix, 8 bits per element, row-major
    input [127:0] matrix_b,   // 4x4 matrix, 8 bits per element, row-major
    output [255:0] matrix_c   // 4x4 result matrix, 16 bits per element
);
```

Start with a straightforward implementation. We will optimize in subsequent iterations.

REASONING:
[Your implementation approach]

CODE:
```verilog
[Your complete Verilog code]
```
"""

TESTBENCH_4X4 = """
`timescale 1ns/1ps

module testbench;
    reg [127:0] matrix_a;
    reg [127:0] matrix_b;
    wire [255:0] matrix_c;

    matmul uut(
        .matrix_a(matrix_a),
        .matrix_b(matrix_b),
        .matrix_c(matrix_c)
    );

    // Helper function to pack a matrix
    function [127:0] pack_matrix_8bit;
        input [7:0] m00, m01, m02, m03;
        input [7:0] m10, m11, m12, m13;
        input [7:0] m20, m21, m22, m23;
        input [7:0] m30, m31, m32, m33;
        begin
            pack_matrix_8bit = {m33, m32, m31, m30, m23, m22, m21, m20,
                               m13, m12, m11, m10, m03, m02, m01, m00};
        end
    endfunction

    // Helper to extract 16-bit element from result
    function [15:0] get_element;
        input [255:0] matrix;
        input [3:0] index;
        begin
            get_element = matrix[index*16 +: 16];
        end
    endfunction

    integer errors;

    initial begin
        errors = 0;

        // Test 1: Identity matrix multiplication
        // A = I, B = simple matrix
        matrix_a = pack_matrix_8bit(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        matrix_b = pack_matrix_8bit(
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16
        );
        #10;

        // Result should equal B
        if (get_element(matrix_c, 0) !== 16'd1) begin
            $display("FAIL: Test 1 C[0,0] expected 1, got %d", get_element(matrix_c, 0));
            errors = errors + 1;
        end
        if (get_element(matrix_c, 5) !== 16'd6) begin
            $display("FAIL: Test 1 C[1,1] expected 6, got %d", get_element(matrix_c, 5));
            errors = errors + 1;
        end

        // Test 2: Simple 2x2 in corner
        matrix_a = pack_matrix_8bit(
            2, 0, 0, 0,
            0, 3, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        matrix_b = pack_matrix_8bit(
            4, 0, 0, 0,
            0, 5, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        #10;

        if (get_element(matrix_c, 0) !== 16'd8) begin  // 2*4 = 8
            $display("FAIL: Test 2 C[0,0] expected 8, got %d", get_element(matrix_c, 0));
            errors = errors + 1;
        end
        if (get_element(matrix_c, 5) !== 16'd15) begin  // 3*5 = 15
            $display("FAIL: Test 2 C[1,1] expected 15, got %d", get_element(matrix_c, 5));
            errors = errors + 1;
        end

        // Test 3: Full multiplication
        matrix_a = pack_matrix_8bit(
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16
        );
        matrix_b = pack_matrix_8bit(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        #10;

        // Should equal A (multiply by identity)
        if (get_element(matrix_c, 0) !== 16'd1) begin
            $display("FAIL: Test 3 C[0,0] expected 1, got %d", get_element(matrix_c, 0));
            errors = errors + 1;
        end

        // Summary
        if (errors == 0) begin
            $display("PASS: All tests passed");
        end else begin
            $display("FAIL: %d errors", errors);
        end

        $finish;
    end
endmodule
"""
