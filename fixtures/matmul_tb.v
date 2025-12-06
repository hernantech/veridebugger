`timescale 1ns/1ps

module matmul_tb;
    reg clk;
    reg rst;
    reg start;
    reg [7:0] a [0:3][0:3];
    reg [7:0] b [0:3][0:3];
    wire [15:0] c [0:3][0:3];
    wire done;

    reg [15:0] expected [0:3][0:3];
    integer passed, failed;
    integer i, j;

    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end

    matmul_4x4 dut (
        .clk(clk), .rst(rst), .start(start),
        .a(a), .b(b), .c(c), .done(done)
    );

    task compute_expected;
        integer ii, jj, kk;
        reg [15:0] sum;
        begin
            for (ii = 0; ii < 4; ii = ii + 1) begin
                for (jj = 0; jj < 4; jj = jj + 1) begin
                    sum = 0;
                    for (kk = 0; kk < 4; kk = kk + 1) begin
                        sum = sum + a[ii][kk] * b[kk][jj];
                    end
                    expected[ii][jj] = sum;
                end
            end
        end
    endtask

    task check_results;
        begin
            for (i = 0; i < 4; i = i + 1) begin
                for (j = 0; j < 4; j = j + 1) begin
                    if (c[i][j] === expected[i][j]) begin
                        passed = passed + 1;
                        $display("[PASS] c[%0d][%0d]=%0d", i, j, c[i][j]);
                    end else begin
                        failed = failed + 1;
                        $display("[FAIL] c[%0d][%0d]=%h expected=%h actual=%h",
                                 i, j, expected[i][j], expected[i][j], c[i][j]);
                    end
                end
            end
        end
    endtask

    initial begin
        $dumpfile("matmul_tb.vcd");
        $dumpvars(0, matmul_tb);

        passed = 0;
        failed = 0;
        rst = 1;
        start = 0;

        for (i = 0; i < 4; i = i + 1) begin
            for (j = 0; j < 4; j = j + 1) begin
                a[i][j] = (i == j) ? 1 : 0;
                b[i][j] = (i == j) ? 2 : 0;
            end
        end

        compute_expected();

        #20 rst = 0;
        #10 start = 1;
        #10 start = 0;

        wait(done == 1);
        #10;

        $display("=== Test Case 1 ===");
        check_results();

        $display("[DONE] passed=%0d failed=%0d", passed, failed);

        #100;
        $finish;
    end
endmodule
