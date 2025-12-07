import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptimizationAgentStore } from '../../store';
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Cpu,
  Code,
  TrendingDown,
  RefreshCw,
  Zap,
  FileCode,
  TestTube,
  Wand2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import './OptimizationAgentPanel.css';

type TabMode = 'optimize' | 'testgen';

const OptimizationAgentPanel = () => {
  const [activeTab, setActiveTab] = useState<TabMode>('optimize');
  const [showDesignCode, setShowDesignCode] = useState(false);
  const [showTestbench, setShowTestbench] = useState(false);

  const {
    currentRun,
    isStarting,
    isConnected,
    error,
    designCode,
    testbenchCode,
    maxIterations,
    setDesignCode,
    setTestbenchCode,
    setMaxIterations,
    startOptimization,
    startTestGen,
    generateTestbench,
    stopOptimization,
    clearError,
    reset,
  } = useOptimizationAgentStore();

  const isRunning = currentRun?.status === 'running';

  const handleStart = () => {
    if (activeTab === 'optimize') {
      startOptimization();
    } else {
      startTestGen();
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'idle': return 'Idle';
      case 'starting': return 'Starting...';
      case 'running': return 'Running';
      case 'completed': return 'Complete';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <RefreshCw size={14} className="spinning" />;
      case 'completed': return <CheckCircle2 size={14} />;
      case 'failed': return <XCircle size={14} />;
      default: return <Zap size={14} />;
    }
  };

  return (
    <div className="optimization-agent-panel">
      <div className="optimization-agent-panel__header">
        <Zap size={16} className="optimization-agent-panel__icon" />
        <h3>AI Optimization Agent</h3>
        {isConnected && (
          <span className="optimization-agent-panel__status optimization-agent-panel__status--connected">
            Connected
          </span>
        )}
      </div>

      {/* Mode tabs */}
      <div className="optimization-agent-panel__tabs">
        <button
          className={`optimization-agent-panel__tab ${activeTab === 'optimize' ? 'optimization-agent-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('optimize')}
          disabled={isRunning}
        >
          <Cpu size={14} />
          Optimize
        </button>
        <button
          className={`optimization-agent-panel__tab ${activeTab === 'testgen' ? 'optimization-agent-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('testgen')}
          disabled={isRunning}
        >
          <TestTube size={14} />
          Test Gen
        </button>
      </div>

      {/* Configuration */}
      {!isRunning && !currentRun && (
        <div className="optimization-agent-panel__config">
          {/* Design Code */}
          <div className="optimization-agent-panel__code-section">
            <button
              className="optimization-agent-panel__code-toggle"
              onClick={() => setShowDesignCode(!showDesignCode)}
            >
              <FileCode size={14} />
              <span>Design Code</span>
              <span className="optimization-agent-panel__code-lines">
                {designCode.split('\n').length} lines
              </span>
              {showDesignCode ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <AnimatePresence>
              {showDesignCode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="optimization-agent-panel__code-wrapper"
                >
                  <textarea
                    className="optimization-agent-panel__code"
                    value={designCode}
                    onChange={(e) => setDesignCode(e.target.value)}
                    spellCheck={false}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Testbench Code (only for optimize mode) */}
          {activeTab === 'optimize' && (
            <div className="optimization-agent-panel__code-section">
              <button
                className="optimization-agent-panel__code-toggle"
                onClick={() => setShowTestbench(!showTestbench)}
              >
                <TestTube size={14} />
                <span>Testbench</span>
                <span className="optimization-agent-panel__code-lines">
                  {testbenchCode.split('\n').length} lines
                </span>
                {showTestbench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AnimatePresence>
                {showTestbench && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="optimization-agent-panel__code-wrapper"
                  >
                    <div className="optimization-agent-panel__code-actions">
                      <button
                        className="optimization-agent-panel__generate-btn"
                        onClick={generateTestbench}
                        disabled={isStarting}
                      >
                        <Wand2 size={12} />
                        Auto-generate
                      </button>
                    </div>
                    <textarea
                      className="optimization-agent-panel__code"
                      value={testbenchCode}
                      onChange={(e) => setTestbenchCode(e.target.value)}
                      spellCheck={false}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="optimization-agent-panel__field">
            <label>Max Iterations</label>
            <input
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value) || 10)}
              min={1}
              max={20}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="optimization-agent-panel__error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <XCircle size={14} />
            <span>{error}</span>
            <button onClick={clearError}>Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Run status */}
      {currentRun && (
        <div className="optimization-agent-panel__run">
          <div className="optimization-agent-panel__run-header">
            <div className={`optimization-agent-panel__state optimization-agent-panel__state--${currentRun.status}`}>
              {getStatusIcon(currentRun.status)}
              <span>{getStatusLabel(currentRun.status)}</span>
            </div>
            <span className="optimization-agent-panel__iteration">
              Iteration {currentRun.iteration}
            </span>
            <span className="optimization-agent-panel__mode">
              {currentRun.mode === 'optimize' ? 'Optimization' : 'Test Generation'}
            </span>
          </div>

          {/* LUT progress */}
          {currentRun.lutHistory.length > 0 && (
            <div className="optimization-agent-panel__lut-progress">
              <div className="optimization-agent-panel__lut-header">
                <TrendingDown size={14} />
                <span>LUT Count History</span>
              </div>
              <div className="optimization-agent-panel__lut-chart">
                {currentRun.lutHistory.map((lut, i) => (
                  <div
                    key={i}
                    className="optimization-agent-panel__lut-bar"
                    style={{
                      height: `${Math.min(100, (lut / Math.max(...currentRun.lutHistory)) * 100)}%`,
                    }}
                  >
                    <span className="optimization-agent-panel__lut-value">{lut}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current LUT count */}
          {currentRun.lutCount !== null && (
            <div className="optimization-agent-panel__current-lut">
              <span className="optimization-agent-panel__current-lut-label">Current LUTs</span>
              <span className="optimization-agent-panel__current-lut-value">{currentRun.lutCount}</span>
            </div>
          )}

          {/* Simulation status */}
          <div className="optimization-agent-panel__sim-status">
            <span className={currentRun.simPassed ? 'passed' : 'pending'}>
              {currentRun.simPassed ? (
                <>
                  <CheckCircle2 size={12} /> Simulation Passed
                </>
              ) : (
                <>
                  <Loader2 size={12} className={isRunning ? 'spinning' : ''} />
                  {isRunning ? 'Verifying...' : 'Not Verified'}
                </>
              )}
            </span>
          </div>

          {/* Agent reasoning preview */}
          {currentRun.agentReasoning && (
            <div className="optimization-agent-panel__reasoning">
              <span className="optimization-agent-panel__reasoning-label">Agent Reasoning</span>
              <p>{currentRun.agentReasoning.slice(0, 300)}
                {currentRun.agentReasoning.length > 300 && '...'}
              </p>
            </div>
          )}

          {/* Optimized code preview */}
          {currentRun.status === 'completed' && currentRun.code && (
            <div className="optimization-agent-panel__result-code">
              <span className="optimization-agent-panel__result-label">
                <Code size={12} /> Optimized Code
              </span>
              <pre>{currentRun.code.slice(0, 500)}{currentRun.code.length > 500 && '...'}</pre>
            </div>
          )}

          {/* Run error */}
          {currentRun.error && (
            <div className="optimization-agent-panel__run-error">
              <XCircle size={14} />
              <span>{currentRun.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="optimization-agent-panel__actions">
        {!isRunning ? (
          <>
            <motion.button
              className="optimization-agent-panel__btn optimization-agent-panel__btn--primary"
              onClick={handleStart}
              disabled={isStarting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isStarting ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Starting...
                </>
              ) : (
                <>
                  <Play size={16} />
                  {activeTab === 'optimize' ? 'Start Optimization' : 'Generate Tests'}
                </>
              )}
            </motion.button>
            {currentRun && (
              <motion.button
                className="optimization-agent-panel__btn optimization-agent-panel__btn--secondary"
                onClick={reset}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <RefreshCw size={16} />
                Reset
              </motion.button>
            )}
          </>
        ) : (
          <motion.button
            className="optimization-agent-panel__btn optimization-agent-panel__btn--danger"
            onClick={stopOptimization}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Square size={16} />
            Stop
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default OptimizationAgentPanel;
