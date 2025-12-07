/**
 * SimulationControls - VCD Simulation Controls
 *
 * Controls for running simulations and capturing VCD waveforms.
 * Connected to the real FastAPI backend.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  useWaveformStore,
  useHealthStore,
  useOptimizationAgentStore,
} from '../../store';
import {
  Play,
  RotateCcw,
  Wifi,
  WifiOff,
  Cpu,
  Clock,
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import './SimulationControls.css';

const SimulationControls = () => {
  const { waveform, runSimulationWithVcd, clearWaveform } = useWaveformStore();
  const { isConnected, lastCheck, checkHealth, error: healthError } = useHealthStore();
  const { designCode, testbenchCode, currentRun } = useOptimizationAgentStore();

  // Check backend health on mount and periodically
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleRunSimulation = () => {
    if (designCode && testbenchCode) {
      runSimulationWithVcd(designCode, testbenchCode);
    }
  };

  const handleReset = () => {
    clearWaveform();
  };

  const isRunning = waveform.isLoading;
  const hasWaveform = waveform.signals.length > 0;

  return (
    <div className="simulation-controls">
      {/* Backend Connection Status */}
      <div className="simulation-controls__status">
        <motion.div
          className={`simulation-controls__status-dot simulation-controls__status-dot--${isConnected ? 'connected' : 'disconnected'}`}
          animate={isConnected ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="simulation-controls__status-text">
          {isConnected ? (
            <>
              <Wifi size={12} />
              Backend Connected
            </>
          ) : (
            <>
              <WifiOff size={12} />
              Backend Offline
            </>
          )}
        </span>
      </div>

      {healthError && (
        <div className="simulation-controls__error">
          <XCircle size={12} />
          <span>{healthError}</span>
        </div>
      )}

      {/* Main controls */}
      <div className="simulation-controls__buttons">
        <motion.button
          className="simulation-controls__btn simulation-controls__btn--primary"
          onClick={handleRunSimulation}
          disabled={isRunning || !isConnected || !designCode || !testbenchCode}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={!designCode || !testbenchCode ? 'Enter design and testbench code first' : 'Run simulation'}
        >
          {isRunning ? (
            <>
              <Loader2 size={18} className="spinning" />
              Running...
            </>
          ) : (
            <>
              <Play size={18} />
              Run VCD Sim
            </>
          )}
        </motion.button>

        <motion.button
          className="simulation-controls__btn"
          onClick={handleReset}
          disabled={isRunning || !hasWaveform}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Clear waveform data"
        >
          <RotateCcw size={16} />
          Clear
        </motion.button>
      </div>

      {/* Simulation Status */}
      {hasWaveform && (
        <div className="simulation-controls__result">
          <div className={`simulation-controls__result-status ${waveform.simPassed ? 'passed' : 'failed'}`}>
            {waveform.simPassed ? (
              <>
                <CheckCircle2 size={14} />
                Simulation Passed
              </>
            ) : (
              <>
                <XCircle size={14} />
                Simulation Failed
              </>
            )}
          </div>
          <div className="simulation-controls__result-info">
            <span>
              <Activity size={12} />
              {waveform.signals.length} signals
            </span>
            <span>
              <Clock size={12} />
              {waveform.maxTime}ns duration
            </span>
          </div>
        </div>
      )}

      {/* Current Optimization Run Info */}
      {currentRun && (
        <div className="simulation-controls__run-info">
          <div className="simulation-controls__run-header">
            <Cpu size={14} />
            <span>Active Optimization</span>
          </div>
          <div className="simulation-controls__run-details">
            <span className={`simulation-controls__run-status simulation-controls__run-status--${currentRun.status}`}>
              {currentRun.status}
            </span>
            <span>Iteration {currentRun.iteration}</span>
            {currentRun.lutCount !== null && (
              <span>{currentRun.lutCount} LUTs</span>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="simulation-controls__stats">
        <div className="simulation-controls__stat">
          <span className="simulation-controls__stat-label">Last Check</span>
          <span className="simulation-controls__stat-value">
            {lastCheck ? new Date(lastCheck).toLocaleTimeString() : 'Never'}
          </span>
        </div>
        <div className="simulation-controls__stat">
          <span className="simulation-controls__stat-label">VCD Path</span>
          <span className="simulation-controls__stat-value">
            {waveform.vcdPath ? waveform.vcdPath.split('/').pop() : 'None'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;
