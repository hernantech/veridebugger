// 4x4 Matrix Multiply - INTENTIONALLY BUGGY
module matmul_4x4 (
    input wire clk,
    input wire rst,
    input wire start,
    input wire [7:0] a [0:3][0:3],
    input wire [7:0] b [0:3][0:3],
    output reg [15:0] c [0:3][0:3],
    output reg done
);

    // BUG 1: Missing reg declaration for state
    // reg [2:0] state;

    localparam IDLE = 3'b000;
    localparam COMPUTE = 3'b001;
    localparam DONE_STATE = 3'b010;

    reg [1:0] i, j, k;
    reg [15:0] acc;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            state <= IDLE;  // BUG: state undeclared
            done <= 0;
            i <= 0;
            j <= 0;
            k <= 0;
            acc <= 0;
        end else begin
            case (state)
                IDLE: begin
                    done <= 0;
                    if (start) begin
                        state <= COMPUTE;
                        i <= 0;
                        j <= 0;
                        k <= 0;
                        acc <= 0;
                    end
                end

                COMPUTE: begin
                    acc = acc + a[i][k] * b[k][j];  // BUG: blocking in sequential

                    if (k == 3) begin
                        c[i][j] <= acc;
                        acc <= 0;
                        k <= 0;

                        if (j == 3) begin
                            j <= 0;
                            if (i == 3) begin
                                state <= DONE_STATE;
                            end else begin
                                i <= i + 1;
                            end
                        end else begin
                            j <= j + 1;
                        end
                    end else begin
                        k <= k + 1;
                    end
                end

                DONE_STATE: begin
                    done <= 1;
                    state <= IDLE;
                end

                default: state <= IDLE;
            endcase
        end
    end
endmodule
