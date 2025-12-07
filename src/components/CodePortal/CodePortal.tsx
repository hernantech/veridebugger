import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptimizationAgentStore } from '../../store';
import {
  Upload,
  FileCode,
  TestTube,
  X,
  Check,
  Copy,
  Trash2,
  Sparkles,
} from 'lucide-react';
import './CodePortal.css';

interface CodePortalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CodePortal = ({ isOpen, onClose }: CodePortalProps) => {
  const [activeTab, setActiveTab] = useState<'design' | 'testbench'>('design');
  const [localDesignCode, setLocalDesignCode] = useState('');
  const [localTestbenchCode, setLocalTestbenchCode] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    designCode,
    testbenchCode,
    setDesignCode,
    setTestbenchCode,
    generateTestbench,
    isStarting,
  } = useOptimizationAgentStore();

  // Load current code when opening
  const handleOpen = () => {
    setLocalDesignCode(designCode);
    setLocalTestbenchCode(testbenchCode);
  };

  // Apply changes to the store
  const handleApply = () => {
    setDesignCode(localDesignCode);
    setTestbenchCode(localTestbenchCode);
    onClose();
  };

  // Copy code to clipboard
  const handleCopy = () => {
    const code = activeTab === 'design' ? localDesignCode : localTestbenchCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Clear the active editor
  const handleClear = () => {
    if (activeTab === 'design') {
      setLocalDesignCode('');
    } else {
      setLocalTestbenchCode('');
    }
  };

  // Auto-generate testbench from design
  const handleAutoGenerate = async () => {
    if (localDesignCode) {
      setDesignCode(localDesignCode);
      await generateTestbench();
      // Reload the testbench from store after generation
      setTimeout(() => {
        const store = useOptimizationAgentStore.getState();
        setLocalTestbenchCode(store.testbenchCode);
        setActiveTab('testbench');
      }, 500);
    }
  };

  // Sample templates
  const sampleDesigns = [
    {
      name: '4x4 Matrix Multiply',
      code: `module matmul #(
  parameter WIDTH = 8,
  parameter SIZE = 4
)(
  input clk,
  input rst,
  input [WIDTH*SIZE*SIZE-1:0] A,
  input [WIDTH*SIZE*SIZE-1:0] B,
  output reg [WIDTH*2*SIZE*SIZE-1:0] C,
  output reg done
);
  integer i, j, k;
  always @(posedge clk) begin
    if (rst) begin
      C <= 0;
      done <= 0;
    end else begin
      for (i = 0; i < SIZE; i = i + 1) begin
        for (j = 0; j < SIZE; j = j + 1) begin
          C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] = 0;
          for (k = 0; k < SIZE; k = k + 1) begin
            C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] =
              C[(i*SIZE+j)*WIDTH*2 +: WIDTH*2] +
              A[(i*SIZE+k)*WIDTH +: WIDTH] * B[(k*SIZE+j)*WIDTH +: WIDTH];
          end
        end
      end
      done <= 1;
    end
  end
endmodule`,
    },
    {
      name: 'Simple Counter',
      code: `module counter #(
  parameter WIDTH = 8
)(
  input clk,
  input rst,
  input enable,
  output reg [WIDTH-1:0] count,
  output overflow
);
  assign overflow = (count == {WIDTH{1'b1}});

  always @(posedge clk or posedge rst) begin
    if (rst)
      count <= 0;
    else if (enable)
      count <= count + 1;
  end
endmodule`,
    },
    {
      name: 'FIFO Buffer',
      code: `module fifo #(
  parameter DATA_WIDTH = 8,
  parameter DEPTH = 16
)(
  input clk,
  input rst,
  input wr_en,
  input rd_en,
  input [DATA_WIDTH-1:0] din,
  output reg [DATA_WIDTH-1:0] dout,
  output full,
  output empty
);
  reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];
  reg [$clog2(DEPTH):0] wr_ptr, rd_ptr, count;

  assign full = (count == DEPTH);
  assign empty = (count == 0);

  always @(posedge clk or posedge rst) begin
    if (rst) begin
      wr_ptr <= 0;
      rd_ptr <= 0;
      count <= 0;
    end else begin
      if (wr_en && !full) begin
        mem[wr_ptr] <= din;
        wr_ptr <= wr_ptr + 1;
        count <= count + 1;
      end
      if (rd_en && !empty) begin
        dout <= mem[rd_ptr];
        rd_ptr <= rd_ptr + 1;
        count <= count - 1;
      end
    end
  end
endmodule`,
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="code-portal__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="code-portal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onAnimationStart={() => handleOpen()}
          >
            {/* Header */}
            <div className="code-portal__header">
              <div className="code-portal__title">
                <Upload size={20} />
                <h2>Verilog Code Portal</h2>
              </div>
              <button className="code-portal__close" onClick={onClose}>
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="code-portal__tabs">
              <button
                className={`code-portal__tab ${activeTab === 'design' ? 'code-portal__tab--active' : ''}`}
                onClick={() => setActiveTab('design')}
              >
                <FileCode size={14} />
                Design Code
              </button>
              <button
                className={`code-portal__tab ${activeTab === 'testbench' ? 'code-portal__tab--active' : ''}`}
                onClick={() => setActiveTab('testbench')}
              >
                <TestTube size={14} />
                Testbench
              </button>
            </div>

            {/* Content */}
            <div className="code-portal__content">
              {/* Editor */}
              <div className="code-portal__editor-section">
                <div className="code-portal__editor-header">
                  <span>
                    {activeTab === 'design' ? 'Paste your Verilog design code' : 'Paste your testbench code'}
                  </span>
                  <div className="code-portal__editor-actions">
                    <button onClick={handleCopy} title="Copy to clipboard">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={handleClear} title="Clear">
                      <Trash2 size={14} />
                    </button>
                    {activeTab === 'testbench' && (
                      <button
                        className="code-portal__auto-generate"
                        onClick={handleAutoGenerate}
                        disabled={isStarting || !localDesignCode}
                        title="Auto-generate from design"
                      >
                        <Sparkles size={14} />
                        Auto-generate
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  className="code-portal__editor"
                  value={activeTab === 'design' ? localDesignCode : localTestbenchCode}
                  onChange={(e) => {
                    if (activeTab === 'design') {
                      setLocalDesignCode(e.target.value);
                    } else {
                      setLocalTestbenchCode(e.target.value);
                    }
                  }}
                  placeholder={
                    activeTab === 'design'
                      ? 'Paste your Verilog module here...\n\nmodule my_design (\n  input clk,\n  input rst,\n  ...\n);\n  // Your logic here\nendmodule'
                      : 'Paste your testbench here...\n\n`timescale 1ns/1ps\nmodule my_design_tb;\n  // Test vectors\nendmodule'
                  }
                  spellCheck={false}
                />
                <div className="code-portal__editor-footer">
                  <span>
                    {(activeTab === 'design' ? localDesignCode : localTestbenchCode).split('\n').length} lines
                  </span>
                </div>
              </div>

              {/* Templates sidebar */}
              {activeTab === 'design' && (
                <div className="code-portal__templates">
                  <h3>Sample Templates</h3>
                  <div className="code-portal__template-list">
                    {sampleDesigns.map((template, i) => (
                      <button
                        key={i}
                        className="code-portal__template"
                        onClick={() => setLocalDesignCode(template.code)}
                      >
                        <FileCode size={14} />
                        <span>{template.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="code-portal__footer">
              <button className="code-portal__btn code-portal__btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="code-portal__btn code-portal__btn--primary"
                onClick={handleApply}
                disabled={!localDesignCode}
              >
                <Check size={16} />
                Apply Code
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CodePortal;
