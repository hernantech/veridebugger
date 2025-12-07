/**
 * ChatMessage - Displays optimization agent messages
 */

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import type { AgentMessage } from '../../store';
import { User, Bot, Terminal, Copy, Check, Zap, CheckCircle2 } from 'lucide-react';
import './ChatMessage.css';

interface ChatMessageProps {
  message: AgentMessage;
}

const CodeBlock = ({ code, language, filename }: { code: string; language: string; filename?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="chat-code-block">
      <div className="chat-code-block__header">
        <span className="chat-code-block__lang">{language}</span>
        {filename && <span className="chat-code-block__file">{filename}</span>}
        <button className="chat-code-block__copy" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="chat-code-block__code">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const ChatMessage = memo(({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  // Parse markdown-style formatting
  const formatContent = (content: string) => {
    // Split by code blocks first
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        // Extract language and code
        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
        if (match) {
          return (
            <CodeBlock
              key={i}
              language={match[1] || 'text'}
              code={match[2].trim()}
            />
          );
        }
      }

      // Format regular text with bold and lists
      return (
        <div key={i} className="chat-message__text">
          {part.split('\n').map((line, j) => {
            // Bold text
            let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // List items
            if (line.match(/^[-*]\s/)) {
              formatted = `<li>${formatted.substring(2)}</li>`;
            } else if (line.match(/^\d+\.\s/)) {
              formatted = `<li>${formatted.replace(/^\d+\.\s/, '')}</li>`;
            }

            return (
              <span
                key={j}
                dangerouslySetInnerHTML={{ __html: formatted || '<br/>' }}
              />
            );
          })}
        </div>
      );
    });
  };

  return (
    <motion.div
      className={`chat-message chat-message--${message.role}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Avatar */}
      <div className="chat-message__avatar">
        {isUser && <User size={16} />}
        {isAssistant && <Bot size={16} />}
        {isSystem && <Terminal size={16} />}
      </div>

      {/* Content */}
      <div className="chat-message__content">
        {/* Header */}
        <div className="chat-message__header">
          <span className="chat-message__role">
            {isUser ? 'You' : isAssistant ? 'AI Agent' : 'System'}
          </span>
          {message.iteration !== undefined && (
            <span className="chat-message__iteration">
              <Zap size={10} />
              Iter {message.iteration}
            </span>
          )}
          {message.phase && (
            <span className={`chat-message__phase chat-message__phase--${message.phase}`}>
              {message.phase === 'completed' && <CheckCircle2 size={10} />}
              {message.phase}
            </span>
          )}
          <span className="chat-message__time">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message body */}
        <div className="chat-message__body">
          {formatContent(message.content)}
        </div>
      </div>
    </motion.div>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;
