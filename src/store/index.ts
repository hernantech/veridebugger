import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CircuitRegion,
  SimulationState,
  SimulationConfig,
  TransformerConfig,
  OptimizationStats,
  ChatMessage,
  ChatContext,
  SelectionState,
  ViewSettings,
} from '../types';
import {
  circuitApi,
  simulationApi,
  transformerApi,
  optimizationApi,
  chatApi,
  mockWebSocket,
} from '../api/client';

// ============================================
// Circuit Store
// ============================================

interface CircuitStore {
  region: CircuitRegion | null;
  isLoading: boolean;
  error: string | null;
  fetchCircuit: () => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
}

export const useCircuitStore = create<CircuitStore>((set, get) => ({
  region: null,
  isLoading: false,
  error: null,

  fetchCircuit: async () => {
    set({ isLoading: true, error: null });
    try {
      const region = await circuitApi.getCircuitRegion();
      set({ region, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  updateNodePosition: (nodeId, position) => {
    const { region } = get();
    if (!region) return;

    const updatedNodes = region.nodes.map(node =>
      node.id === nodeId ? { ...node, position } : node
    );
    set({ region: { ...region, nodes: updatedNodes } });
    circuitApi.updateNodePosition(nodeId, position);
  },
}));

// ============================================
// Simulation Store
// ============================================

interface SimulationStore {
  state: SimulationState | null;
  config: SimulationConfig;
  isLoading: boolean;
  error: string | null;
  
  fetchState: () => Promise<void>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  step: () => Promise<void>;
  reset: () => Promise<void>;
  setTimestep: (timestep: number) => Promise<void>;
  updateConfig: (updates: Partial<SimulationConfig>) => void;
  setSimulationState: (state: SimulationState) => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  state: null,
  config: {
    modelVariant: 'small',
    inputSequenceLength: 64,
    batchSize: 1,
    precision: 'fp16',
    pipelineDepth: 4,
  },
  isLoading: false,
  error: null,

  fetchState: async () => {
    set({ isLoading: true });
    try {
      const state = await simulationApi.getState();
      set({ state, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  start: async () => {
    set({ isLoading: true });
    try {
      const { config } = get();
      const state = await simulationApi.start(config);
      set({ state, isLoading: false });
      mockWebSocket.startSimulationUpdates();
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  pause: async () => {
    try {
      const state = await simulationApi.pause();
      set({ state });
      mockWebSocket.stopSimulationUpdates();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  resume: async () => {
    try {
      const state = await simulationApi.resume();
      set({ state });
      mockWebSocket.startSimulationUpdates();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  step: async () => {
    set({ isLoading: true });
    try {
      const state = await simulationApi.step();
      set({ state, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  reset: async () => {
    try {
      mockWebSocket.stopSimulationUpdates();
      const state = await simulationApi.reset();
      set({ state });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  setTimestep: async (timestep) => {
    try {
      const state = await simulationApi.setTimestep(timestep);
      set({ state });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  updateConfig: (updates) => {
    const { config } = get();
    set({ config: { ...config, ...updates } });
  },

  setSimulationState: (state) => {
    set({ state });
  },
}));

// Subscribe to WebSocket updates
mockWebSocket.subscribe((state) => {
  useSimulationStore.getState().setSimulationState(state);
});

// ============================================
// Transformer Store
// ============================================

interface TransformerStore {
  configs: TransformerConfig[];
  selectedConfigId: string | null;
  isLoading: boolean;
  error: string | null;
  
  fetchConfigs: () => Promise<void>;
  selectConfig: (configId: string) => void;
}

export const useTransformerStore = create<TransformerStore>((set) => ({
  configs: [],
  selectedConfigId: null,
  isLoading: false,
  error: null,

  fetchConfigs: async () => {
    set({ isLoading: true });
    try {
      const configs = await transformerApi.getConfigs();
      set({ configs, selectedConfigId: configs[0]?.id || null, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  selectConfig: (configId) => {
    set({ selectedConfigId: configId });
  },
}));

// ============================================
// Optimization Store
// ============================================

interface OptimizationStore {
  stats: OptimizationStats | null;
  isLoading: boolean;
  isApplying: boolean;
  error: string | null;
  
  fetchStats: () => Promise<void>;
  applySuggestion: (suggestionId: string) => Promise<void>;
  revertSuggestion: (suggestionId: string) => Promise<void>;
  analyzeOptimizations: () => Promise<void>;
}

export const useOptimizationStore = create<OptimizationStore>((set) => ({
  stats: null,
  isLoading: false,
  isApplying: false,
  error: null,

  fetchStats: async () => {
    set({ isLoading: true });
    try {
      const stats = await optimizationApi.getStats();
      set({ stats, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  applySuggestion: async (suggestionId) => {
    set({ isApplying: true });
    try {
      const stats = await optimizationApi.applySuggestion(suggestionId);
      set({ stats, isApplying: false });
    } catch (err) {
      set({ error: (err as Error).message, isApplying: false });
    }
  },

  revertSuggestion: async (suggestionId) => {
    set({ isApplying: true });
    try {
      const stats = await optimizationApi.revertSuggestion(suggestionId);
      set({ stats, isApplying: false });
    } catch (err) {
      set({ error: (err as Error).message, isApplying: false });
    }
  },

  analyzeOptimizations: async () => {
    set({ isLoading: true });
    try {
      const suggestions = await optimizationApi.analyzeOptimizations();
      set((state) => ({
        stats: state.stats ? { ...state.stats, suggestions } : null,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));

// ============================================
// Chat Store
// ============================================

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  
  fetchHistory: () => Promise<void>;
  sendMessage: (content: string, context?: ChatContext) => Promise<void>;
  sendMessageStreaming: (content: string, context?: ChatContext) => void;
  clearHistory: () => Promise<void>;
  cancelStreaming: () => void;
}

let cancelStreamingFn: (() => void) | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  error: null,

  fetchHistory: async () => {
    set({ isLoading: true });
    try {
      const messages = await chatApi.getHistory();
      set({ messages, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  sendMessage: async (content, context) => {
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      context,
    };
    
    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
    }));

    try {
      const response = await chatApi.sendMessage(content, context);
      set((state) => ({
        messages: [...state.messages, response],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  sendMessageStreaming: (content, context) => {
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      context,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
    }));

    cancelStreamingFn = chatApi.streamMessage(
      content,
      context,
      (chunk) => {
        set((state) => ({
          streamingContent: state.streamingContent + chunk,
        }));
      },
      (message) => {
        set((state) => ({
          messages: [...state.messages, message],
          isStreaming: false,
          streamingContent: '',
        }));
        cancelStreamingFn = null;
      }
    );
  },

  clearHistory: async () => {
    try {
      await chatApi.clearHistory();
      const messages = await chatApi.getHistory();
      set({ messages });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  cancelStreaming: () => {
    if (cancelStreamingFn) {
      cancelStreamingFn();
      cancelStreamingFn = null;
      set({ isStreaming: false, streamingContent: '' });
    }
  },
}));

// ============================================
// Selection Store (UI State)
// ============================================

interface SelectionStore extends SelectionState {
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedSignal: (signalId: string | null) => void;
  setSelectedRegion: (regionId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  clearSelection: () => void;
  getContext: () => ChatContext;
}

export const useSelectionStore = create(
  subscribeWithSelector<SelectionStore>((set, get) => ({
    selectedNodeId: null,
    selectedSignalId: null,
    selectedRegionId: null,
    hoveredNodeId: null,

    setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
    setSelectedSignal: (signalId) => set({ selectedSignalId: signalId }),
    setSelectedRegion: (regionId) => set({ selectedRegionId: regionId }),
    setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
    
    clearSelection: () => set({
      selectedNodeId: null,
      selectedSignalId: null,
      selectedRegionId: null,
    }),

    getContext: () => {
      const state = get();
      const simState = useSimulationStore.getState().state;
      return {
        selectedNodeIds: state.selectedNodeId ? [state.selectedNodeId] : [],
        selectedSignalIds: state.selectedSignalId ? [state.selectedSignalId] : [],
        selectedRegion: state.selectedRegionId || undefined,
        currentTimestep: simState?.currentTimestep,
      };
    },
  }))
);

// ============================================
// View Settings Store
// ============================================

interface ViewSettingsStore extends ViewSettings {
  toggleCriticalPaths: () => void;
  toggleUtilization: () => void;
  toggleSignalValues: () => void;
  toggleNodeLabels: () => void;
  setZoom: (level: number) => void;
  setPan: (position: { x: number; y: number }) => void;
}

export const useViewSettingsStore = create<ViewSettingsStore>((set) => ({
  showCriticalPaths: true,
  showUtilization: true,
  showSignalValues: true,
  showNodeLabels: true,
  zoomLevel: 1,
  panPosition: { x: 0, y: 0 },

  toggleCriticalPaths: () => set((s) => ({ showCriticalPaths: !s.showCriticalPaths })),
  toggleUtilization: () => set((s) => ({ showUtilization: !s.showUtilization })),
  toggleSignalValues: () => set((s) => ({ showSignalValues: !s.showSignalValues })),
  toggleNodeLabels: () => set((s) => ({ showNodeLabels: !s.showNodeLabels })),
  setZoom: (level) => set({ zoomLevel: level }),
  setPan: (position) => set({ panPosition: position }),
}));

