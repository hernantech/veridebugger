/**
 * Backend API Client
 *
 * Connects to the FastAPI backend for Verilog optimization and debugging.
 * Endpoints:
 * - POST /start - Start optimization run
 * - POST /optimize - Synchronous optimization
 * - GET /status/{run_id} - Get run status
 * - WS /stream/{run_id} - Stream real-time updates
 * - POST /testgen/start - Start test generation
 * - POST /testgen/generate - Generate testbench
 * - WS /testgen/stream/{run_id} - Stream test generation
 * - POST /convert - C to Verilog conversion
 * - POST /debug/vcd - Run simulation with VCD
 * - GET /health - Health check
 */

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

// ============== Request Types ==============

export interface OptimizeRequest {
  design_code: string;
  testbench_code: string;
  max_iterations?: number;
  goal?: 'compile' | 'verify' | 'optimize';
}

export interface TestGenRequest {
  design_code: string;
  max_iterations?: number;
}

export interface ConvertRequest {
  c_code: string;
  top_function?: string;
}

export interface DesignOnlyRequest {
  design_code: string;
}

// ============== Response Types ==============

export interface StartResponse {
  run_id: string;
  message: string;
}

export interface StatusResponse {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'disconnected' | 'error';
  history: StreamStep[];
  latest: StreamStep | null;
}

export interface EditApplied {
  edit_type: 'replace' | 'insert_after' | 'delete';
  line_start: number;
  line_end: number;
  new_content: string;
  original_lines: string[];
}

export interface StreamStep {
  iteration: number;
  code: string;
  lut_count: number | null;
  lut_history: number[];
  reasoning: string;
  sim_passed: boolean;
  error: string | null;
  done: boolean;
  phase?: string;
  action?: string;
  edit_applied?: EditApplied | null;
}

export interface OptimizeResponse {
  final_code: string;
  lut_history: number[];
  iterations: number;
  reasoning: string[];
}

export interface InterfaceResponse {
  module_name: string;
  inputs: Array<{ name: string; width: number }>;
  outputs: Array<{ name: string; width: number }>;
  parameters?: Record<string, string>;
}

export interface TestbenchResponse {
  testbench_code: string;
  module_name: string;
}

export interface ConvertResponse {
  success: boolean;
  verilog_code?: string;
  message?: string;
  errors?: string[];
  raw_output?: string;
}

export interface VcdResult {
  success: boolean;
  vcd_path?: string;
  signals?: Array<{
    name: string;
    width: number;
    values: Array<{ time: number; value: string }>;
  }>;
  error?: string;
}

// ============== HTTP API Client ==============

export const backendApi = {
  /**
   * Check backend health
   */
  async health(): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('Backend health check failed');
    }
    return response.json();
  },

  // ============== Optimization ==============

  /**
   * Start a new optimization run (async with WebSocket)
   */
  async startOptimization(request: OptimizeRequest): Promise<StartResponse> {
    const response = await fetch(`${API_BASE_URL}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_code: request.design_code,
        testbench_code: request.testbench_code,
        max_iterations: request.max_iterations ?? 10,
        goal: request.goal ?? 'optimize',
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to start optimization');
    }
    return response.json();
  },

  /**
   * Run optimization synchronously (blocking)
   */
  async optimizeSync(request: OptimizeRequest): Promise<OptimizeResponse> {
    const response = await fetch(`${API_BASE_URL}/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_code: request.design_code,
        testbench_code: request.testbench_code,
        max_iterations: request.max_iterations ?? 10,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Optimization failed');
    }
    return response.json();
  },

  /**
   * Get current status of a run
   */
  async getStatus(runId: string): Promise<StatusResponse> {
    const response = await fetch(`${API_BASE_URL}/status/${runId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Run not found');
      }
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to get run status');
    }
    return response.json();
  },

  // ============== Test Generation ==============

  /**
   * Extract module interface from design code
   */
  async extractInterface(designCode: string): Promise<InterfaceResponse> {
    const response = await fetch(`${API_BASE_URL}/testgen/interface`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_code: designCode }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to extract interface');
    }
    return response.json();
  },

  /**
   * Generate testbench for design
   */
  async generateTestbench(designCode: string): Promise<TestbenchResponse> {
    const response = await fetch(`${API_BASE_URL}/testgen/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_code: designCode }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to generate testbench');
    }
    return response.json();
  },

  /**
   * Start autonomous test generation run
   */
  async startTestGen(request: TestGenRequest): Promise<StartResponse> {
    const response = await fetch(`${API_BASE_URL}/testgen/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_code: request.design_code,
        max_iterations: request.max_iterations ?? 5,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to start test generation');
    }
    return response.json();
  },

  // ============== C to Verilog ==============

  /**
   * Convert C code to Verilog using BAMBU HLS
   */
  async convertCToVerilog(request: ConvertRequest): Promise<ConvertResponse> {
    const response = await fetch(`${API_BASE_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        c_code: request.c_code,
        top_function: request.top_function ?? 'main',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        errors: data.detail?.errors || [data.detail || 'Conversion failed'],
        raw_output: data.detail?.raw_output,
      };
    }
    return data;
  },

  /**
   * Check C code syntax without conversion
   */
  async checkCSyntax(cCode: string): Promise<ConvertResponse> {
    const response = await fetch(`${API_BASE_URL}/convert/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c_code: cCode }),
    });
    return response.json();
  },

  // ============== Debug ==============

  /**
   * Run simulation with VCD capture
   */
  async runWithVcd(request: OptimizeRequest): Promise<VcdResult> {
    const response = await fetch(`${API_BASE_URL}/debug/vcd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_code: request.design_code,
        testbench_code: request.testbench_code,
      }),
    });
    return response.json();
  },
};

// ============== WebSocket Streaming ==============

export type StreamUpdateHandler = (step: StreamStep) => void;
export type ErrorHandler = (error: string) => void;
export type CloseHandler = () => void;

export class OptimizationStream {
  private ws: WebSocket | null = null;
  private runId: string;
  private onUpdate: StreamUpdateHandler;
  private onError: ErrorHandler;
  private onClose: CloseHandler;
  private endpoint: string;

  constructor(
    runId: string,
    onUpdate: StreamUpdateHandler,
    onError: ErrorHandler,
    onClose: CloseHandler,
    endpoint: 'stream' | 'testgen/stream' = 'stream'
  ) {
    this.runId = runId;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.onClose = onClose;
    this.endpoint = endpoint;
  }

  connect(): void {
    this.ws = new WebSocket(`${WS_BASE_URL}/${this.endpoint}/${this.runId}`);

    this.ws.onopen = () => {
      console.log(`[WebSocket] Connected to ${this.endpoint} for run ${this.runId}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          this.onError(data.error);
          this.close();
        } else {
          this.onUpdate(data as StreamStep);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
        this.onError('Failed to parse server message');
      }
    };

    this.ws.onerror = (event) => {
      console.error('[WebSocket] Error:', event);
      this.onError('WebSocket connection error');
    };

    this.ws.onclose = () => {
      console.log(`[WebSocket] Connection closed for run ${this.runId}`);
      this.onClose();
    };
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Helper to create optimization stream
export function createOptimizationStream(
  runId: string,
  onUpdate: StreamUpdateHandler,
  onError: ErrorHandler,
  onClose: CloseHandler
): OptimizationStream {
  const stream = new OptimizationStream(runId, onUpdate, onError, onClose, 'stream');
  stream.connect();
  return stream;
}

// Helper to create test generation stream
export function createTestGenStream(
  runId: string,
  onUpdate: StreamUpdateHandler,
  onError: ErrorHandler,
  onClose: CloseHandler
): OptimizationStream {
  const stream = new OptimizationStream(runId, onUpdate, onError, onClose, 'testgen/stream');
  stream.connect();
  return stream;
}
