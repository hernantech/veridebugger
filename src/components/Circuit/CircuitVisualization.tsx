import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import { useCircuitStore, useSimulationStore, useSelectionStore, useViewSettingsStore } from '../../store';
import CircuitNode from './CircuitNode';
import type { FPGANode } from '../../types';
import {
  Eye,
  EyeOff,
  Zap,
  Activity,
  Tag,
  BarChart3,
} from 'lucide-react';
import './CircuitVisualization.css';

const nodeTypes = {
  circuitNode: CircuitNode,
};

const CircuitVisualization = () => {
  const { region, isLoading, fetchCircuit } = useCircuitStore();
  const { state: simState } = useSimulationStore();
  const { selectedNodeId } = useSelectionStore();
  const { 
    showCriticalPaths, 
    showUtilization, 
    showSignalValues, 
    showNodeLabels,
    toggleCriticalPaths,
    toggleUtilization,
    toggleSignalValues,
    toggleNodeLabels,
  } = useViewSettingsStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch circuit data on mount
  useEffect(() => {
    fetchCircuit();
  }, [fetchCircuit]);

  // Convert FPGA nodes to ReactFlow nodes
  useEffect(() => {
    if (!region) return;

    const activeNodes = new Set(simState?.activeNodes || []);
    const activePaths = new Set(simState?.activePaths || []);

    const flowNodes: Node[] = region.nodes.map((node: FPGANode) => ({
      id: node.id,
      type: 'circuitNode',
      position: node.position,
      data: {
        ...node,
        isActive: activeNodes.has(node.id),
      },
      selected: node.id === selectedNodeId,
    }));

    const flowEdges: Edge[] = region.connections.map((conn) => ({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      type: 'smoothstep',
      animated: activePaths.has(conn.id),
      style: {
        stroke: conn.isCriticalPath && showCriticalPaths 
          ? '#ef4444' 
          : activePaths.has(conn.id) 
            ? '#22c55e' 
            : '#94a3b8',
        strokeWidth: conn.isCriticalPath ? 2.5 : activePaths.has(conn.id) ? 2 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: conn.isCriticalPath && showCriticalPaths 
          ? '#ef4444' 
          : activePaths.has(conn.id) 
            ? '#22c55e' 
            : '#94a3b8',
        width: 15,
        height: 15,
      },
      label: conn.signalName,
      labelStyle: { 
        fontSize: 9, 
        fill: '#64748b',
        fontFamily: 'JetBrains Mono, SF Mono, monospace',
      },
      labelBgStyle: { 
        fill: 'white', 
        fillOpacity: 0.8,
      },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [region, simState, selectedNodeId, showCriticalPaths, setNodes, setEdges]);

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  // Stats for the header
  const stats = useMemo(() => {
    if (!region) return null;
    const lutNodes = region.nodes.filter(n => n.type === 'lut');
    const avgUtilization = lutNodes.length > 0
      ? lutNodes.reduce((sum, n) => sum + n.utilization, 0) / lutNodes.length
      : 0;
    const criticalCount = region.nodes.filter(n => n.isCriticalPath).length;
    return {
      totalNodes: region.nodes.length,
      lutCount: lutNodes.length,
      avgUtilization: Math.round(avgUtilization),
      criticalCount,
    };
  }, [region]);

  if (isLoading) {
    return (
      <div className="circuit-visualization circuit-visualization--loading">
        <motion.div
          className="circuit-visualization__loader"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Activity size={32} />
        </motion.div>
        <p>Loading circuit topology...</p>
      </div>
    );
  }

  return (
    <div className="circuit-visualization">
      {/* Header with stats and controls */}
      <div className="circuit-visualization__header">
        <div className="circuit-visualization__title">
          <h2>Circuit Topology</h2>
          {region && (
            <span className="circuit-visualization__region-name">
              {region.name}
            </span>
          )}
        </div>

        {stats && (
          <div className="circuit-visualization__stats">
            <div className="circuit-visualization__stat">
              <span className="circuit-visualization__stat-value">{stats.totalNodes}</span>
              <span className="circuit-visualization__stat-label">Nodes</span>
            </div>
            <div className="circuit-visualization__stat">
              <span className="circuit-visualization__stat-value">{stats.lutCount}</span>
              <span className="circuit-visualization__stat-label">LUTs</span>
            </div>
            <div className="circuit-visualization__stat">
              <span className="circuit-visualization__stat-value">{stats.avgUtilization}%</span>
              <span className="circuit-visualization__stat-label">Avg Util</span>
            </div>
            <div className="circuit-visualization__stat circuit-visualization__stat--critical">
              <span className="circuit-visualization__stat-value">{stats.criticalCount}</span>
              <span className="circuit-visualization__stat-label">Critical</span>
            </div>
          </div>
        )}

        <div className="circuit-visualization__controls">
          <button
            className={`circuit-visualization__toggle ${showCriticalPaths ? 'circuit-visualization__toggle--active' : ''}`}
            onClick={toggleCriticalPaths}
            title="Show Critical Paths"
          >
            <Zap size={14} />
          </button>
          <button
            className={`circuit-visualization__toggle ${showUtilization ? 'circuit-visualization__toggle--active' : ''}`}
            onClick={toggleUtilization}
            title="Show Utilization"
          >
            <BarChart3 size={14} />
          </button>
          <button
            className={`circuit-visualization__toggle ${showSignalValues ? 'circuit-visualization__toggle--active' : ''}`}
            onClick={toggleSignalValues}
            title="Show Signal Values"
          >
            {showSignalValues ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            className={`circuit-visualization__toggle ${showNodeLabels ? 'circuit-visualization__toggle--active' : ''}`}
            onClick={toggleNodeLabels}
            title="Show Node Labels"
          >
            <Tag size={14} />
          </button>
        </div>
      </div>

      {/* ReactFlow canvas */}
      <div className="circuit-visualization__canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <Controls className="circuit-visualization__flow-controls" />
          <MiniMap
            className="circuit-visualization__minimap"
            nodeColor={(node) => {
              const data = node.data as FPGANode;
              if (data.isCriticalPath) return '#ef4444';
              switch (data.type) {
                case 'lut': return '#fbbf24';
                case 'register': return '#38bdf8';
                case 'dsp': return '#d946ef';
                case 'io': return '#22c55e';
                case 'mux': return '#f97316';
                default: return '#94a3b8';
              }
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="circuit-visualization__legend">
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--lut" />
          <span>LUT</span>
        </div>
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--register" />
          <span>Register</span>
        </div>
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--dsp" />
          <span>DSP</span>
        </div>
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--io" />
          <span>I/O</span>
        </div>
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--mux" />
          <span>MUX</span>
        </div>
        <div className="circuit-visualization__legend-item">
          <span className="circuit-visualization__legend-color circuit-visualization__legend-color--critical" />
          <span>Critical</span>
        </div>
      </div>
    </div>
  );
};

export default CircuitVisualization;

