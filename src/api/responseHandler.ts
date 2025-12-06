/**
 * Response Handler
 * 
 * This module shows how to process backend responses and update the UI.
 * Connect this to your WebSocket or REST API response handlers.
 */

import type {
  BackendResponse,
  CircuitUpdateResponse,
  SimulationUpdateResponse,
  OptimizationUpdateResponse,
  ChatResponseData,
  StreamEvent,
  NodeValueChangeEvent,
  TimestepAdvanceEvent,
  ChatChunkEvent,
} from './schemas';

import { useCircuitStore, useSimulationStore, useOptimizationStore, useChatStore, useSelectionStore } from '../store';
import type { FPGANode, FPGAConnection, SignalTimeSeries, OptimizationSuggestion, ChatMessage } from '../types';

/**
 * Main response handler - call this when you receive data from the backend
 */
export function handleBackendResponse(response: BackendResponse): void {
  switch (response.type) {
    case 'circuit_update':
      handleCircuitUpdate(response);
      break;
    case 'simulation_update':
      handleSimulationUpdate(response);
      break;
    case 'optimization_update':
      handleOptimizationUpdate(response);
      break;
    case 'chat_response':
      handleChatResponse(response);
      break;
    default:
      console.warn('Unknown response type:', response);
  }
}

/**
 * Handle circuit topology updates
 */
function handleCircuitUpdate(response: CircuitUpdateResponse): void {
  const { region } = response;
  
  // Convert backend format to frontend format
  const nodes: FPGANode[] = region.nodes.map(node => ({
    id: node.id,
    name: node.label,
    type: node.type,
    position: node.position,
    utilization: node.utilization,
    isCriticalPath: node.isCritical,
    currentValue: node.value,
    fanIn: [], // Will be computed from edges
    fanOut: [],
    lutEquation: node.equation,
    bitWidth: node.bitWidth,
  }));

  // Build fanIn/fanOut from edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  region.edges.forEach(edge => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (source) source.fanOut.push(edge.target);
    if (target) target.fanIn.push(edge.source);
  });

  const connections: FPGAConnection[] = region.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    signalName: edge.label || '',
    isActive: edge.isActive || false,
    isCriticalPath: edge.isCritical || false,
  }));

  // Update the store directly
  useCircuitStore.setState({
    region: {
      id: region.id,
      name: region.name,
      nodes,
      connections,
      totalLUTs: region.stats.totalLUTs,
      usedLUTs: region.stats.usedLUTs,
      totalRegisters: region.stats.totalRegisters,
      usedRegisters: region.stats.usedRegisters,
    },
    isLoading: false,
  });
}

/**
 * Handle simulation state updates
 */
function handleSimulationUpdate(response: SimulationUpdateResponse): void {
  const signals: SignalTimeSeries[] = (response.signals || []).map(sig => ({
    signalId: sig.id,
    signalName: sig.name,
    isInput: sig.isInput,
    isOutput: sig.isOutput,
    bitWidth: sig.bitWidth,
    values: sig.values.map(v => ({
      timestamp: v.t,
      value: v.v,
    })),
  }));

  useSimulationStore.setState(state => ({
    state: {
      status: response.status,
      currentTimestep: response.timestep,
      totalTimesteps: response.totalTimesteps,
      clockFrequency: response.clockMHz,
      signals: signals.length > 0 ? signals : (state.state?.signals || []),
      activeNodes: response.activeNodes,
      activePaths: response.activeEdges,
    },
    isLoading: false,
  }));
}

/**
 * Handle optimization updates
 */
function handleOptimizationUpdate(response: OptimizationUpdateResponse): void {
  const suggestions: OptimizationSuggestion[] = response.suggestions.map(s => ({
    id: s.id,
    type: s.category,
    title: s.title,
    description: s.description,
    affectedNodes: s.affectedNodes,
    beforeLUTs: s.lutsBefore,
    afterLUTs: s.lutsAfter,
    latencyImpact: s.latencyDelta,
    confidence: s.confidence,
    codeSnippet: s.code,
    applied: s.applied,
  }));

  useOptimizationStore.setState({
    stats: {
      originalLUTs: response.stats.originalLUTs,
      currentLUTs: response.stats.currentLUTs,
      targetLUTs: response.stats.targetLUTs,
      originalRegisters: response.stats.originalRegisters || 0,
      currentRegisters: response.stats.currentRegisters || 0,
      suggestions,
    },
    isLoading: false,
  });
}

/**
 * Handle chat/assistant responses
 */
function handleChatResponse(response: ChatResponseData): void {
  const { message } = response;

  const chatMessage: ChatMessage = {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(),
    codeSnippets: message.codeBlocks?.map(block => ({
      language: block.language,
      code: block.code,
      filename: block.filename,
      highlightLines: block.highlightLines,
    })),
  };

  // Add message to chat
  useChatStore.setState(state => ({
    messages: [...state.messages, chatMessage],
    isLoading: false,
    isStreaming: response.isStreaming || false,
  }));

  // Highlight nodes/signals if specified
  if (message.highlightNodes?.length) {
    useSelectionStore.getState().setSelectedNode(message.highlightNodes[0]);
  }
}

/**
 * Handle streaming events (WebSocket/SSE)
 */
export function handleStreamEvent(event: StreamEvent): void {
  switch (event.event) {
    case 'node_value_change': {
      const { nodeId, value } = (event as NodeValueChangeEvent).data;
      updateNodeValue(nodeId, value);
      break;
    }
    case 'timestep_advance': {
      const data = (event as TimestepAdvanceEvent).data;
      useSimulationStore.setState(state => ({
        state: state.state ? {
          ...state.state,
          currentTimestep: data.timestep,
          activeNodes: data.activeNodes,
          activePaths: data.activeEdges,
        } : null,
      }));
      break;
    }
    case 'chat_chunk': {
      const { chunk, done } = (event as ChatChunkEvent).data;
      useChatStore.setState(state => ({
        streamingContent: state.streamingContent + chunk,
        isStreaming: !done,
      }));
      break;
    }
    default:
      console.log('Stream event:', event);
  }
}

/**
 * Update a single node's value (for real-time simulation)
 */
function updateNodeValue(nodeId: string, value: 0 | 1 | 'X' | 'Z'): void {
  useCircuitStore.setState(state => {
    if (!state.region) return state;
    
    const nodes = state.region.nodes.map(node =>
      node.id === nodeId ? { ...node, currentValue: value } : node
    );
    
    return {
      region: { ...state.region, nodes },
    };
  });
}

// ============================================
// EXAMPLE USAGE
// ============================================

/*
// REST API example:
async function fetchCircuitData() {
  const response = await fetch('/api/circuit');
  const data: BackendResponse = await response.json();
  handleBackendResponse(data);
}

// WebSocket example:
const ws = new WebSocket('ws://localhost:8080/simulation');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Check if it's a stream event or full response
  if ('event' in data) {
    handleStreamEvent(data as StreamEvent);
  } else {
    handleBackendResponse(data as BackendResponse);
  }
};

// Send chat message:
ws.send(JSON.stringify({
  type: 'chat_request',
  message: 'How can I reduce LUT usage?',
  context: {
    selectedNodes: ['lut_softmax_0'],
    currentTimestep: 42,
  },
}));
*/

