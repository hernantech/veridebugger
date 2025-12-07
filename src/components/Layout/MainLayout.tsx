import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircuitVisualization } from '../Circuit';
import { SimulationControls, WaveformView, LUTTable, OptimizationAgentPanel } from '../Simulation';
import { ChatPanel } from '../Chat';
import { useCurrentOptimizationRun, useHealthStore } from '../../store';
import {
  PanelLeftClose,
  PanelRightClose,
  Maximize2,
  Minimize2,
  Cpu,
  Activity,
  MessageSquare,
  BarChart3,
  Zap,
  ChevronUp,
  ChevronDown,
  GitBranch,
  Wifi,
  WifiOff,
} from 'lucide-react';
import './MainLayout.css';

type ActiveTab = 'waveform' | 'lut' | 'agent';

const MainLayout = () => {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const [circuitMinimized, setCircuitMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('agent');
  const currentRun = useCurrentOptimizationRun();
  const { isConnected, checkHealth } = useHealthStore();

  // Check backend health on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed(prev => !prev);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed(prev => !prev);
  }, []);

  const toggleBottomExpanded = useCallback(() => {
    setBottomExpanded(prev => !prev);
  }, []);

  const toggleCircuitMinimized = useCallback(() => {
    setCircuitMinimized(prev => !prev);
  }, []);

  return (
    <div className="main-layout">
      {/* Header */}
      <header className="main-layout__header">
        <div className="main-layout__logo">
          <Cpu size={24} />
          <div>
            <h1>Veridebug</h1>
            <span>FPGA Transformer Debugger</span>
          </div>
        </div>
        <div className="main-layout__header-stats">
          <div className={`main-layout__header-stat ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isConnected ? 'Backend Online' : 'Backend Offline'}</span>
          </div>
          {currentRun && currentRun.lutCount !== null && (
            <div className="main-layout__header-stat">
              <BarChart3 size={14} />
              <span>{currentRun.lutCount} LUTs</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="main-layout__content">
        {/* Left panel - Simulation Controls */}
        <motion.aside
          className={`main-layout__sidebar main-layout__sidebar--left ${leftPanelCollapsed ? 'main-layout__sidebar--collapsed' : ''}`}
          animate={{ width: leftPanelCollapsed ? 48 : 320 }}
          transition={{ duration: 0.2 }}
        >
          <div className="main-layout__sidebar-header">
            {!leftPanelCollapsed && (
              <span className="main-layout__sidebar-title">
                <Activity size={14} />
                Simulation
              </span>
            )}
            <button
              className="main-layout__sidebar-toggle"
              onClick={toggleLeftPanel}
            >
              <PanelLeftClose size={16} style={{ transform: leftPanelCollapsed ? 'rotate(180deg)' : 'none' }} />
            </button>
          </div>
          {!leftPanelCollapsed && (
            <motion.div
              className="main-layout__sidebar-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <SimulationControls />
            </motion.div>
          )}
        </motion.aside>

        {/* Center area */}
        <div className="main-layout__center">
          {/* Circuit visualization - collapsible */}
          <motion.div
            className={`main-layout__circuit ${circuitMinimized ? 'main-layout__circuit--minimized' : ''}`}
            animate={{
              height: circuitMinimized ? 44 : (bottomExpanded ? '40%' : '55%')
            }}
            transition={{ duration: 0.2 }}
          >
            {/* Collapse header - always visible */}
            <div className="main-layout__circuit-header">
              <div className="main-layout__circuit-title">
                <GitBranch size={14} />
                <span>Circuit Topology</span>
              </div>
              <button
                className="main-layout__circuit-toggle"
                onClick={toggleCircuitMinimized}
                title={circuitMinimized ? 'Expand circuit view' : 'Minimize circuit view'}
              >
                {circuitMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
            {/* Circuit content - hidden when minimized */}
            <AnimatePresence>
              {!circuitMinimized && (
                <motion.div
                  className="main-layout__circuit-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <CircuitVisualization />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bottom panel - Waveform / LUT Table */}
          <motion.div
            className="main-layout__bottom"
            animate={{
              height: circuitMinimized ? 'calc(100% - 52px)' : (bottomExpanded ? '60%' : '45%')
            }}
            transition={{ duration: 0.2 }}
          >
            <div className="main-layout__bottom-header">
              <div className="main-layout__tabs">
                <button
                  className={`main-layout__tab ${activeTab === 'waveform' ? 'main-layout__tab--active' : ''}`}
                  onClick={() => setActiveTab('waveform')}
                >
                  <Activity size={14} />
                  Waveforms
                </button>
                <button
                  className={`main-layout__tab ${activeTab === 'lut' ? 'main-layout__tab--active' : ''}`}
                  onClick={() => setActiveTab('lut')}
                >
                  <BarChart3 size={14} />
                  LUT Analysis
                </button>
                <button
                  className={`main-layout__tab ${activeTab === 'agent' ? 'main-layout__tab--active' : ''}`}
                  onClick={() => setActiveTab('agent')}
                >
                  <Zap size={14} />
                  AI Agent
                  {currentRun && !['completed', 'failed'].includes(currentRun.status) && (
                    <span className="main-layout__tab-indicator" />
                  )}
                </button>
              </div>
              <button
                className="main-layout__expand-toggle"
                onClick={toggleBottomExpanded}
              >
                {bottomExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            <div className="main-layout__bottom-content">
              {activeTab === 'waveform' && <WaveformView />}
              {activeTab === 'lut' && <LUTTable />}
              {activeTab === 'agent' && <OptimizationAgentPanel />}
            </div>
          </motion.div>
        </div>

        {/* Right panel - Chat */}
        <motion.aside
          className={`main-layout__sidebar main-layout__sidebar--right ${rightPanelCollapsed ? 'main-layout__sidebar--collapsed' : ''}`}
          animate={{ width: rightPanelCollapsed ? 48 : 400 }}
          transition={{ duration: 0.2 }}
        >
          <div className="main-layout__sidebar-header">
            <button
              className="main-layout__sidebar-toggle"
              onClick={toggleRightPanel}
            >
              <PanelRightClose size={16} style={{ transform: rightPanelCollapsed ? 'rotate(180deg)' : 'none' }} />
            </button>
            {!rightPanelCollapsed && (
              <span className="main-layout__sidebar-title">
                <MessageSquare size={14} />
                Vibe Debugger
              </span>
            )}
          </div>
          {!rightPanelCollapsed && (
            <motion.div
              className="main-layout__sidebar-content main-layout__sidebar-content--chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <ChatPanel />
            </motion.div>
          )}
        </motion.aside>
      </div>
    </div>
  );
};

export default MainLayout;

