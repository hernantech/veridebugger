/**
 * ChatPanel - Shows optimization agent reasoning and updates
 *
 * Displays real-time updates from the optimization agent,
 * including reasoning, phase information, and results.
 */

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useChatStore, useOptimizationAgentStore, useWaveformStore } from '../../store';
import ChatMessage from './ChatMessage';
import {
  Trash2,
  Sparkles,
  Cpu,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Zap,
  Activity,
} from 'lucide-react';
import './ChatPanel.css';

const ChatPanel = () => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastIterationRef = useRef<number>(-1);
  const lastStatusRef = useRef<string | null>(null);
  const { messages, clearMessages, addMessage } = useChatStore();
  const { currentRun } = useOptimizationAgentStore();
  const { waveform } = useWaveformStore();

  // Add reasoning messages to chat history when iteration changes
  useEffect(() => {
    if (!currentRun) {
      lastIterationRef.current = -1;
      lastStatusRef.current = null;
      return;
    }

    // Add message when reasoning changes on a new iteration
    if (currentRun.agentReasoning && currentRun.iteration > lastIterationRef.current) {
      addMessage({
        role: 'assistant',
        content: currentRun.agentReasoning,
        phase: currentRun.status,
        iteration: currentRun.iteration,
      });
      lastIterationRef.current = currentRun.iteration;
    }

    // Add completion/error message when status changes to final state
    if (currentRun.status !== lastStatusRef.current) {
      if (currentRun.status === 'completed' && lastStatusRef.current === 'running') {
        const reduction = currentRun.lutHistory.length > 1
          ? Math.round(((currentRun.lutHistory[0] - currentRun.lutHistory[currentRun.lutHistory.length - 1]) / currentRun.lutHistory[0]) * 100)
          : 0;
        addMessage({
          role: 'system',
          content: `✓ Optimization completed! ${reduction > 0 ? `Achieved ${reduction}% LUT reduction.` : ''} Final: ${currentRun.lutCount} LUTs`,
        });
      } else if (currentRun.status === 'failed' && lastStatusRef.current === 'running') {
        addMessage({
          role: 'system',
          content: `✗ Optimization failed: ${currentRun.error || 'Unknown error'}`,
        });
      } else if (currentRun.status === 'running' && lastStatusRef.current !== 'running') {
        addMessage({
          role: 'system',
          content: `Starting ${currentRun.mode === 'testgen' ? 'testbench generation' : 'optimization'} run...`,
        });
      }
      lastStatusRef.current = currentRun.status;
    }
  }, [currentRun?.iteration, currentRun?.agentReasoning, currentRun?.status, addMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel__header">
        <div className="chat-panel__title">
          <Sparkles size={16} className="chat-panel__icon" />
          <h2>Agent Reasoning</h2>
        </div>
        <div className="chat-panel__actions">
          <button
            className="chat-panel__action"
            onClick={clearMessages}
            title="Clear messages"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Current Run Status */}
      {currentRun && (
        <div className="chat-panel__run-status">
          <div className="chat-panel__run-info">
            <span className={`chat-panel__run-badge chat-panel__run-badge--${currentRun.status}`}>
              {currentRun.status === 'running' && <Zap size={12} className="spinning" />}
              {currentRun.status === 'completed' && <CheckCircle2 size={12} />}
              {currentRun.status === 'failed' && <XCircle size={12} />}
              {currentRun.status}
            </span>
            <span className="chat-panel__run-iter">
              <Cpu size={12} />
              Iteration {currentRun.iteration}
            </span>
            {currentRun.lutCount !== null && (
              <span className="chat-panel__run-lut">
                <TrendingDown size={12} />
                {currentRun.lutCount} LUTs
              </span>
            )}
          </div>
        </div>
      )}

      {/* VCD Status */}
      {waveform.signals.length > 0 && (
        <div className="chat-panel__vcd-status">
          <Activity size={12} />
          <span>VCD: {waveform.signals.length} signals captured</span>
          <span className={`chat-panel__vcd-result ${waveform.simPassed ? 'passed' : 'failed'}`}>
            {waveform.simPassed ? 'PASS' : 'FAIL'}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="chat-panel__messages">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Current reasoning */}
        {currentRun && currentRun.status === 'running' && currentRun.agentReasoning && (
          <motion.div
            className="chat-panel__current-reasoning"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="chat-panel__reasoning-header">
              <Zap size={14} />
              <span>Current Analysis</span>
            </div>
            <p>{currentRun.agentReasoning}</p>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* LUT History Chart */}
      {currentRun && currentRun.lutHistory.length > 1 && (
        <div className="chat-panel__lut-chart">
          <div className="chat-panel__lut-header">
            <TrendingDown size={14} />
            <span>LUT Optimization Progress</span>
          </div>
          <div className="chat-panel__lut-bars">
            {currentRun.lutHistory.map((lut, i) => {
              const maxLut = Math.max(...currentRun.lutHistory);
              const height = (lut / maxLut) * 100;
              const isLatest = i === currentRun.lutHistory.length - 1;
              return (
                <div
                  key={i}
                  className={`chat-panel__lut-bar ${isLatest ? 'latest' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`Iteration ${i}: ${lut} LUTs`}
                >
                  <span className="chat-panel__lut-value">{lut}</span>
                </div>
              );
            })}
          </div>
          <div className="chat-panel__lut-reduction">
            {currentRun.lutHistory.length > 1 && (
              <>
                <span>Reduction:</span>
                <strong>
                  {Math.round(
                    ((currentRun.lutHistory[0] - currentRun.lutHistory[currentRun.lutHistory.length - 1]) /
                      currentRun.lutHistory[0]) *
                      100
                  )}%
                </strong>
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!currentRun && messages.length <= 1 && (
        <div className="chat-panel__empty">
          <Sparkles size={32} />
          <h3>AI Agent Ready</h3>
          <p>Start an optimization run to see real-time reasoning and progress updates.</p>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
