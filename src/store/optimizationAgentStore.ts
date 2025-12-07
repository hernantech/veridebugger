/**
 * Optimization Agent Store
 *
 * Manages the state for the Verilog optimization agent.
 * Connects to the FastAPI backend via REST and WebSocket.
 */

import { create } from 'zustand';
import {
  backendApi,
  createOptimizationStream,
  createTestGenStream,
  OptimizationStream,
  type StreamStep,
} from '../api/backendApi';

/**
 * Extract the top-level function name from C code.
 * Looks for function definitions and returns the first non-main function,
 * or 'main' if that's the only one.
 */
function extractTopFunction(cCode: string): string {
  // Match C function definitions: return_type function_name(params) {
  // Handles: void foo(...), int bar(...), static void baz(...), etc.
  const funcPattern = /(?:^|[\s;{}])(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:unsigned\s+)?(?:signed\s+)?(?:long\s+)?(?:short\s+)?(?:void|int|char|float|double|bool|\w+_t)\s+\**\s*(\w+)\s*\([^)]*\)\s*\{/gm;

  const functions: string[] = [];
  let match;
  while ((match = funcPattern.exec(cCode)) !== null) {
    const funcName = match[1];
    // Skip common non-top-level function names
    if (funcName && !funcName.startsWith('_')) {
      functions.push(funcName);
    }
  }

  // Prefer non-main functions as the top function for HLS
  const nonMain = functions.find(f => f !== 'main');
  if (nonMain) return nonMain;

  // Fall back to main or first function found
  return functions[0] || 'main';
}

type AgentMode = 'optimize' | 'testgen';
type AgentStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed';
export type CodeLanguage = 'verilog' | 'c';
export type OptimizationGoal = 'compile' | 'verify' | 'optimize';

interface OptimizationRun {
  runId: string;
  mode: AgentMode;
  iteration: number;
  status: AgentStatus;
  code: string;
  testbenchCode: string;
  lutCount: number | null;
  lutHistory: number[];
  agentReasoning: string;
  simPassed: boolean;
  error: string | null;
  done: boolean;
}

interface OptimizationAgentStore {
  // Current run state
  currentRun: OptimizationRun | null;
  isStarting: boolean;
  isConnected: boolean;
  error: string | null;

  // Input state
  designCode: string;
  testbenchCode: string;
  maxIterations: number;
  codeLanguage: CodeLanguage;
  goal: OptimizationGoal;

  // C to Verilog conversion state
  isConverting: boolean;
  conversionMessage: string | null;
  conversionSuccess: boolean | null;

  // Actions
  setDesignCode: (code: string) => void;
  setTestbenchCode: (code: string) => void;
  setMaxIterations: (max: number) => void;
  setCodeLanguage: (lang: CodeLanguage) => void;
  setGoal: (goal: OptimizationGoal) => void;
  convertCToVerilog: () => Promise<void>;
  clearConversionMessage: () => void;
  startOptimization: () => Promise<void>;
  startTestGen: () => Promise<void>;
  generateTestbench: () => Promise<void>;
  stopOptimization: () => void;
  clearError: () => void;
  reset: () => void;

  // Internal
  _stream: OptimizationStream | null;
  _setStream: (stream: OptimizationStream | null) => void;
}

const SAMPLE_DESIGN = `module matmul #(
  parameter WIDTH = 8,
  parameter SIZE = 4
)(
  input clk,
  input rst,
  input [WIDTH*SIZE*SIZE-1:0] A,
  input [WIDTH*SIZE*SIZE-1:0] B,
  output reg [WIDTH*2*SIZE*SIZE-1:0] C,
  output reg done
);
  // 4x4 matrix multiplication
  integer i, j, k;
  always @(posedge clk) begin
    if (rst) begin
      C <= 0;
      done <= 0;
    end else begin
      for (i = 0; i < SIZE; i = i + 1) begin
        for (j = 0; j < SIZE; j = j + 1) begin
          C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] = 0;
          for (k = 0; k < SIZE; k = k + 1) begin
            C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] =
              C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] +
              A[(i*SIZE+k)*WIDTH +: WIDTH] * B[(k*SIZE+j)*WIDTH +: WIDTH];
          end
        end
      end
      done <= 1;
    end
  end
endmodule`;

const SAMPLE_TESTBENCH = `\`timescale 1ns/1ps
module matmul_tb;
  parameter WIDTH = 8;
  parameter SIZE = 4;

  reg clk, rst;
  reg [WIDTH*SIZE*SIZE-1:0] A, B;
  wire [WIDTH*2*SIZE*SIZE-1:0] C;
  wire done;

  matmul #(.WIDTH(WIDTH), .SIZE(SIZE)) dut (
    .clk(clk), .rst(rst),
    .A(A), .B(B), .C(C), .done(done)
  );

  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end

  initial begin
    rst = 1;
    A = 0; B = 0;
    #20 rst = 0;
    // Identity matrix test
    A = {8'd1, 8'd0, 8'd0, 8'd0,
         8'd0, 8'd1, 8'd0, 8'd0,
         8'd0, 8'd0, 8'd1, 8'd0,
         8'd0, 8'd0, 8'd0, 8'd1};
    B = A;
    #100;
    if (done) $display("Test passed");
    else $display("Test failed");
    $finish;
  end
endmodule`;

const SAMPLE_C_CODE = `// Simple matrix multiplication in C
// This will be converted to Verilog using BAMBU HLS

#define SIZE 4

void matmul(int A[SIZE][SIZE], int B[SIZE][SIZE], int C[SIZE][SIZE]) {
    for (int i = 0; i < SIZE; i++) {
        for (int j = 0; j < SIZE; j++) {
            C[i][j] = 0;
            for (int k = 0; k < SIZE; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
}`;

export const useOptimizationAgentStore = create<OptimizationAgentStore>((set, get) => ({
  currentRun: null,
  isStarting: false,
  isConnected: false,
  error: null,
  _stream: null,

  // Input state with sample defaults
  designCode: SAMPLE_DESIGN,
  testbenchCode: SAMPLE_TESTBENCH,
  maxIterations: 10,
  codeLanguage: 'verilog' as CodeLanguage,
  goal: 'optimize' as OptimizationGoal,

  // C to Verilog conversion state
  isConverting: false,
  conversionMessage: null,
  conversionSuccess: null,

  setDesignCode: (code) => set({ designCode: code }),
  setTestbenchCode: (code) => set({ testbenchCode: code }),
  setMaxIterations: (max) => set({ maxIterations: max }),
  setCodeLanguage: (lang) => {
    // Switch sample code when language changes
    if (lang === 'c') {
      set({ codeLanguage: lang, designCode: SAMPLE_C_CODE });
    } else {
      set({ codeLanguage: lang, designCode: SAMPLE_DESIGN });
    }
  },

  setGoal: (goal) => set({ goal }),

  convertCToVerilog: async () => {
    const { designCode } = get();
    set({ isConverting: true, conversionMessage: null, conversionSuccess: null });

    try {
      // Extract the top function name from the C code
      const topFunction = extractTopFunction(designCode);

      const response = await backendApi.convertCToVerilog({
        c_code: designCode,
        top_function: topFunction,
      });

      if (response.success && response.verilog_code) {
        set({
          designCode: response.verilog_code,
          codeLanguage: 'verilog',
          isConverting: false,
          conversionMessage: 'Successfully converted C to Verilog!',
          conversionSuccess: true,
        });
      } else {
        const errorMsg = response.errors?.join(', ') || response.message || 'Conversion failed';
        set({
          isConverting: false,
          conversionMessage: errorMsg,
          conversionSuccess: false,
        });
      }
    } catch (err) {
      set({
        isConverting: false,
        conversionMessage: (err as Error).message,
        conversionSuccess: false,
      });
    }
  },

  clearConversionMessage: () => set({ conversionMessage: null, conversionSuccess: null }),

  _setStream: (stream) => {
    set({ _stream: stream });
  },

  startOptimization: async () => {
    const { designCode, testbenchCode, maxIterations, goal } = get();

    // Clean up existing stream
    const existingStream = get()._stream;
    if (existingStream) {
      existingStream.close();
    }

    set({ isStarting: true, error: null, currentRun: null });

    try {
      // Start the optimization run with goal
      const response = await backendApi.startOptimization({
        design_code: designCode,
        testbench_code: testbenchCode,
        max_iterations: maxIterations,
        goal: goal,
      });

      const runId = response.run_id;

      // Initialize run state
      set({
        currentRun: {
          runId,
          mode: 'optimize',
          iteration: 0,
          status: 'running',
          code: designCode,
          testbenchCode: testbenchCode,
          lutCount: null,
          lutHistory: [],
          agentReasoning: '',
          simPassed: false,
          error: null,
          done: false,
        },
        isStarting: false,
      });

      // Create WebSocket stream for real-time updates
      const stream = createOptimizationStream(
        runId,
        // onUpdate
        (step: StreamStep) => {
          set((state) => ({
            currentRun: state.currentRun ? {
              ...state.currentRun,
              iteration: step.iteration,
              status: step.done ? (step.error ? 'failed' : 'completed') : 'running',
              code: step.code || state.currentRun.code,
              lutCount: step.lut_count,
              lutHistory: step.lut_history || state.currentRun.lutHistory,
              agentReasoning: step.reasoning || state.currentRun.agentReasoning,
              simPassed: step.sim_passed,
              error: step.error,
              done: step.done,
            } : null,
            isConnected: true,
          }));
        },
        // onError
        (error: string) => {
          set({ error, isConnected: false });
        },
        // onClose
        () => {
          set({ isConnected: false });
          get()._setStream(null);
        }
      );

      set({ _stream: stream, isConnected: true });
    } catch (err) {
      set({
        error: (err as Error).message,
        isStarting: false,
        isConnected: false,
      });
    }
  },

  startTestGen: async () => {
    const { designCode, maxIterations } = get();

    // Clean up existing stream
    const existingStream = get()._stream;
    if (existingStream) {
      existingStream.close();
    }

    set({ isStarting: true, error: null, currentRun: null });

    try {
      const response = await backendApi.startTestGen({
        design_code: designCode,
        max_iterations: maxIterations,
      });

      const runId = response.run_id;

      set({
        currentRun: {
          runId,
          mode: 'testgen',
          iteration: 0,
          status: 'running',
          code: designCode,
          testbenchCode: '',
          lutCount: null,
          lutHistory: [],
          agentReasoning: '',
          simPassed: false,
          error: null,
          done: false,
        },
        isStarting: false,
      });

      const stream = createTestGenStream(
        runId,
        (step: StreamStep) => {
          set((state) => ({
            currentRun: state.currentRun ? {
              ...state.currentRun,
              iteration: step.iteration,
              status: step.done ? (step.error ? 'failed' : 'completed') : 'running',
              code: step.code || state.currentRun.code,
              lutCount: step.lut_count,
              lutHistory: step.lut_history || state.currentRun.lutHistory,
              agentReasoning: step.reasoning || state.currentRun.agentReasoning,
              simPassed: step.sim_passed,
              error: step.error,
              done: step.done,
            } : null,
            isConnected: true,
          }));
        },
        (error: string) => {
          set({ error, isConnected: false });
        },
        () => {
          set({ isConnected: false });
          get()._setStream(null);
        }
      );

      set({ _stream: stream, isConnected: true });
    } catch (err) {
      set({
        error: (err as Error).message,
        isStarting: false,
        isConnected: false,
      });
    }
  },

  generateTestbench: async () => {
    const { designCode } = get();
    set({ isStarting: true, error: null });

    try {
      const response = await backendApi.generateTestbench(designCode);
      set({
        testbenchCode: response.testbench_code,
        isStarting: false,
      });
    } catch (err) {
      set({
        error: (err as Error).message,
        isStarting: false,
      });
    }
  },

  stopOptimization: () => {
    const stream = get()._stream;
    if (stream) {
      stream.close();
    }
    set({ _stream: null, isConnected: false });
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    const stream = get()._stream;
    if (stream) {
      stream.close();
    }
    set({
      currentRun: null,
      isStarting: false,
      isConnected: false,
      error: null,
      _stream: null,
    });
  },
}));

// Selector hooks for convenience
export const useCurrentOptimizationRun = () =>
  useOptimizationAgentStore((state) => state.currentRun);

export const useOptimizationStatus = () =>
  useOptimizationAgentStore((state) => ({
    isStarting: state.isStarting,
    isConnected: state.isConnected,
    error: state.error,
  }));

export const useLutHistory = () =>
  useOptimizationAgentStore((state) => state.currentRun?.lutHistory ?? []);

export const useCurrentCode = () =>
  useOptimizationAgentStore((state) => state.currentRun?.code ?? '');

export const useAgentReasoning = () =>
  useOptimizationAgentStore((state) => state.currentRun?.agentReasoning ?? '');

export const useDesignCode = () =>
  useOptimizationAgentStore((state) => state.designCode);

export const useTestbenchCode = () =>
  useOptimizationAgentStore((state) => state.testbenchCode);

export const useCodeLanguage = () =>
  useOptimizationAgentStore((state) => state.codeLanguage);

export const useConversionState = () =>
  useOptimizationAgentStore((state) => ({
    isConverting: state.isConverting,
    conversionMessage: state.conversionMessage,
    conversionSuccess: state.conversionSuccess,
  }));

export const useGoal = () =>
  useOptimizationAgentStore((state) => state.goal);
