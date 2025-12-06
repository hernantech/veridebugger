import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSimulationStore, useTransformerStore } from '../../store';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Settings,
  Cpu,
  Clock,
  Activity,
  Layers,
} from 'lucide-react';
import './SimulationControls.css';

const SimulationControls = () => {
  const {
    state: simState,
    config,
    isLoading,
    fetchState,
    start,
    pause,
    resume,
    step,
    reset,
    updateConfig,
  } = useSimulationStore();

  const { configs, selectedConfigId, fetchConfigs, selectConfig } = useTransformerStore();

  useEffect(() => {
    fetchState();
    fetchConfigs();
  }, [fetchState, fetchConfigs]);

  const handlePlayPause = () => {
    if (!simState) return;
    
    if (simState.status === 'idle' || simState.status === 'completed') {
      start();
    } else if (simState.status === 'running') {
      pause();
    } else if (simState.status === 'paused') {
      resume();
    }
  };

  const isRunning = simState?.status === 'running';
  const isIdle = simState?.status === 'idle' || simState?.status === 'completed';

  const progress = simState 
    ? (simState.currentTimestep / simState.totalTimesteps) * 100 
    : 0;

  return (
    <div className="simulation-controls">
      {/* Status indicator */}
      <div className="simulation-controls__status">
        <motion.div
          className={`simulation-controls__status-dot simulation-controls__status-dot--${simState?.status || 'idle'}`}
          animate={isRunning ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        <span className="simulation-controls__status-text">
          {simState?.status?.toUpperCase() || 'IDLE'}
        </span>
      </div>

      {/* Main controls */}
      <div className="simulation-controls__buttons">
        <motion.button
          className="simulation-controls__btn simulation-controls__btn--primary"
          onClick={handlePlayPause}
          disabled={isLoading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {isRunning ? (
              <motion.div
                key="pause"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
              >
                <Pause size={18} />
              </motion.div>
            ) : (
              <motion.div
                key="play"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
              >
                <Play size={18} />
              </motion.div>
            )}
          </AnimatePresence>
          {isIdle ? 'Start' : isRunning ? 'Pause' : 'Resume'}
        </motion.button>

        <motion.button
          className="simulation-controls__btn"
          onClick={step}
          disabled={isLoading || isRunning}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Single Step"
        >
          <SkipForward size={16} />
          Step
        </motion.button>

        <motion.button
          className="simulation-controls__btn"
          onClick={reset}
          disabled={isLoading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Reset Simulation"
        >
          <RotateCcw size={16} />
          Reset
        </motion.button>
      </div>

      {/* Progress bar */}
      <div className="simulation-controls__progress">
        <div className="simulation-controls__progress-bar">
          <motion.div
            className="simulation-controls__progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        <div className="simulation-controls__progress-info">
          <span>
            <Clock size={12} />
            {simState?.currentTimestep || 0} / {simState?.totalTimesteps || 100}
          </span>
          <span>
            <Activity size={12} />
            {simState?.clockFrequency || 200} MHz
          </span>
        </div>
      </div>

      {/* Configuration section */}
      <div className="simulation-controls__config">
        <div className="simulation-controls__config-header">
          <Settings size={14} />
          <span>Configuration</span>
        </div>

        <div className="simulation-controls__config-grid">
          {/* Transformer model selection */}
          <div className="simulation-controls__field">
            <label>
              <Cpu size={12} />
              Model
            </label>
            <select
              value={selectedConfigId || ''}
              onChange={(e) => selectConfig(e.target.value)}
              disabled={isRunning}
            >
              {configs.map((cfg) => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.name}
                </option>
              ))}
            </select>
          </div>

          {/* Precision */}
          <div className="simulation-controls__field">
            <label>
              <Layers size={12} />
              Precision
            </label>
            <select
              value={config.precision}
              onChange={(e) => updateConfig({ precision: e.target.value as typeof config.precision })}
              disabled={isRunning}
            >
              <option value="fp32">FP32</option>
              <option value="fp16">FP16</option>
              <option value="int8">INT8</option>
              <option value="int4">INT4</option>
            </select>
          </div>

          {/* Sequence length */}
          <div className="simulation-controls__field">
            <label>Seq Length</label>
            <input
              type="number"
              value={config.inputSequenceLength}
              onChange={(e) => updateConfig({ inputSequenceLength: parseInt(e.target.value) || 64 })}
              disabled={isRunning}
              min={1}
              max={512}
            />
          </div>

          {/* Pipeline depth */}
          <div className="simulation-controls__field">
            <label>Pipeline</label>
            <input
              type="number"
              value={config.pipelineDepth}
              onChange={(e) => updateConfig({ pipelineDepth: parseInt(e.target.value) || 4 })}
              disabled={isRunning}
              min={1}
              max={16}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;

