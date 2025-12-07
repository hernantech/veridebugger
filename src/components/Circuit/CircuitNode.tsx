import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import type { FPGANode, SignalValue } from '../../types';
import { useSelectionStore, useViewSettingsStore } from '../../store';
import {
  Cpu,
  Box,
  Zap,
  ArrowRightLeft,
  Circle,
  Square,
} from 'lucide-react';
import './CircuitNode.css';

interface CircuitNodeData extends FPGANode {
  isActive?: boolean;
}

const getNodeIcon = (type: FPGANode['type']) => {
  switch (type) {
    case 'lut':
      return <Box size={16} />;
    case 'register':
      return <Square size={16} />;
    case 'dsp':
      return <Cpu size={16} />;
    case 'io':
      return <Circle size={16} />;
    case 'mux':
      return <ArrowRightLeft size={16} />;
    case 'buffer':
      return <Zap size={16} />;
    default:
      return <Box size={16} />;
  }
};

const getValueColor = (value: SignalValue): string => {
  switch (value) {
    case 0:
      return '#64748b'; // slate
    case 1:
      return '#22c55e'; // green
    case 'X':
      return '#ef4444'; // red
    case 'Z':
      return '#f59e0b'; // amber
    default:
      return '#64748b';
  }
};

const getUtilizationColor = (utilization: number): string => {
  if (utilization >= 90) return '#ef4444'; // red - critical
  if (utilization >= 70) return '#f59e0b'; // amber - warning
  if (utilization >= 50) return '#3b82f6'; // blue - moderate
  return '#22c55e'; // green - good
};

const CircuitNode = memo(({ data, selected }: NodeProps<CircuitNodeData>) => {
  const { selectedNodeId, hoveredNodeId, setSelectedNode, setHoveredNode } = useSelectionStore();
  const { showUtilization, showSignalValues, showNodeLabels } = useViewSettingsStore();
  
  const isSelected = selected || selectedNodeId === data.id;
  const isHovered = hoveredNodeId === data.id;
  const isActive = data.isActive;

  return (
    <motion.div
      className={`circuit-node circuit-node--${data.type} ${isSelected ? 'circuit-node--selected' : ''} ${isHovered ? 'circuit-node--hovered' : ''} ${data.isCriticalPath ? 'circuit-node--critical' : ''} ${isActive ? 'circuit-node--active' : ''}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: isActive ? 1.05 : 1, 
        opacity: 1,
        boxShadow: isActive 
          ? '0 0 20px rgba(34, 197, 94, 0.5)' 
          : isSelected 
            ? '0 0 0 2px #3b82f6' 
            : '0 2px 8px rgba(0,0,0,0.1)'
      }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHoveredNode(data.id)}
      onMouseLeave={() => setHoveredNode(null)}
      onClick={() => setSelectedNode(isSelected ? null : data.id)}
    >
      {/* Input handles */}
      {data.fanIn.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="circuit-node__handle circuit-node__handle--input"
        />
      )}

      {/* Node content */}
      <div className="circuit-node__header">
        <span className="circuit-node__icon">{getNodeIcon(data.type)}</span>
        {showNodeLabels && (
          <span className="circuit-node__name">{data.name}</span>
        )}
      </div>

      {/* Utilization bar */}
      {showUtilization && data.type === 'lut' && (
        <div className="circuit-node__utilization">
          <div 
            className="circuit-node__utilization-bar"
            style={{ 
              width: `${data.utilization}%`,
              backgroundColor: getUtilizationColor(data.utilization)
            }}
          />
          <span className="circuit-node__utilization-text">
            {Math.round(data.utilization)}%
          </span>
        </div>
      )}

      {/* Signal value indicator */}
      {showSignalValues && (
        <div 
          className="circuit-node__value"
          style={{ backgroundColor: getValueColor(data.currentValue) }}
        >
          {data.currentValue}
        </div>
      )}

      {/* Critical path indicator */}
      {data.isCriticalPath && (
        <motion.div 
          className="circuit-node__critical-badge"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          ⚡
        </motion.div>
      )}

      {/* Output handles */}
      {data.fanOut.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="circuit-node__handle circuit-node__handle--output"
        />
      )}
    </motion.div>
  );
});

CircuitNode.displayName = 'CircuitNode';

export default CircuitNode;

