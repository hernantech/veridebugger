/**
 * Zustand Stores - Connected to Real Backend
 *
 * All stores now use the real FastAPI backend at localhost:8080
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { backendApi, type VcdResult, type StreamStep } from '../api/backendApi';

// Re-export the optimization agent store for backend integration
export {
  useOptimizationAgentStore,
  useCurrentOptimizationRun,
  useOptimizationStatus,
  useLutHistory,
  useCurrentCode,
  useAgentReasoning,
  useDesignCode,
  useTestbenchCode,
  useGoal,
  useCodeLanguage,
  useConversionState,
  type OptimizationGoal,
  type CodeLanguage,
} from './optimizationAgentStore';

// ============================================
// Types for VCD-based Waveforms
// ============================================

export interface VcdSignal {
  name: string;
  width: number;
  values: Array<{ time: number; value: string }>;
}

export interface WaveformState {
  signals: VcdSignal[];
  vcdPath: string | null;
  simPassed: boolean;
  currentTime: number;
  maxTime: number;
  isLoading: boolean;
  error: string | null;
}

// ============================================
// Waveform Store (Real VCD Data)
// ============================================

interface WaveformStore {
  waveform: WaveformState;

  // Actions
  runSimulationWithVcd: (designCode: string, testbenchCode: string) => Promise<void>;
  setCurrentTime: (time: number) => void;
  clearWaveform: () => void;
}

const initialWaveformState: WaveformState = {
  signals: [],
  vcdPath: null,
  simPassed: false,
  currentTime: 0,
  maxTime: 0,
  isLoading: false,
  error: null,
};

export const useWaveformStore = create<WaveformStore>((set, get) => ({
  waveform: initialWaveformState,

  runSimulationWithVcd: async (designCode: string, testbenchCode: string) => {
    set({ waveform: { ...get().waveform, isLoading: true, error: null } });

    try {
      const result: VcdResult = await backendApi.runWithVcd({
        design_code: designCode,
        testbench_code: testbenchCode,
      });

      if (result.error) {
        set({
          waveform: {
            ...get().waveform,
            isLoading: false,
            error: result.error,
          },
        });
        return;
      }

      // Calculate max time from signals
      let maxTime = 0;
      if (result.signals) {
        result.signals.forEach((sig) => {
          sig.values.forEach((v) => {
            if (v.time > maxTime) maxTime = v.time;
          });
        });
      }

      set({
        waveform: {
          signals: result.signals || [],
          vcdPath: result.vcd_path || null,
          simPassed: result.success,
          currentTime: 0,
          maxTime,
          isLoading: false,
          error: null,
        },
      });
    } catch (err) {
      set({
        waveform: {
          ...get().waveform,
          isLoading: false,
          error: (err as Error).message,
        },
      });
    }
  },

  setCurrentTime: (time: number) => {
    const { waveform } = get();
    set({
      waveform: {
        ...waveform,
        currentTime: Math.max(0, Math.min(time, waveform.maxTime)),
      },
    });
  },

  clearWaveform: () => {
    set({ waveform: initialWaveformState });
  },
}));

// ============================================
// LUT Optimization Stats Store
// ============================================

export interface LutStats {
  originalLuts: number;
  currentLuts: number;
  targetLuts: number;
  history: number[];
  reasoning: string[];
}

interface LutStatsStore {
  stats: LutStats | null;
  isLoading: boolean;
  error: string | null;

  // Update from optimization run
  updateFromRun: (step: StreamStep) => void;
  clearStats: () => void;
}

export const useLutStatsStore = create<LutStatsStore>((set, get) => ({
  stats: null,
  isLoading: false,
  error: null,

  updateFromRun: (step: StreamStep) => {
    const current = get().stats;
    const lutHistory = step.lut_history || [];

    set({
      stats: {
        originalLuts: current?.originalLuts || lutHistory[0] || 0,
        currentLuts: step.lut_count || lutHistory[lutHistory.length - 1] || 0,
        targetLuts: current?.targetLuts || Math.floor((lutHistory[0] || 100) * 0.7),
        history: lutHistory,
        reasoning: [
          ...(current?.reasoning || []),
          ...(step.reasoning ? [step.reasoning] : []),
        ],
      },
    });
  },

  clearStats: () => {
    set({ stats: null, error: null });
  },
}));

// ============================================
// Chat Store (Shows Optimization Reasoning)
// ============================================

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  phase?: string;
  iteration?: number;
}

interface ChatStore {
  messages: AgentMessage[];
  isLoading: boolean;

  // Actions
  addMessage: (message: Omit<AgentMessage, 'id' | 'timestamp'>) => void;
  addAgentUpdate: (step: StreamStep) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [
    {
      id: 'system_1',
      role: 'system',
      content: 'VeriDebugger AI Agent ready. Start an optimization run to see real-time reasoning and progress.',
      timestamp: new Date(),
    },
  ],
  isLoading: false,

  addMessage: (message) => {
    set({
      messages: [
        ...get().messages,
        {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date(),
        },
      ],
    });
  },

  addAgentUpdate: (step: StreamStep) => {
    if (!step.reasoning) return;

    const phase = step.done ? 'completed' : 'working';

    set({
      messages: [
        ...get().messages,
        {
          id: `agent_${Date.now()}_${step.iteration}`,
          role: 'assistant',
          content: step.reasoning,
          timestamp: new Date(),
          phase,
          iteration: step.iteration,
        },
      ],
    });
  },

  clearMessages: () => {
    set({
      messages: [
        {
          id: 'system_1',
          role: 'system',
          content: 'VeriDebugger AI Agent ready. Start an optimization run to see real-time reasoning and progress.',
          timestamp: new Date(),
        },
      ],
    });
  },
}));

// ============================================
// Module Interface Store
// ============================================

export interface ModulePort {
  name: string;
  direction: 'input' | 'output' | 'inout';
  width: number;
}

export interface ModuleInterface {
  moduleName: string;
  ports: ModulePort[];
  hasClock: boolean;
  hasReset: boolean;
  clockName?: string;
  resetName?: string;
}

interface ModuleInterfaceStore {
  moduleInterface: ModuleInterface | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  extractInterface: (designCode: string) => Promise<void>;
  clearInterface: () => void;
}

export const useModuleInterfaceStore = create<ModuleInterfaceStore>((set) => ({
  moduleInterface: null,
  isLoading: false,
  error: null,

  extractInterface: async (designCode: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await backendApi.extractInterface(designCode);

      const inputPorts: ModulePort[] = response.inputs.map(i => ({ name: i.name, direction: 'input' as const, width: i.width }));
      const outputPorts: ModulePort[] = response.outputs.map(o => ({ name: o.name, direction: 'output' as const, width: o.width }));

      set({
        moduleInterface: {
          moduleName: response.module_name,
          ports: [...inputPorts, ...outputPorts],
          hasClock: response.inputs.some(i =>
            i.name.toLowerCase().includes('clk') || i.name.toLowerCase().includes('clock')
          ),
          hasReset: response.inputs.some(i =>
            i.name.toLowerCase().includes('rst') || i.name.toLowerCase().includes('reset')
          ),
          clockName: response.inputs.find(i =>
            i.name.toLowerCase().includes('clk') || i.name.toLowerCase().includes('clock')
          )?.name,
          resetName: response.inputs.find(i =>
            i.name.toLowerCase().includes('rst') || i.name.toLowerCase().includes('reset')
          )?.name,
        },
        isLoading: false,
      });
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoading: false,
      });
    }
  },

  clearInterface: () => {
    set({ moduleInterface: null, error: null });
  },
}));

// ============================================
// Backend Health Store
// ============================================

interface HealthStore {
  isConnected: boolean;
  lastCheck: Date | null;
  error: string | null;

  checkHealth: () => Promise<void>;
}

export const useHealthStore = create<HealthStore>((set) => ({
  isConnected: false,
  lastCheck: null,
  error: null,

  checkHealth: async () => {
    try {
      await backendApi.health();
      set({
        isConnected: true,
        lastCheck: new Date(),
        error: null,
      });
    } catch (err) {
      set({
        isConnected: false,
        lastCheck: new Date(),
        error: (err as Error).message,
      });
    }
  },
}));

// ============================================
// Selection Store (UI State)
// ============================================

interface SelectionState {
  selectedSignalName: string | null;
  hoveredSignalName: string | null;
}

interface SelectionStore extends SelectionState {
  setSelectedSignal: (name: string | null) => void;
  setHoveredSignal: (name: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create(
  subscribeWithSelector<SelectionStore>((set) => ({
    selectedSignalName: null,
    hoveredSignalName: null,

    setSelectedSignal: (name) => set({ selectedSignalName: name }),
    setHoveredSignal: (name) => set({ hoveredSignalName: name }),
    clearSelection: () => set({ selectedSignalName: null, hoveredSignalName: null }),
  }))
);

// ============================================
// View Settings Store
// ============================================

interface ViewSettings {
  showSignalValues: boolean;
  zoomLevel: number;
  timeScale: number; // pixels per time unit
}

interface ViewSettingsStore extends ViewSettings {
  toggleSignalValues: () => void;
  setZoom: (level: number) => void;
  setTimeScale: (scale: number) => void;
}

export const useViewSettingsStore = create<ViewSettingsStore>((set) => ({
  showSignalValues: true,
  zoomLevel: 1,
  timeScale: 2,

  toggleSignalValues: () => set((s) => ({ showSignalValues: !s.showSignalValues })),
  setZoom: (level) => set({ zoomLevel: level }),
  setTimeScale: (scale) => set({ timeScale: scale }),
}));

// ============================================
// Legacy exports for backward compatibility
// ============================================

// These are no longer functional - components should migrate to new stores
export const useSimulationStore = useWaveformStore;
export const useOptimizationStore = useLutStatsStore;
