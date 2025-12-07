import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptimizationAgentStore } from '../../store';
import CodeEditor from './CodeEditor';
import type { CodeLanguage, OptimizationGoal } from '../../store/optimizationAgentStore';
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
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import './OptimizationAgentPanel.css';
import './CodeEditor.css';

type TabMode = 'optimize' | 'testgen';

// Extract module name from Verilog code
const extractModuleName = (code: string): string | null => {
  const match = code.match(/module\s+(\w+)/);
  return match ? match[1] : null;
};

// Check if testbench instantiates a specific module
const checkTestbenchModule = (testbench: string, moduleName: string): boolean => {
  // Look for module instantiation patterns
  const patterns = [
    new RegExp(`\\b${moduleName}\\s+\\w+\\s*\\(`, 'i'),  // moduleName instance_name (
    new RegExp(`\\b${moduleName}\\s*#\\s*\\(`, 'i'),     // moduleName #(
  ];
  return patterns.some(p => p.test(testbench));
};

const OptimizationAgentPanel = () => {
  const [activeTab, setActiveTab] = useState<TabMode>('optimize');
  const [showDesignCode, setShowDesignCode] = useState(true);
  const [showTestbench, setShowTestbench] = useState(true); // Show by default now

  const {
    currentRun,
    isStarting,
    isConnected,
    error,
    designCode,
    testbenchCode,
    maxIterations,
    codeLanguage,
    goal,
    isConverting,
    conversionMessage,
    conversionSuccess,
    setDesignCode,
    setTestbenchCode,
    setMaxIterations,
    setCodeLanguage,
    setGoal,
    convertCToVerilog,
    clearConversionMessage,
    startOptimization,
    startTestGen,
    generateTestbench,
    stopOptimization,
    clearError,
    reset,
  } = useOptimizationAgentStore();

  const isRunning = currentRun?.status === 'running';

  // Detect module name mismatch between design and testbench
  const moduleMismatch = useMemo(() => {
    if (codeLanguage !== 'verilog') return null;

    const designModule = extractModuleName(designCode);
    if (!designModule) return null;

    const testbenchHasModule = checkTestbenchModule(testbenchCode, designModule);
    if (!testbenchHasModule) {
      // Try to find what module the testbench IS testing
      const tbMatch = testbenchCode.match(/(\w+)\s+(?:uut|dut|inst\w*)\s*\(/i)
                   || testbenchCode.match(/(\w+)\s*#\s*\([^)]*\)\s*\w+\s*\(/);
      const tbModule = tbMatch ? tbMatch[1] : 'unknown';
      return {
        design: designModule,
        testbench: tbModule,
      };
    }
    return null;
  }, [designCode, testbenchCode, codeLanguage]);

  // Auto-expand testbench section when there's a mismatch
  useEffect(() => {
    if (moduleMismatch && !showTestbench) {
      setShowTestbench(true);
    }
  }, [moduleMismatch]);

  const handleStart = () => {
    if (activeTab === 'optimize') {
      startOptimization();
    } else {
      startTestGen();
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCodeLanguage(e.target.value as CodeLanguage);
  };

  const handleGoalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setGoal(e.target.value as OptimizationGoal);
  };

  const getGoalDescription = (g: OptimizationGoal): string => {
    switch (g) {
      case 'compile': return 'Only compile - fix syntax errors';
      case 'verify': return 'Compile + simulate until tests pass';
      case 'optimize': return 'Full optimization - reduce LUT count';
      default: return '';
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
                  {/* Language selector and convert button */}
                  <div className="code-section-header">
                    <div className="code-section-header__left">
                      <span className="code-section-header__title">Language:</span>
                      <select
                        className="language-selector__dropdown"
                        value={codeLanguage}
                        onChange={handleLanguageChange}
                      >
                        <option value="verilog">Verilog</option>
                        <option value="c">C</option>
                      </select>
                    </div>
                    <div className="code-section-header__right">
                      {codeLanguage === 'c' && (
                        <button
                          className="convert-btn"
                          onClick={convertCToVerilog}
                          disabled={isConverting}
                        >
                          {isConverting ? (
                            <>
                              <Loader2 size={12} className="spinning" />
                              Converting...
                            </>
                          ) : (
                            <>
                              <ArrowRight size={12} />
                              Convert to Verilog
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Monaco Editor */}
                  <CodeEditor
                    value={designCode}
                    onChange={setDesignCode}
                    language={codeLanguage}
                    height="200px"
                  />

                  {/* Conversion message */}
                  <AnimatePresence>
                    {conversionMessage && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`conversion-message ${conversionSuccess ? 'conversion-message--success' : 'conversion-message--error'}`}
                      >
                        {conversionSuccess ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        <span>{conversionMessage}</span>
                        <button onClick={clearConversionMessage}>Dismiss</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Testbench Code (only for optimize mode) */}
          {activeTab === 'optimize' && (
            <div className="optimization-agent-panel__code-section">
              <button
                className={`optimization-agent-panel__code-toggle ${moduleMismatch ? 'optimization-agent-panel__code-toggle--warning' : ''}`}
                onClick={() => setShowTestbench(!showTestbench)}
              >
                <TestTube size={14} />
                <span>Testbench</span>
                {moduleMismatch && (
                  <span className="optimization-agent-panel__mismatch-badge">
                    <AlertTriangle size={12} />
                    Mismatch
                  </span>
                )}
                <span className="optimization-agent-panel__code-lines">
                  {testbenchCode.split('\n').length} lines
                </span>
                {showTestbench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {/* Module mismatch warning */}
              <AnimatePresence>
                {moduleMismatch && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="optimization-agent-panel__mismatch-warning"
                  >
                    <AlertTriangle size={14} />
                    <div>
                      <strong>Module mismatch detected!</strong>
                      <p>
                        Design: <code>{moduleMismatch.design}</code> |
                        Testbench tests: <code>{moduleMismatch.testbench}</code>
                      </p>
                      <p>Click "Auto-generate" to create a matching testbench.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                        className={`optimization-agent-panel__generate-btn ${moduleMismatch ? 'optimization-agent-panel__generate-btn--highlight' : ''}`}
                        onClick={generateTestbench}
                        disabled={isStarting}
                      >
                        <Wand2 size={12} />
                        {moduleMismatch ? 'Generate Matching Testbench' : 'Auto-generate'}
                      </button>
                    </div>
                    <CodeEditor
                      value={testbenchCode}
                      onChange={setTestbenchCode}
                      language="verilog"
                      height="180px"
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

          {/* Goal Selector */}
          {activeTab === 'optimize' && (
            <div className="optimization-agent-panel__field optimization-agent-panel__field--full">
              <label>Optimization Goal</label>
              <select
                value={goal}
                onChange={handleGoalChange}
                className="optimization-agent-panel__goal-select"
              >
                <option value="compile">Compile Only</option>
                <option value="verify">Verify (Pass Tests)</option>
                <option value="optimize">Optimize (Reduce LUTs)</option>
              </select>
              <span className="optimization-agent-panel__goal-description">
                {getGoalDescription(goal)}
              </span>
            </div>
          )}
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
              disabled={isStarting || codeLanguage === 'c'}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              title={codeLanguage === 'c' ? 'Convert C to Verilog first' : undefined}
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

      {/* Hint for C code */}
      {codeLanguage === 'c' && !currentRun && (
        <div className="optimization-agent-panel__hint">
          <span>Convert your C code to Verilog before optimization</span>
        </div>
      )}
    </div>
  );
};

export default OptimizationAgentPanel;
