/**
 * Backend Response Schemas
 * 
 * These are the JSON formats the backend should return to update the UI.
 * The frontend will parse these and update the appropriate stores/components.
 */

// ============================================
// CIRCUIT VISUALIZATION RESPONSE
// ============================================

/**
 * Response format for circuit/topology updates
 * 
 * Example:
 * {
 *   "type": "circuit_update",
 *   "region": {
 *     "id": "attention_block_0",
 *     "name": "Attention Block 0",
 *     "stats": {
 *       "totalLUTs": 256,
 *       "usedLUTs": 198,
 *       "totalRegisters": 512,
 *       "usedRegisters": 480
 *     },
 *     "nodes": [...],
 *     "edges": [...]
 *   }
 * }
 */
export interface CircuitUpdateResponse {
  type: 'circuit_update';
  region: {
    id: string;
    name: string;
    stats: {
      totalLUTs: number;
      usedLUTs: number;
      totalRegisters: number;
      usedRegisters: number;
    };
    nodes: CircuitNodeData[];
    edges: CircuitEdgeData[];
  };
}

/**
 * Node format for circuit visualization
 * 
 * Example node:
 * {
 *   "id": "lut_softmax_0",
 *   "type": "lut",
 *   "label": "SOFTMAX_0",
 *   "position": { "x": 700, "y": 150 },
 *   "utilization": 92,
 *   "isCritical": true,
 *   "value": 1,
 *   "equation": "Y = exp(A) / sum(exp)",
 *   "bitWidth": 16
 * }
 */
export interface CircuitNodeData {
  id: string;
  type: 'lut' | 'register' | 'dsp' | 'io' | 'mux' | 'buffer';
  label: string;
  position: { x: number; y: number };
  utilization: number;        // 0-100
  isCritical: boolean;        // On critical path?
  value: 0 | 1 | 'X' | 'Z';   // Current signal value
  equation?: string;          // For LUTs: boolean equation
  bitWidth?: number;          // Signal width
}

/**
 * Edge format for circuit visualization
 * 
 * Example edge:
 * {
 *   "id": "lut_q_0_to_reg_q_0",
 *   "source": "lut_q_0",
 *   "target": "reg_q_0",
 *   "label": "q_proj_0",
 *   "isActive": true,
 *   "isCritical": false
 * }
 */
export interface CircuitEdgeData {
  id: string;
  source: string;             // Source node ID
  target: string;             // Target node ID
  label?: string;             // Signal name
  isActive?: boolean;         // Currently active in simulation
  isCritical?: boolean;       // On critical path
}

// ============================================
// SIMULATION STATE RESPONSE
// ============================================

/**
 * Response format for simulation state updates
 * 
 * Example:
 * {
 *   "type": "simulation_update",
 *   "status": "running",
 *   "timestep": 42,
 *   "totalTimesteps": 100,
 *   "clockMHz": 200,
 *   "activeNodes": ["lut_q_0", "dsp_attn_0"],
 *   "activeEdges": ["lut_q_0_to_reg_q_0"],
 *   "signals": [...]
 * }
 */
export interface SimulationUpdateResponse {
  type: 'simulation_update';
  status: 'idle' | 'running' | 'paused' | 'stepping' | 'completed' | 'error';
  timestep: number;
  totalTimesteps: number;
  clockMHz: number;
  activeNodes: string[];      // IDs of currently active nodes
  activeEdges: string[];      // IDs of currently active edges
  signals?: SignalData[];     // Optional: full signal updates
}

/**
 * Signal waveform data
 * 
 * Example signal:
 * {
 *   "id": "sig_clk",
 *   "name": "clk",
 *   "isInput": true,
 *   "isOutput": false,
 *   "bitWidth": 1,
 *   "values": [
 *     { "t": 0, "v": 0 },
 *     { "t": 1, "v": 1 },
 *     { "t": 2, "v": 0 }
 *   ]
 * }
 */
export interface SignalData {
  id: string;
  name: string;
  isInput: boolean;
  isOutput: boolean;
  bitWidth: number;
  values: Array<{
    t: number;                // Timestep
    v: 0 | 1 | 'X' | 'Z';     // Value
  }>;
}

// ============================================
// OPTIMIZATION RESPONSE
// ============================================

/**
 * Response format for optimization suggestions
 * 
 * Example:
 * {
 *   "type": "optimization_update",
 *   "stats": {
 *     "originalLUTs": 256,
 *     "currentLUTs": 198,
 *     "targetLUTs": 150
 *   },
 *   "suggestions": [...]
 * }
 */
export interface OptimizationUpdateResponse {
  type: 'optimization_update';
  stats: {
    originalLUTs: number;
    currentLUTs: number;
    targetLUTs: number;
    originalRegisters?: number;
    currentRegisters?: number;
  };
  suggestions: OptimizationSuggestionData[];
}

/**
 * Single optimization suggestion
 * 
 * Example:
 * {
 *   "id": "opt_merge_qk",
 *   "category": "merge",
 *   "title": "Merge Q/K Projection LUTs",
 *   "description": "Shared subexpressions can reduce LUT count by 25%",
 *   "affectedNodes": ["lut_q_0", "lut_k_0"],
 *   "lutsBefore": 16,
 *   "lutsAfter": 12,
 *   "latencyDelta": 0,
 *   "confidence": 92,
 *   "code": "// Verilog snippet...",
 *   "applied": false
 * }
 */
export interface OptimizationSuggestionData {
  id: string;
  category: 'merge' | 'eliminate' | 'restructure' | 'pipeline' | 'share';
  title: string;
  description: string;
  affectedNodes: string[];    // Node IDs affected
  lutsBefore: number;
  lutsAfter: number;
  latencyDelta: number;       // Positive = slower, negative = faster
  confidence: number;         // 0-100
  code?: string;              // Optional code snippet
  codeLanguage?: 'verilog' | 'vhdl' | 'systemverilog';
  applied: boolean;
}

// ============================================
// CHAT / ASSISTANT RESPONSE
// ============================================

/**
 * Response format for chat/assistant messages
 * 
 * Example:
 * {
 *   "type": "chat_response",
 *   "message": {
 *     "id": "msg_123",
 *     "role": "assistant",
 *     "content": "Looking at your softmax implementation...",
 *     "codeBlocks": [...],
 *     "highlightNodes": ["lut_softmax_0"],
 *     "highlightSignals": ["softmax_out"]
 *   }
 * }
 */
export interface ChatResponseData {
  type: 'chat_response';
  message: {
    id: string;
    role: 'assistant' | 'system';
    content: string;          // Markdown-formatted text
    codeBlocks?: CodeBlockData[];
    highlightNodes?: string[];   // Node IDs to highlight in circuit
    highlightSignals?: string[]; // Signal IDs to highlight in waveform
    suggestedActions?: SuggestedAction[];
  };
  isStreaming?: boolean;      // If true, more chunks coming
}

/**
 * Code block in chat response
 * 
 * Example:
 * {
 *   "language": "verilog",
 *   "code": "assign q_out = weight_q * input;",
 *   "filename": "attention.v",
 *   "highlightLines": [3, 4, 5]
 * }
 */
export interface CodeBlockData {
  language: 'verilog' | 'vhdl' | 'systemverilog' | 'json' | 'text';
  code: string;
  filename?: string;
  highlightLines?: number[];
}

/**
 * Suggested action buttons in chat
 */
export interface SuggestedAction {
  id: string;
  label: string;
  action: 'apply_optimization' | 'show_node' | 'show_signal' | 'run_simulation';
  payload: Record<string, unknown>;
}

// ============================================
// STREAMING RESPONSE (for real-time updates)
// ============================================

/**
 * For WebSocket or SSE streaming, use this wrapper
 * 
 * Example stream message:
 * {
 *   "event": "node_value_change",
 *   "data": {
 *     "nodeId": "lut_q_0",
 *     "value": 1
 *   }
 * }
 */
export interface StreamEvent {
  event: 
    | 'node_value_change'
    | 'edge_active_change'
    | 'timestep_advance'
    | 'chat_chunk'
    | 'simulation_status_change';
  data: Record<string, unknown>;
}

// Specific stream events
export interface NodeValueChangeEvent {
  event: 'node_value_change';
  data: {
    nodeId: string;
    value: 0 | 1 | 'X' | 'Z';
  };
}

export interface EdgeActiveChangeEvent {
  event: 'edge_active_change';
  data: {
    edgeId: string;
    isActive: boolean;
  };
}

export interface TimestepAdvanceEvent {
  event: 'timestep_advance';
  data: {
    timestep: number;
    activeNodes: string[];
    activeEdges: string[];
  };
}

export interface ChatChunkEvent {
  event: 'chat_chunk';
  data: {
    messageId: string;
    chunk: string;            // Text chunk to append
    done: boolean;            // True if this is the last chunk
  };
}

// ============================================
// COMBINED RESPONSE TYPE
// ============================================

/**
 * Union type for all possible backend responses
 * The frontend can switch on the 'type' field
 */
export type BackendResponse = 
  | CircuitUpdateResponse
  | SimulationUpdateResponse
  | OptimizationUpdateResponse
  | ChatResponseData;

// ============================================
// REQUEST FORMATS (what frontend sends)
// ============================================

/**
 * Chat request from frontend
 * 
 * Example:
 * {
 *   "type": "chat_request",
 *   "message": "How can I reduce LUT usage in softmax?",
 *   "context": {
 *     "selectedNodes": ["lut_softmax_0"],
 *     "selectedSignals": [],
 *     "currentTimestep": 42
 *   }
 * }
 */
export interface ChatRequest {
  type: 'chat_request';
  message: string;
  context?: {
    selectedNodes?: string[];
    selectedSignals?: string[];
    currentTimestep?: number;
    currentConfig?: {
      model: string;
      precision: string;
    };
  };
}

/**
 * Simulation control request
 */
export interface SimulationControlRequest {
  type: 'simulation_control';
  action: 'start' | 'pause' | 'resume' | 'step' | 'reset' | 'seek';
  payload?: {
    timestep?: number;        // For 'seek' action
    config?: {
      modelVariant: string;
      precision: string;
      sequenceLength: number;
      pipelineDepth: number;
    };
  };
}

/**
 * Optimization action request
 */
export interface OptimizationActionRequest {
  type: 'optimization_action';
  action: 'apply' | 'revert' | 'analyze';
  suggestionId?: string;      // For apply/revert
}

