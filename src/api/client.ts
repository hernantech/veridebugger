/**
 * Mock API Client
 * 
 * This client simulates communication with:
 * - FPGA control/simulation backend
 * - Gemini 3 + LangGraph orchestration service
 * - HDL analysis and optimization tools
 * 
 * In production, these would be real REST/WebSocket endpoints.
 */

import type {
  CircuitRegion,
  SimulationState,
  SimulationConfig,
  TransformerConfig,
  OptimizationStats,
  OptimizationSuggestion,
  ChatMessage,
  ChatContext,
  SignalValue,
} from '../types';

import {
  generateMockCircuitRegion,
  generateMockSimulationState,
  mockTransformerConfigs,
  generateMockOptimizationStats,
  generateMockChatHistory,
} from './mockData';

// Simulated network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// Circuit & FPGA API
// ============================================

export const circuitApi = {
  /**
   * Fetch the current circuit region/layout
   */
  async getCircuitRegion(): Promise<CircuitRegion> {
    await delay(300);
    return generateMockCircuitRegion();
  },

  /**
   * Get node details by ID
   */
  async getNodeDetails(nodeId: string): Promise<CircuitRegion['nodes'][0] | null> {
    await delay(100);
    const region = generateMockCircuitRegion();
    return region.nodes.find(n => n.id === nodeId) || null;
  },

  /**
   * Update node position (for drag-and-drop in visualizer)
   */
  async updateNodePosition(nodeId: string, position: { x: number; y: number }): Promise<void> {
    await delay(50);
    console.log(`[Mock API] Updated node ${nodeId} position to`, position);
  },
};

// ============================================
// Simulation API
// ============================================

let mockSimState: SimulationState = generateMockSimulationState();

export const simulationApi = {
  /**
   * Get current simulation state
   */
  async getState(): Promise<SimulationState> {
    await delay(100);
    return { ...mockSimState };
  },

  /**
   * Start simulation
   */
  async start(config: SimulationConfig): Promise<SimulationState> {
    await delay(200);
    mockSimState = {
      ...mockSimState,
      status: 'running',
      currentTimestep: 0,
    };
    console.log('[Mock API] Starting simulation with config:', config);
    return mockSimState;
  },

  /**
   * Pause simulation
   */
  async pause(): Promise<SimulationState> {
    await delay(50);
    mockSimState = {
      ...mockSimState,
      status: 'paused',
    };
    return mockSimState;
  },

  /**
   * Resume simulation
   */
  async resume(): Promise<SimulationState> {
    await delay(50);
    mockSimState = {
      ...mockSimState,
      status: 'running',
    };
    return mockSimState;
  },

  /**
   * Single step simulation
   */
  async step(): Promise<SimulationState> {
    await delay(100);
    const newTimestep = Math.min(mockSimState.currentTimestep + 1, mockSimState.totalTimesteps);
    
    // Simulate some nodes becoming active
    const region = generateMockCircuitRegion();
    const activeNodes = region.nodes
      .filter(() => Math.random() > 0.6)
      .map(n => n.id);
    
    const activePaths = region.connections
      .filter(() => Math.random() > 0.7)
      .map(c => c.id);

    // Update signal values
    const signals = mockSimState.signals.map(sig => ({
      ...sig,
      values: sig.values.map((v, i) => 
        i === newTimestep 
          ? { ...v, value: (Math.random() > 0.5 ? 1 : 0) as SignalValue }
          : v
      ),
    }));

    // Keep 'running' status if we were running, only set 'stepping' for manual steps
    const wasRunning = mockSimState.status === 'running';
    const newStatus = newTimestep >= mockSimState.totalTimesteps 
      ? 'completed' 
      : wasRunning 
        ? 'running' 
        : 'stepping';

    mockSimState = {
      ...mockSimState,
      status: newStatus,
      currentTimestep: newTimestep,
      activeNodes,
      activePaths,
      signals,
    };
    return mockSimState;
  },

  /**
   * Reset simulation
   */
  async reset(): Promise<SimulationState> {
    await delay(100);
    mockSimState = generateMockSimulationState();
    return mockSimState;
  },

  /**
   * Set simulation timestep
   */
  async setTimestep(timestep: number): Promise<SimulationState> {
    await delay(50);
    mockSimState = {
      ...mockSimState,
      currentTimestep: Math.max(0, Math.min(timestep, mockSimState.totalTimesteps)),
    };
    return mockSimState;
  },
};

// ============================================
// Transformer Config API
// ============================================

export const transformerApi = {
  /**
   * Get available transformer configurations
   */
  async getConfigs(): Promise<TransformerConfig[]> {
    await delay(200);
    return mockTransformerConfigs;
  },

  /**
   * Get a specific transformer config
   */
  async getConfig(configId: string): Promise<TransformerConfig | null> {
    await delay(100);
    return mockTransformerConfigs.find(c => c.id === configId) || null;
  },

  /**
   * Update transformer configuration
   */
  async updateConfig(configId: string, updates: Partial<TransformerConfig>): Promise<TransformerConfig> {
    await delay(200);
    const config = mockTransformerConfigs.find(c => c.id === configId);
    if (!config) throw new Error(`Config ${configId} not found`);
    return { ...config, ...updates };
  },
};

// ============================================
// Optimization API
// ============================================

export const optimizationApi = {
  /**
   * Get current optimization stats and suggestions
   */
  async getStats(): Promise<OptimizationStats> {
    await delay(300);
    return generateMockOptimizationStats();
  },

  /**
   * Apply an optimization suggestion
   */
  async applySuggestion(suggestionId: string): Promise<OptimizationStats> {
    await delay(500);
    const stats = generateMockOptimizationStats();
    const suggestion = stats.suggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.applied = true;
      stats.currentLUTs -= (suggestion.beforeLUTs - suggestion.afterLUTs);
    }
    console.log(`[Mock API] Applied optimization: ${suggestionId}`);
    return stats;
  },

  /**
   * Revert an optimization
   */
  async revertSuggestion(suggestionId: string): Promise<OptimizationStats> {
    await delay(300);
    const stats = generateMockOptimizationStats();
    const suggestion = stats.suggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.applied = false;
    }
    return stats;
  },

  /**
   * Request new optimization analysis
   */
  async analyzeOptimizations(): Promise<OptimizationSuggestion[]> {
    await delay(1000);
    return generateMockOptimizationStats().suggestions;
  },
};

// ============================================
// Chat / Vibe Debugging API
// ============================================

let mockConversation: ChatMessage[] = generateMockChatHistory();

export const chatApi = {
  /**
   * Get conversation history
   */
  async getHistory(): Promise<ChatMessage[]> {
    await delay(100);
    return [...mockConversation];
  },

  /**
   * Send a message to the Gemini 3 assistant
   */
  async sendMessage(
    content: string,
    context?: ChatContext
  ): Promise<ChatMessage> {
    await delay(800);

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      context,
    };
    mockConversation.push(userMessage);

    // Generate mock assistant response
    const responses = [
      {
        content: `I've analyzed your query about the selected nodes. Here's what I found:

The circuit topology shows a typical attention mechanism implementation with:
- **Query/Key/Value projections** using parallel LUT arrays
- **DSP blocks** for matrix multiplication
- **Pipeline registers** for timing closure

The critical path runs through the Q projection → DSP attention → Softmax → Output chain. This is expected for attention mechanisms.

Would you like me to suggest optimizations for any specific component?`,
      },
      {
        content: `Looking at the LUT utilization patterns, I notice several opportunities:

1. **Shared Logic Extraction** - The Q and K projections have overlapping terms
2. **Register Retiming** - Some pipeline stages can be merged
3. **Approximate Computing** - Softmax can use piecewise approximation

Current utilization: **77.3%** of available LUTs
Target after optimization: **~58%**

Should I generate the HDL modifications for any of these?`,
        codeSnippets: [
          {
            language: 'verilog' as const,
            code: `// Optimization opportunity detected
// Before: 16 LUTs
assign q_out = w_q[0]*in[0] + w_q[1]*in[1];
assign k_out = w_k[0]*in[0] + w_k[1]*in[1];

// After: 12 LUTs (shared multiplier)
assign qk_common = in[0] + in[1];
assign q_out = w_q * qk_common;
assign k_out = w_k * qk_common;`,
            filename: 'attention_opt.v',
          },
        ],
      },
      {
        content: `Based on the current simulation state at timestep ${context?.currentTimestep || 0}:

The signal propagation looks correct. I see:
- Valid input assertion at cycle 5
- Q/K computation completing at cycle 8
- Attention scores stable at cycle 12
- Output valid at cycle 15

The pipeline latency of 10 cycles is within spec for a 200MHz target. No timing violations detected in the critical path.

Is there a specific signal or timing relationship you'd like me to analyze further?`,
      },
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: randomResponse.content,
      timestamp: new Date(),
      codeSnippets: randomResponse.codeSnippets,
    };
    mockConversation.push(assistantMessage);

    return assistantMessage;
  },

  /**
   * Clear conversation history
   */
  async clearHistory(): Promise<void> {
    await delay(100);
    mockConversation = [generateMockChatHistory()[0]]; // Keep system message
  },

  /**
   * Stream a response (simulated)
   */
  streamMessage(
    content: string,
    context: ChatContext | undefined,
    onChunk: (chunk: string) => void,
    onComplete: (message: ChatMessage) => void
  ): () => void {
    let cancelled = false;
    
    const fullResponse = `I'm analyzing your request about the circuit...

Based on the context you've provided, I can see that you're working with an attention mechanism implementation. Let me break down what I observe:

**Current State:**
- Selected nodes: ${context?.selectedNodeIds?.length || 0} components
- Timestep: ${context?.currentTimestep || 'N/A'}

**Analysis:**
The implementation follows a standard transformer attention pattern with Q/K/V projections feeding into DSP-based matrix operations.

Would you like me to suggest specific optimizations or explain any particular aspect in more detail?`;

    const words = fullResponse.split(' ');
    let index = 0;

    const interval = setInterval(() => {
      if (cancelled || index >= words.length) {
        clearInterval(interval);
        if (!cancelled) {
          const message: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date(),
          };
          mockConversation.push(message);
          onComplete(message);
        }
        return;
      }
      onChunk(words[index] + ' ');
      index++;
    }, 50);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  },
};

// ============================================
// WebSocket Simulation (for real-time updates)
// ============================================

type SimulationEventHandler = (state: SimulationState) => void;

class MockWebSocket {
  private handlers: Set<SimulationEventHandler> = new Set();
  private interval: number | null = null;

  subscribe(handler: SimulationEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  startSimulationUpdates(): void {
    if (this.interval) return;
    
    this.interval = window.setInterval(async () => {
      if (mockSimState.status === 'running') {
        const newState = await simulationApi.step();
        this.handlers.forEach(handler => handler(newState));
      }
    }, 200);
  }

  stopSimulationUpdates(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const mockWebSocket = new MockWebSocket();

