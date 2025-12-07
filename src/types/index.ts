/**
 * TypeScript Types for Veridebug
 *
 * Types aligned with the real FastAPI backend.
 */

// ============================================
// Signal Value Types (VCD)
// ============================================

export type SignalValue = '0' | '1' | 'x' | 'X' | 'z' | 'Z' | string;

export interface VcdSignalValue {
  time: number;
  value: string;
}

export interface VcdSignal {
  name: string;
  width: number;
  values: VcdSignalValue[];
}

// ============================================
// Optimization Types
// ============================================

export type OptimizationGoal = 'compile' | 'verify' | 'optimize';

export type OptimizationPhase =
  | 'compile'
  | 'simulate'
  | 'debug'
  | 'synthesize'
  | 'optimize'
  | 'done';

export interface OptimizationStep {
  iteration: number;
  phase: OptimizationPhase;
  code?: string;
  lut_count?: number;
  lut_history?: number[];
  sim_passed: boolean;
  reasoning?: string;
  error?: string;
  done: boolean;
}

export interface OptimizationResult {
  final_code: string;
  lut_history: number[];
  iterations: number;
  reasoning: string[];
  success: boolean;
}

// ============================================
// Test Generation Types
// ============================================

export interface ModulePort {
  name: string;
  width: number;
}

export interface ModuleInterface {
  module_name: string;
  inputs: ModulePort[];
  outputs: ModulePort[];
  parameters: Array<{ name: string; value: string }>;
}

// ============================================
// VCD Debug Types
// ============================================

export interface VcdResult {
  success: boolean;
  vcd_path?: string;
  signals?: VcdSignal[];
  passed?: boolean;
  failures?: string[];
  raw_output?: string;
  error?: string;
}

// ============================================
// C to Verilog Conversion Types
// ============================================

export interface ConversionResult {
  success: boolean;
  verilog_code?: string;
  top_module?: string;
  raw_output?: string;
  error?: string;
}

export interface SyntaxCheckResult {
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

// ============================================
// UI State Types
// ============================================

export interface SelectionState {
  selectedSignalName: string | null;
  hoveredSignalName: string | null;
}

export interface ViewSettings {
  showSignalValues: boolean;
  zoomLevel: number;
  timeScale: number;
}
