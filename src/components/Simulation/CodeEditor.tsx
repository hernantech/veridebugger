import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export type CodeLanguage = 'verilog' | 'c';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  height?: string;
  readOnly?: boolean;
}

// Map our language types to Monaco language IDs
const languageMap: Record<CodeLanguage, string> = {
  verilog: 'verilog',
  c: 'c',
};

const CodeEditor = ({
  value,
  onChange,
  language,
  height = '200px',
  readOnly = false
}: CodeEditorProps) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Register Verilog language if not already registered
    if (!monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === 'verilog')) {
      monaco.languages.register({ id: 'verilog' });

      // Verilog syntax highlighting
      monaco.languages.setMonarchTokensProvider('verilog', {
        keywords: [
          'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg',
          'parameter', 'localparam', 'integer', 'real', 'time', 'realtime',
          'always', 'initial', 'begin', 'end', 'if', 'else', 'case', 'casex',
          'casez', 'default', 'endcase', 'for', 'while', 'repeat', 'forever',
          'assign', 'deassign', 'force', 'release', 'posedge', 'negedge',
          'function', 'endfunction', 'task', 'endtask', 'generate', 'endgenerate',
          'genvar', 'signed', 'unsigned', 'and', 'nand', 'or', 'nor', 'xor',
          'xnor', 'not', 'buf', 'bufif0', 'bufif1', 'notif0', 'notif1',
        ],
        typeKeywords: [
          'supply0', 'supply1', 'tri', 'triand', 'trior', 'tri0', 'tri1',
          'wand', 'wor', 'trireg', 'scalared', 'vectored', 'specparam',
        ],
        operators: [
          '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
          '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^',
          '%', '<<', '>>', '>>>', '<<<', '===', '!==',
        ],
        symbols: /[=><!~?:&|+\-*\/\^%]+/,
        tokenizer: {
          root: [
            [/[a-z_$][\w$]*/, {
              cases: {
                '@keywords': 'keyword',
                '@typeKeywords': 'type',
                '@default': 'identifier'
              }
            }],
            [/[A-Z][\w$]*/, 'type.identifier'],
            { include: '@whitespace' },
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
              cases: {
                '@operators': 'operator',
                '@default': ''
              }
            }],
            [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/\d+'[bBoOdDhH][0-9a-fA-FxXzZ_]+/, 'number.hex'],
            [/\d+/, 'number'],
            [/[;,.]/, 'delimiter'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
          ],
          string: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
          ],
          whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
          ],
          comment: [
            [/[^\/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
          ],
        },
      });
    }
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    onChange(value ?? '');
  }, [onChange]);

  return (
    <div className="code-editor-container">
      <Editor
        height={height}
        language={languageMap[language]}
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          readOnly,
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
};

export default CodeEditor;
