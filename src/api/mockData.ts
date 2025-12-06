import type {
  FPGANode,
  FPGAConnection,
  CircuitRegion,
  SignalTimeSeries,
  SimulationState,
  TransformerConfig,
  OptimizationSuggestion,
  OptimizationStats,
  ChatMessage,
  SignalValue,
} from '../types';

// Generate mock FPGA nodes for a transformer attention block
export const generateMockNodes = (): FPGANode[] => {
  const nodes: FPGANode[] = [];
  
  // Input buffers
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `input_${i}`,
      name: `IN_${i}`,
      type: 'io',
      position: { x: 50, y: 100 + i * 120 },
      utilization: 0,
      isCriticalPath: i === 0,
      currentValue: i % 2 as SignalValue,
      fanIn: [],
      fanOut: [`lut_q_${i}`, `lut_k_${i}`, `lut_v_${i}`],
      bitWidth: 16,
    });
  }

  // Query projection LUTs
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `lut_q_${i}`,
      name: `Q_PROJ_${i}`,
      type: 'lut',
      position: { x: 250, y: 80 + i * 120 },
      utilization: 75 + Math.random() * 20,
      isCriticalPath: i === 0,
      currentValue: 'X',
      fanIn: [`input_${i}`],
      fanOut: [`reg_q_${i}`],
      lutEquation: 'Y = A & B | C ^ D',
      bitWidth: 16,
    });
  }

  // Key projection LUTs
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `lut_k_${i}`,
      name: `K_PROJ_${i}`,
      type: 'lut',
      position: { x: 250, y: 100 + i * 120 },
      utilization: 70 + Math.random() * 25,
      isCriticalPath: false,
      currentValue: 1,
      fanIn: [`input_${i}`],
      fanOut: [`reg_k_${i}`],
      lutEquation: 'Y = A ^ B & (C | D)',
      bitWidth: 16,
    });
  }

  // Value projection LUTs
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `lut_v_${i}`,
      name: `V_PROJ_${i}`,
      type: 'lut',
      position: { x: 250, y: 120 + i * 120 },
      utilization: 65 + Math.random() * 30,
      isCriticalPath: false,
      currentValue: 0,
      fanIn: [`input_${i}`],
      fanOut: [`reg_v_${i}`],
      lutEquation: 'Y = (A | B) & (C | D)',
      bitWidth: 16,
    });
  }

  // Pipeline registers for Q
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `reg_q_${i}`,
      name: `REG_Q_${i}`,
      type: 'register',
      position: { x: 400, y: 80 + i * 120 },
      utilization: 100,
      isCriticalPath: i === 0,
      currentValue: i % 2 as SignalValue,
      fanIn: [`lut_q_${i}`],
      fanOut: [`dsp_attn_${Math.floor(i / 2)}`],
      bitWidth: 16,
    });
  }

  // Pipeline registers for K
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `reg_k_${i}`,
      name: `REG_K_${i}`,
      type: 'register',
      position: { x: 400, y: 100 + i * 120 },
      utilization: 100,
      isCriticalPath: false,
      currentValue: 1,
      fanIn: [`lut_k_${i}`],
      fanOut: [`dsp_attn_${Math.floor(i / 2)}`],
      bitWidth: 16,
    });
  }

  // Pipeline registers for V
  for (let i = 0; i < 4; i++) {
    nodes.push({
      id: `reg_v_${i}`,
      name: `REG_V_${i}`,
      type: 'register',
      position: { x: 400, y: 120 + i * 120 },
      utilization: 100,
      isCriticalPath: false,
      currentValue: 0,
      fanIn: [`lut_v_${i}`],
      fanOut: [`mux_v_${Math.floor(i / 2)}`],
      bitWidth: 16,
    });
  }

  // DSP blocks for attention computation (Q*K)
  for (let i = 0; i < 2; i++) {
    nodes.push({
      id: `dsp_attn_${i}`,
      name: `DSP_ATTN_${i}`,
      type: 'dsp',
      position: { x: 550, y: 150 + i * 200 },
      utilization: 85 + Math.random() * 15,
      isCriticalPath: i === 0,
      currentValue: 'X',
      fanIn: [`reg_q_${i * 2}`, `reg_q_${i * 2 + 1}`, `reg_k_${i * 2}`, `reg_k_${i * 2 + 1}`],
      fanOut: [`lut_softmax_${i}`],
      bitWidth: 32,
    });
  }

  // Softmax LUTs
  for (let i = 0; i < 2; i++) {
    nodes.push({
      id: `lut_softmax_${i}`,
      name: `SOFTMAX_${i}`,
      type: 'lut',
      position: { x: 700, y: 150 + i * 200 },
      utilization: 90 + Math.random() * 10,
      isCriticalPath: i === 0,
      currentValue: 1,
      fanIn: [`dsp_attn_${i}`],
      fanOut: [`mux_v_${i}`],
      lutEquation: 'Y = exp(A) / sum(exp)',
      bitWidth: 16,
    });
  }

  // Value muxes
  for (let i = 0; i < 2; i++) {
    nodes.push({
      id: `mux_v_${i}`,
      name: `MUX_V_${i}`,
      type: 'mux',
      position: { x: 850, y: 150 + i * 200 },
      utilization: 60 + Math.random() * 20,
      isCriticalPath: i === 0,
      currentValue: 0,
      fanIn: [`lut_softmax_${i}`, `reg_v_${i * 2}`, `reg_v_${i * 2 + 1}`],
      fanOut: [`dsp_out_${i}`],
      bitWidth: 16,
    });
  }

  // Output DSPs
  for (let i = 0; i < 2; i++) {
    nodes.push({
      id: `dsp_out_${i}`,
      name: `DSP_OUT_${i}`,
      type: 'dsp',
      position: { x: 1000, y: 150 + i * 200 },
      utilization: 80 + Math.random() * 20,
      isCriticalPath: i === 0,
      currentValue: 'X',
      fanIn: [`mux_v_${i}`],
      fanOut: [`output_${i}`],
      bitWidth: 32,
    });
  }

  // Output buffers
  for (let i = 0; i < 2; i++) {
    nodes.push({
      id: `output_${i}`,
      name: `OUT_${i}`,
      type: 'io',
      position: { x: 1150, y: 150 + i * 200 },
      utilization: 0,
      isCriticalPath: i === 0,
      currentValue: i as SignalValue,
      fanIn: [`dsp_out_${i}`],
      fanOut: [],
      bitWidth: 16,
    });
  }

  return nodes;
};

// Generate connections based on fanIn/fanOut
export const generateMockConnections = (nodes: FPGANode[]): FPGAConnection[] => {
  const connections: FPGAConnection[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  nodes.forEach(node => {
    node.fanOut.forEach(targetId => {
      const target = nodeMap.get(targetId);
      if (target) {
        connections.push({
          id: `${node.id}_to_${targetId}`,
          source: node.id,
          target: targetId,
          signalName: `${node.name}_out`,
          isActive: Math.random() > 0.5,
          isCriticalPath: node.isCriticalPath && target.isCriticalPath,
        });
      }
    });
  });

  return connections;
};

// Generate mock circuit region
export const generateMockCircuitRegion = (): CircuitRegion => {
  const nodes = generateMockNodes();
  const connections = generateMockConnections(nodes);
  const lutNodes = nodes.filter(n => n.type === 'lut');
  const regNodes = nodes.filter(n => n.type === 'register');

  return {
    id: 'attention_block_0',
    name: 'Attention Block 0',
    nodes,
    connections,
    totalLUTs: 256,
    usedLUTs: lutNodes.length * 4,
    totalRegisters: 512,
    usedRegisters: regNodes.length * 16,
  };
};

// Generate mock signal time series
export const generateMockSignals = (): SignalTimeSeries[] => {
  const signals: SignalTimeSeries[] = [];
  const signalNames = [
    { name: 'clk', isInput: true, isOutput: false },
    { name: 'rst_n', isInput: true, isOutput: false },
    { name: 'data_in[15:0]', isInput: true, isOutput: false },
    { name: 'valid_in', isInput: true, isOutput: false },
    { name: 'q_proj[15:0]', isInput: false, isOutput: false },
    { name: 'k_proj[15:0]', isInput: false, isOutput: false },
    { name: 'attn_score[31:0]', isInput: false, isOutput: false },
    { name: 'softmax_out[15:0]', isInput: false, isOutput: false },
    { name: 'data_out[15:0]', isInput: false, isOutput: true },
    { name: 'valid_out', isInput: false, isOutput: true },
  ];

  signalNames.forEach((sig, idx) => {
    const values: Array<{ timestamp: number; value: SignalValue }> = [];
    for (let t = 0; t <= 100; t++) {
      let value: SignalValue;
      if (sig.name === 'clk') {
        value = (t % 2) as SignalValue;
      } else if (sig.name === 'rst_n') {
        value = t < 5 ? 0 : 1;
      } else {
        value = Math.random() > 0.5 ? 1 : 0;
      }
      values.push({ timestamp: t, value });
    }

    signals.push({
      signalId: `sig_${idx}`,
      signalName: sig.name,
      values,
      isInput: sig.isInput,
      isOutput: sig.isOutput,
      bitWidth: sig.name.includes('[') ? parseInt(sig.name.match(/\[(\d+)/)?.[1] || '1') + 1 : 1,
    });
  });

  return signals;
};

// Generate mock simulation state
export const generateMockSimulationState = (): SimulationState => ({
  status: 'idle',
  currentTimestep: 0,
  totalTimesteps: 100,
  clockFrequency: 200,
  signals: generateMockSignals(),
  activeNodes: [],
  activePaths: [],
});

// Mock transformer configs
export const mockTransformerConfigs: TransformerConfig[] = [
  {
    id: 'tiny',
    name: 'Tiny Transformer',
    hiddenSize: 128,
    numHeads: 2,
    numLayers: 2,
    vocabSize: 1000,
    maxSeqLength: 64,
    activationType: 'gelu',
  },
  {
    id: 'small',
    name: 'Small Transformer',
    hiddenSize: 256,
    numHeads: 4,
    numLayers: 4,
    vocabSize: 5000,
    maxSeqLength: 128,
    activationType: 'gelu',
  },
  {
    id: 'medium',
    name: 'Medium Transformer',
    hiddenSize: 512,
    numHeads: 8,
    numLayers: 6,
    vocabSize: 10000,
    maxSeqLength: 256,
    activationType: 'swish',
  },
];

// Mock optimization suggestions
export const generateMockOptimizations = (): OptimizationSuggestion[] => [
  {
    id: 'opt_1',
    type: 'merge',
    title: 'Merge Q/K Projection LUTs',
    description: 'The Q and K projection LUTs share common subexpressions. Merging them can reduce total LUT count by 25%.',
    affectedNodes: ['lut_q_0', 'lut_q_1', 'lut_k_0', 'lut_k_1'],
    beforeLUTs: 16,
    afterLUTs: 12,
    latencyImpact: 0,
    confidence: 92,
    codeSnippet: `// Before: Separate Q and K projections
wire [15:0] q_proj = weight_q * input;
wire [15:0] k_proj = weight_k * input;

// After: Merged projection with shared multiplier
wire [31:0] qk_proj = {weight_q, weight_k} * input;
wire [15:0] q_proj = qk_proj[31:16];
wire [15:0] k_proj = qk_proj[15:0];`,
    applied: false,
  },
  {
    id: 'opt_2',
    type: 'eliminate',
    title: 'Remove Redundant Registers',
    description: 'Pipeline registers REG_K_2 and REG_K_3 can be eliminated by retiming the DSP blocks.',
    affectedNodes: ['reg_k_2', 'reg_k_3'],
    beforeLUTs: 8,
    afterLUTs: 0,
    latencyImpact: 1,
    confidence: 78,
    applied: false,
  },
  {
    id: 'opt_3',
    type: 'restructure',
    title: 'Restructure Softmax Computation',
    description: 'Use a piecewise linear approximation for softmax to reduce LUT usage significantly.',
    affectedNodes: ['lut_softmax_0', 'lut_softmax_1'],
    beforeLUTs: 24,
    afterLUTs: 10,
    latencyImpact: 2,
    confidence: 85,
    codeSnippet: `// Piecewise linear softmax approximation
function [15:0] softmax_approx(input [15:0] x);
  if (x < 16'h1000) softmax_approx = x >> 2;
  else if (x < 16'h4000) softmax_approx = x >> 1;
  else softmax_approx = 16'hFFFF - (16'hFFFF - x) >> 2;
endfunction`,
    applied: false,
  },
  {
    id: 'opt_4',
    type: 'share',
    title: 'Share DSP Blocks Across Heads',
    description: 'Time-multiplex DSP blocks between attention heads to reduce DSP utilization.',
    affectedNodes: ['dsp_attn_0', 'dsp_attn_1', 'dsp_out_0', 'dsp_out_1'],
    beforeLUTs: 4,
    afterLUTs: 2,
    latencyImpact: 4,
    confidence: 70,
    applied: false,
  },
];

// Mock optimization stats
export const generateMockOptimizationStats = (): OptimizationStats => ({
  originalLUTs: 256,
  currentLUTs: 198,
  targetLUTs: 150,
  originalRegisters: 512,
  currentRegisters: 480,
  suggestions: generateMockOptimizations(),
});

// Mock chat messages
export const generateMockChatHistory = (): ChatMessage[] => [
  {
    id: 'msg_1',
    role: 'system',
    content: 'Vibe Debugger initialized. I can help you understand and optimize your FPGA transformer implementation. Select any node, signal, or region to add context to our conversation.',
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: 'msg_2',
    role: 'user',
    content: 'Why is the softmax block using so many LUTs?',
    timestamp: new Date(Date.now() - 240000),
  },
  {
    id: 'msg_3',
    role: 'assistant',
    content: `The softmax computation is LUT-intensive because it requires:

1. **Exponential calculation** - The exp(x) function needs either a lookup table or CORDIC implementation
2. **Normalization** - Division by the sum of exponentials requires additional logic
3. **Precision handling** - 16-bit fixed-point requires careful overflow management

Looking at your current implementation, I see you're using a direct lookup table approach which consumes ~24 LUTs per softmax unit.

**Recommendation:** Consider using a piecewise linear approximation. This can reduce LUT usage by ~60% with minimal accuracy loss for inference.`,
    timestamp: new Date(Date.now() - 180000),
    codeSnippets: [
      {
        language: 'verilog',
        code: `// Current implementation (LUT-heavy)
wire [15:0] exp_val = exp_lut[x[11:0]];

// Suggested: Piecewise linear
wire [15:0] exp_approx = (x < THRESH) ? 
  (x >> 2) : (x >> 1) + OFFSET;`,
        filename: 'softmax.v',
        highlightLines: [4, 5],
      },
    ],
  },
];

