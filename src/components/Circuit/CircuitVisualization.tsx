/**
 * CodePreview - Shows current optimized Verilog code
 *
 * Displays the code from the current optimization run
 * with syntax highlighting for Verilog.
 */

import { useMemo, useState } from 'react';
import { useOptimizationAgentStore, useCurrentOptimizationRun } from '../../store';
import {
  FileCode,
  Copy,
  Check,
  Download,
  Cpu,
  CheckCircle2,
  XCircle,
  TrendingDown,
} from 'lucide-react';
import './CircuitVisualization.css';

const CodePreview = () => {
  const [copied, setCopied] = useState(false);
  const { designCode } = useOptimizationAgentStore();
  const currentRun = useCurrentOptimizationRun();

  // Use optimized code if available, else original
  const displayCode = currentRun?.code || designCode;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([displayCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optimized_design.v';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple syntax highlighting for Verilog
  const highlightedCode = useMemo(() => {
    const keywords = /\b(module|endmodule|input|output|inout|wire|reg|always|begin|end|if|else|case|endcase|for|while|assign|parameter|localparam|generate|endgenerate|integer|posedge|negedge|initial|function|endfunction|task|endtask)\b/g;
    const types = /\b(logic|bit|int|real|time|signed|unsigned)\b/g;
    const numbers = /\b(\d+'[bBhHdDoO][0-9a-fA-F_]+|\d+)\b/g;
    const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
    const strings = /(".*?")/g;

    let code = displayCode;

    // Escape HTML
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Apply highlighting
    code = code.replace(comments, '<span class="comment">$1</span>');
    code = code.replace(strings, '<span class="string">$1</span>');
    code = code.replace(keywords, '<span class="keyword">$1</span>');
    code = code.replace(types, '<span class="type">$1</span>');
    code = code.replace(numbers, '<span class="number">$1</span>');

    return code;
  }, [displayCode]);

  const lineCount = displayCode.split('\n').length;
  const reduction = currentRun?.lutHistory && currentRun.lutHistory.length > 1
    ? Math.round(((currentRun.lutHistory[0] - currentRun.lutHistory[currentRun.lutHistory.length - 1]) / currentRun.lutHistory[0]) * 100)
    : 0;

  return (
    <div className="code-preview">
      {/* Header */}
      <div className="code-preview__header">
        <div className="code-preview__title">
          <FileCode size={14} />
          <span>{currentRun ? 'Optimized Code' : 'Design Code'}</span>
          {currentRun && (
            <span className="code-preview__badge">
              Iteration {currentRun.iteration}
            </span>
          )}
        </div>

        <div className="code-preview__stats">
          {currentRun?.lutCount !== null && currentRun?.lutCount !== undefined && (
            <div className="code-preview__stat">
              <Cpu size={12} />
              <span>{currentRun.lutCount} LUTs</span>
            </div>
          )}
          {reduction > 0 && (
            <div className="code-preview__stat code-preview__stat--success">
              <TrendingDown size={12} />
              <span>{reduction}% reduced</span>
            </div>
          )}
          {currentRun && (
            <div className={`code-preview__stat ${currentRun.simPassed ? 'code-preview__stat--success' : 'code-preview__stat--error'}`}>
              {currentRun.simPassed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              <span>{currentRun.simPassed ? 'Tests Pass' : 'Tests Fail'}</span>
            </div>
          )}
        </div>

        <div className="code-preview__actions">
          <button
            className="code-preview__btn"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="code-preview__btn"
            onClick={handleDownload}
            title="Download Verilog file"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Code display */}
      <div className="code-preview__content">
        <div className="code-preview__line-numbers">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i + 1}>{i + 1}</span>
          ))}
        </div>
        <pre className="code-preview__code">
          <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
        </pre>
      </div>

      {/* Footer */}
      <div className="code-preview__footer">
        <span>{lineCount} lines</span>
        <span>Verilog HDL</span>
      </div>
    </div>
  );
};

// Keep the same export name for backward compatibility
const CircuitVisualization = CodePreview;

export default CircuitVisualization;
