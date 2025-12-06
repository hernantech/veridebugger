import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCircuitStore, useSelectionStore, useOptimizationStore } from '../../store';
import type { FPGANode } from '../../types';
import {
  ChevronRight,
  Zap,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import './LUTTable.css';

interface LUTRowProps {
  node: FPGANode;
  isSelected: boolean;
  onSelect: () => void;
}

const LUTRow = ({ node, isSelected, onSelect }: LUTRowProps) => {
  const utilizationColor = useMemo(() => {
    if (node.utilization >= 90) return '#ef4444';
    if (node.utilization >= 70) return '#f59e0b';
    if (node.utilization >= 50) return '#3b82f6';
    return '#22c55e';
  }, [node.utilization]);

  return (
    <motion.tr
      className={`lut-table__row ${isSelected ? 'lut-table__row--selected' : ''} ${node.isCriticalPath ? 'lut-table__row--critical' : ''}`}
      onClick={onSelect}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ backgroundColor: isSelected ? '#dbeafe' : '#f8fafc' }}
      transition={{ duration: 0.15 }}
    >
      <td className="lut-table__cell lut-table__cell--id">
        <span className="lut-table__id">{node.id}</span>
      </td>
      <td className="lut-table__cell lut-table__cell--name">
        <span className="lut-table__name">{node.name}</span>
        {node.isCriticalPath && (
          <Zap size={12} className="lut-table__critical-icon" />
        )}
      </td>
      <td className="lut-table__cell lut-table__cell--value">
        <span 
          className="lut-table__value"
          style={{ 
            color: node.currentValue === 1 ? '#22c55e' : 
                   node.currentValue === 0 ? '#64748b' : 
                   node.currentValue === 'X' ? '#ef4444' : '#f59e0b'
          }}
        >
          {node.currentValue}
        </span>
      </td>
      <td className="lut-table__cell lut-table__cell--util">
        <div className="lut-table__util-bar">
          <div 
            className="lut-table__util-fill"
            style={{ 
              width: `${node.utilization}%`,
              backgroundColor: utilizationColor 
            }}
          />
        </div>
        <span className="lut-table__util-text" style={{ color: utilizationColor }}>
          {Math.round(node.utilization)}%
        </span>
      </td>
      <td className="lut-table__cell lut-table__cell--fanin">
        {node.fanIn.length}
      </td>
      <td className="lut-table__cell lut-table__cell--fanout">
        {node.fanOut.length}
      </td>
      <td className="lut-table__cell lut-table__cell--action">
        <ChevronRight size={14} />
      </td>
    </motion.tr>
  );
};

const LUTTable = () => {
  const { region } = useCircuitStore();
  const { selectedNodeId, setSelectedNode } = useSelectionStore();
  const { stats, isApplying, applySuggestion } = useOptimizationStore();

  const lutNodes = useMemo(() => {
    if (!region) return [];
    return region.nodes.filter(n => n.type === 'lut');
  }, [region]);

  const sortedNodes = useMemo(() => {
    return [...lutNodes].sort((a, b) => {
      // Critical path first, then by utilization
      if (a.isCriticalPath !== b.isCriticalPath) {
        return a.isCriticalPath ? -1 : 1;
      }
      return b.utilization - a.utilization;
    });
  }, [lutNodes]);

  return (
    <div className="lut-table-container">
      {/* LUT Summary */}
      <div className="lut-table__summary">
        <div className="lut-table__summary-item">
          <span className="lut-table__summary-value">{lutNodes.length}</span>
          <span className="lut-table__summary-label">Total LUTs</span>
        </div>
        <div className="lut-table__summary-item lut-table__summary-item--critical">
          <span className="lut-table__summary-value">
            {lutNodes.filter(n => n.isCriticalPath).length}
          </span>
          <span className="lut-table__summary-label">Critical</span>
        </div>
        <div className="lut-table__summary-item">
          <span className="lut-table__summary-value">
            {Math.round(lutNodes.reduce((sum, n) => sum + n.utilization, 0) / lutNodes.length || 0)}%
          </span>
          <span className="lut-table__summary-label">Avg Util</span>
        </div>
      </div>

      {/* LUT Table */}
      <div className="lut-table__wrapper">
        <table className="lut-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Value</th>
              <th>Utilization</th>
              <th>Fan-In</th>
              <th>Fan-Out</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sortedNodes.map((node) => (
                <LUTRow
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onSelect={() => setSelectedNode(selectedNodeId === node.id ? null : node.id)}
                />
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Optimization Suggestions */}
      {stats && stats.suggestions.length > 0 && (
        <div className="lut-table__optimizations">
          <div className="lut-table__optimizations-header">
            <Lightbulb size={14} />
            <span>Optimization Suggestions</span>
            <span className="lut-table__optimizations-count">
              {stats.suggestions.filter(s => !s.applied).length}
            </span>
          </div>

          <div className="lut-table__optimizations-list">
            {stats.suggestions.slice(0, 3).map((suggestion) => (
              <motion.div
                key={suggestion.id}
                className={`lut-table__suggestion ${suggestion.applied ? 'lut-table__suggestion--applied' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: suggestion.applied ? 1 : 1.01 }}
              >
                <div className="lut-table__suggestion-header">
                  <span className={`lut-table__suggestion-type lut-table__suggestion-type--${suggestion.type}`}>
                    {suggestion.type}
                  </span>
                  <span className="lut-table__suggestion-confidence">
                    {suggestion.confidence}% confidence
                  </span>
                </div>
                
                <h4 className="lut-table__suggestion-title">{suggestion.title}</h4>
                
                <div className="lut-table__suggestion-stats">
                  <div className="lut-table__suggestion-stat">
                    <span>{suggestion.beforeLUTs}</span>
                    <ArrowDown size={12} />
                    <span className="lut-table__suggestion-stat--after">{suggestion.afterLUTs}</span>
                    <span className="lut-table__suggestion-stat--label">LUTs</span>
                  </div>
                  {suggestion.latencyImpact !== 0 && (
                    <div className="lut-table__suggestion-stat">
                      <AlertTriangle size={12} />
                      <span>{suggestion.latencyImpact > 0 ? '+' : ''}{suggestion.latencyImpact} cycles</span>
                    </div>
                  )}
                </div>

                {suggestion.applied ? (
                  <div className="lut-table__suggestion-applied">
                    <CheckCircle size={14} />
                    Applied
                  </div>
                ) : (
                  <motion.button
                    className="lut-table__suggestion-btn"
                    onClick={() => applySuggestion(suggestion.id)}
                    disabled={isApplying}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Sparkles size={14} />
                    Apply Optimization
                  </motion.button>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LUTTable;

