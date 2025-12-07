import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CircuitVisualization } from '../Circuit';
import { SimulationControls, WaveformView, LUTTable, OptimizationAgentPanel } from '../Simulation';
import { ChatPanel } from '../Chat';
import { CodePortal } from '../CodePortal';
import { useOptimizationStore, useCurrentOptimizationRun } from '../../store';
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
  Upload,
} from 'lucide-react';
import './MainLayout.css';

type ActiveTab = 'waveform' | 'lut' | 'agent';

const MainLayout = () => {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('waveform');
  const [codePortalOpen, setCodePortalOpen] = useState(false);
  const { fetchStats } = useOptimizationStore();
  const currentRun = useCurrentOptimizationRun();

  // Fetch optimization stats on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed(prev => !prev);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed(prev => !prev);
  }, []);

  const toggleBottomExpanded = useCallback(() => {
    setBottomExpanded(prev => !prev);
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
        <div className="main-layout__header-actions">
          <button
            className="main-layout__upload-btn"
            onClick={() => setCodePortalOpen(true)}
          >
            <Upload size={16} />
            <span>Upload Code</span>
          </button>
        </div>
        <div className="main-layout__header-stats">
          <div className="main-layout__header-stat">
            <Activity size={14} />
            <span>200 MHz</span>
          </div>
          <div className="main-layout__header-stat">
            <BarChart3 size={14} />
            <span>198 / 256 LUTs</span>
          </div>
        </div>
      </header>

      {/* Code Portal Modal */}
      <CodePortal isOpen={codePortalOpen} onClose={() => setCodePortalOpen(false)} />

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
          {/* Circuit visualization */}
          <motion.div
            className="main-layout__circuit"
            animate={{ height: bottomExpanded ? '40%' : '55%' }}
            transition={{ duration: 0.2 }}
          >
            <CircuitVisualization />
          </motion.div>

          {/* Bottom panel - Waveform / LUT Table */}
          <motion.div
            className="main-layout__bottom"
            animate={{ height: bottomExpanded ? '60%' : '45%' }}
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

