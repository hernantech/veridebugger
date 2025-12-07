/**
 * LUTTable - Shows LUT optimization history and statistics
 *
 * Displays real LUT count data from optimization runs.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useCurrentOptimizationRun, useLutStatsStore } from '../../store';
import {
  TrendingDown,
  TrendingUp,
  BarChart3,
  Zap,
  CheckCircle2,
  XCircle,
  Sparkles,
  Target,
} from 'lucide-react';
import './LUTTable.css';

const LUTTable = () => {
  const currentRun = useCurrentOptimizationRun();
  const { stats } = useLutStatsStore();

  // Calculate stats from current run
  const lutHistory = currentRun?.lutHistory || stats?.history || [];
  const originalLuts = lutHistory[0] || 0;
  const currentLuts = lutHistory[lutHistory.length - 1] || 0;
  const reduction = originalLuts > 0 ? Math.round(((originalLuts - currentLuts) / originalLuts) * 100) : 0;
  const maxLut = Math.max(...lutHistory, 1);

  // Empty state
  if (lutHistory.length === 0) {
    return (
      <div className="lut-table-container lut-table-container--empty">
        <BarChart3 size={32} />
        <h3>No LUT Data</h3>
        <p>Run an optimization to see LUT reduction statistics.</p>
      </div>
    );
  }

  return (
    <div className="lut-table-container">
      {/* Summary Cards */}
      <div className="lut-table__summary">
        <div className="lut-table__summary-card">
          <div className="lut-table__summary-icon">
            <Target size={16} />
          </div>
          <div className="lut-table__summary-content">
            <span className="lut-table__summary-value">{originalLuts}</span>
            <span className="lut-table__summary-label">Original LUTs</span>
          </div>
        </div>

        <div className="lut-table__summary-card lut-table__summary-card--highlight">
          <div className="lut-table__summary-icon">
            <Zap size={16} />
          </div>
          <div className="lut-table__summary-content">
            <span className="lut-table__summary-value">{currentLuts}</span>
            <span className="lut-table__summary-label">Current LUTs</span>
          </div>
        </div>

        <div className={`lut-table__summary-card ${reduction > 0 ? 'lut-table__summary-card--success' : ''}`}>
          <div className="lut-table__summary-icon">
            {reduction >= 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
          </div>
          <div className="lut-table__summary-content">
            <span className="lut-table__summary-value">{reduction}%</span>
            <span className="lut-table__summary-label">Reduction</span>
          </div>
        </div>

        <div className="lut-table__summary-card">
          <div className="lut-table__summary-icon">
            {currentRun?.simPassed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          </div>
          <div className="lut-table__summary-content">
            <span className={`lut-table__summary-value ${currentRun?.simPassed ? 'success' : 'error'}`}>
              {currentRun?.simPassed ? 'PASS' : 'FAIL'}
            </span>
            <span className="lut-table__summary-label">Tests</span>
          </div>
        </div>
      </div>

      {/* LUT History Chart */}
      <div className="lut-table__chart">
        <div className="lut-table__chart-header">
          <Sparkles size={14} />
          <span>LUT Optimization Progress</span>
          <span className="lut-table__chart-iterations">{lutHistory.length} iterations</span>
        </div>

        <div className="lut-table__chart-container">
          <div className="lut-table__chart-y-axis">
            <span>{maxLut}</span>
            <span>{Math.round(maxLut / 2)}</span>
            <span>0</span>
          </div>

          <div className="lut-table__chart-bars">
            <AnimatePresence>
              {lutHistory.map((lut, i) => {
                const height = (lut / maxLut) * 100;
                const isLatest = i === lutHistory.length - 1;
                const delta = i > 0 ? lut - lutHistory[i - 1] : 0;

                return (
                  <motion.div
                    key={i}
                    className={`lut-table__chart-bar ${isLatest ? 'latest' : ''}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: `${height}%`, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ delay: i * 0.05 }}
                    title={`Iteration ${i}: ${lut} LUTs`}
                  >
                    <div className="lut-table__chart-bar-value">
                      <span>{lut}</span>
                      {delta !== 0 && i > 0 && (
                        <span className={`lut-table__chart-bar-delta ${delta < 0 ? 'down' : 'up'}`}>
                          {delta < 0 ? delta : `+${delta}`}
                        </span>
                      )}
                    </div>
                    <div className="lut-table__chart-bar-label">
                      {i}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="lut-table__chart-x-axis">
          <span>Iteration</span>
        </div>
      </div>

      {/* Iteration Details Table */}
      <div className="lut-table__details">
        <div className="lut-table__details-header">
          <span>Iteration History</span>
        </div>
        <table className="lut-table">
          <thead>
            <tr>
              <th>#</th>
              <th>LUTs</th>
              <th>Change</th>
              <th>% of Original</th>
            </tr>
          </thead>
          <tbody>
            {lutHistory.map((lut, i) => {
              const delta = i > 0 ? lut - lutHistory[i - 1] : 0;
              const percentOfOriginal = Math.round((lut / originalLuts) * 100);

              return (
                <tr key={i} className={i === lutHistory.length - 1 ? 'current' : ''}>
                  <td>{i}</td>
                  <td className="lut-count">{lut}</td>
                  <td className={`delta ${delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}>
                    {i === 0 ? '-' : delta < 0 ? delta : delta > 0 ? `+${delta}` : '0'}
                  </td>
                  <td>{percentOfOriginal}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LUTTable;
