// ============================================
// FPGA & Circuit Types
// ============================================

export type NodeType = 'lut' | 'register' | 'dsp' | 'io' | 'mux' | 'buffer';

export type SignalValue = 0 | 1 | 'X' | 'Z';

export interface FPGANode {
  id: string;
  name: string;
  type: NodeType;
  position: { x: number; y: number };
  utilization: number; // 0-100 percentage
  isCriticalPath: boolean;
  currentValue: SignalValue;
  fanIn: string[]; // IDs of input nodes
  fanOut: string[]; // IDs of output nodes
  lutEquation?: string; // For LUT nodes, the boolean equation
  bitWidth?: number;
}

export interface FPGAConnection {
  id: string;
  source: string;
  target: string;
  signalName: string;
  isActive: boolean;
  isCriticalPath: boolean;
}

export interface CircuitRegion {
  id: string;
  name: string;
  nodes: FPGANode[];
  connections: FPGAConnection[];
  totalLUTs: number;
  usedLUTs: number;
  totalRegisters: number;
  usedRegisters: number;
}

// ============================================
// Simulation Types
// ============================================

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'stepping' | 'completed' | 'error';

export interface SignalTimeSeries {
  signalId: string;
  signalName: string;
  values: Array<{
    timestamp: number;
    value: SignalValue;
  }>;
  isInput: boolean;
  isOutput: boolean;
  bitWidth: number;
}

export interface SimulationState {
  status: SimulationStatus;
  currentTimestep: number;
  totalTimesteps: number;
  clockFrequency: number; // MHz
  signals: SignalTimeSeries[];
  activeNodes: string[]; // IDs of currently active nodes
  activePaths: string[]; // IDs of currently active connections
}

export interface SimulationConfig {
  modelVariant: string;
  inputSequenceLength: number;
  batchSize: number;
  precision: 'fp32' | 'fp16' | 'int8' | 'int4';
  pipelineDepth: number;
}

// ============================================
// Transformer Config Types
// ============================================

export interface TransformerConfig {
  id: string;
  name: string;
  hiddenSize: number;
  numHeads: number;
  numLayers: number;
  vocabSize: number;
  maxSeqLength: number;
  activationType: 'gelu' | 'relu' | 'swish';
}

export interface TransformerRunStatus {
  isRunning: boolean;
  currentLayer: number;
  currentOperation: string;
  progress: number; // 0-100
  latencyMs: number;
  throughput: number; // tokens/sec
}

// ============================================
// Optimization Types
// ============================================

export interface OptimizationSuggestion {
  id: string;
  type: 'merge' | 'eliminate' | 'restructure' | 'pipeline' | 'share';
  title: string;
  description: string;
  affectedNodes: string[];
  beforeLUTs: number;
  afterLUTs: number;
  latencyImpact: number; // positive = slower, negative = faster
  confidence: number; // 0-100
  codeSnippet?: string;
  applied: boolean;
}

export interface OptimizationStats {
  originalLUTs: number;
  currentLUTs: number;
  targetLUTs: number;
  originalRegisters: number;
  currentRegisters: number;
  suggestions: OptimizationSuggestion[];
}

// ============================================
// Chat & Assistant Types
// ============================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatContext {
  selectedNodeIds: string[];
  selectedSignalIds: string[];
  selectedRegion?: string;
  currentTimestep?: number;
}

export interface CodeSnippet {
  language: 'verilog' | 'vhdl' | 'systemverilog' | 'json';
  code: string;
  filename?: string;
  highlightLines?: number[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  context?: ChatContext;
  codeSnippets?: CodeSnippet[];
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// UI State Types
// ============================================

export interface SelectionState {
  selectedNodeId: string | null;
  selectedSignalId: string | null;
  selectedRegionId: string | null;
  hoveredNodeId: string | null;
}

export interface ViewSettings {
  showCriticalPaths: boolean;
  showUtilization: boolean;
  showSignalValues: boolean;
  showNodeLabels: boolean;
  zoomLevel: number;
  panPosition: { x: number; y: number };
}

export interface PanelLayout {
  circuitPanelWidth: number;
  simulationPanelHeight: number;
  chatPanelWidth: number;
}

