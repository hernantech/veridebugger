import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore, useSelectionStore, useCircuitStore } from '../../store';
import ChatMessage from './ChatMessage';
import {
  Send,
  Trash2,
  Sparkles,
  Loader2,
  X,
  Box,
  Radio,
  Clock,
} from 'lucide-react';
import './ChatPanel.css';

const ChatPanel = () => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    fetchHistory,
    sendMessage,
    clearHistory,
  } = useChatStore();

  const { selectedNodeId, selectedSignalId, getContext, clearSelection } = useSelectionStore();
  const { region } = useCircuitStore();

  // Fetch chat history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;

    const context = getContext();
    sendMessage(input.trim(), context);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const selectedNode = region?.nodes.find(n => n.id === selectedNodeId);

  // Quick prompts
  const quickPrompts = [
    { icon: '🔍', text: 'Analyze selected node', requiresSelection: true },
    { icon: '⚡', text: 'Find critical path bottlenecks', requiresSelection: false },
    { icon: '📉', text: 'Suggest LUT optimizations', requiresSelection: false },
    { icon: '🔧', text: 'Explain this circuit region', requiresSelection: false },
  ];

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel__header">
        <div className="chat-panel__title">
          <Sparkles size={16} className="chat-panel__icon" />
          <h2>Vibe Debugger</h2>
        </div>
        <div className="chat-panel__actions">
          <button
            className="chat-panel__action"
            onClick={clearHistory}
            title="Clear conversation"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Context bar */}
      <AnimatePresence>
        {(selectedNodeId || selectedSignalId) && (
          <motion.div
            className="chat-panel__context"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <span className="chat-panel__context-label">Context:</span>
            {selectedNode && (
              <div className="chat-panel__context-item">
                <Box size={12} />
                <span>{selectedNode.name}</span>
                <span className="chat-panel__context-type">{selectedNode.type}</span>
              </div>
            )}
            {selectedSignalId && (
              <div className="chat-panel__context-item">
                <Radio size={12} />
                <span>{selectedSignalId}</span>
              </div>
            )}
            <button
              className="chat-panel__context-clear"
              onClick={clearSelection}
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="chat-panel__messages">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Streaming message */}
        {isStreaming && (
          <ChatMessage
            message={{
              id: 'streaming',
              role: 'assistant',
              content: '',
              timestamp: new Date(),
            }}
            isStreaming
            streamingContent={streamingContent}
          />
        )}

        {/* Loading indicator */}
        {isLoading && !isStreaming && (
          <motion.div
            className="chat-panel__loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 size={16} className="chat-panel__loading-icon" />
            <span>Analyzing...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="chat-panel__quick-prompts">
          {quickPrompts.map((prompt, i) => (
            <motion.button
              key={i}
              className="chat-panel__quick-prompt"
              onClick={() => {
                if (!prompt.requiresSelection || selectedNodeId) {
                  setInput(prompt.text);
                  inputRef.current?.focus();
                }
              }}
              disabled={prompt.requiresSelection && !selectedNodeId}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span>{prompt.icon}</span>
              <span>{prompt.text}</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Input area */}
      <form className="chat-panel__input-area" onSubmit={handleSubmit}>
        <div className="chat-panel__input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-panel__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your circuit, LUT usage, or optimization strategies..."
            rows={1}
            disabled={isLoading || isStreaming}
          />
          <motion.button
            type="submit"
            className="chat-panel__send"
            disabled={!input.trim() || isLoading || isStreaming}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isLoading || isStreaming ? (
              <Loader2 size={18} className="chat-panel__send-loading" />
            ) : (
              <Send size={18} />
            )}
          </motion.button>
        </div>
        <div className="chat-panel__input-hint">
          <Clock size={10} />
          <span>Press Enter to send, Shift+Enter for new line</span>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;

