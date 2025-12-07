/**
 * API Client - Re-exports from Backend API
 *
 * This file exists for backward compatibility.
 * All real API calls are in backendApi.ts
 */

export {
  backendApi,
  createOptimizationStream,
  createTestGenStream,
  OptimizationStream,
  type OptimizeRequest,
  type TestGenRequest,
  type ConvertRequest,
  type DesignOnlyRequest,
  type StartResponse,
  type StatusResponse,
  type StreamStep,
  type OptimizeResponse,
  type InterfaceResponse,
  type TestbenchResponse,
  type ConvertResponse,
  type VcdResult,
  type StreamUpdateHandler,
  type ErrorHandler,
  type CloseHandler,
} from './backendApi';
