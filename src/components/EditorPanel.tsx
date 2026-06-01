import React, { useEffect, useRef } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import { Play, RotateCcw, Share2, Database, AlertCircle, Loader2 } from 'lucide-react';
import { useQueryStore } from '../store/useQueryStore';

// Self-host Monaco Editor files instead of loading from jsDelivr CDN.
// The files are copied to public/monaco-editor/min/vs/ from node_modules.
loader.config({
  paths: {
    vs: '/monaco-editor/min/vs',
  },
});

export default function EditorPanel() {
  const { 
    query, 
    setQuery, 
    dialect, 
    setDialect, 
    error, 
    runQuery, 
    resetAll, 
    activeStageId,
    sourceTables,
    isTransactionOpen,
    isLoadingDb
  } = useQueryStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Function to run query
  const handleRun = () => {
    if (editorRef.current) {
      const currentCode = editorRef.current.getValue();
      setQuery(currentCode);
      runQuery(currentCode);
    } else {
      runQuery();
    }
  };

  // Find line coordinates for SQL clauses to highlight them in Monaco
  const locateClause = (sql: string, clause: string): { startLine: number; endLine: number } | null => {
    const lines = sql.split('\n');
    let startLine = -1;
    let endLine = -1;

    const lowerClause = clause.toLowerCase();
    
    // Define patterns for start of clauses
    const clausePatterns: Record<string, RegExp> = {
      from: /\bfrom\b/i,
      where: /\bwhere\b/i,
      groupby: /\bgroup\s+by\b/i,
      having: /\bhaving\b/i,
      select: /\bselect\b/i,
      distinct: /\bdistinct\b/i,
      orderby: /\border\s+by\b/i,
      limit: /\blimit\b/i
    };

    // Find the starting line
    for (let i = 0; i < lines.length; i++) {
      if (clausePatterns[lowerClause]?.test(lines[i])) {
        startLine = i + 1;
        break;
      }
    }

    if (startLine === -1) return null;

    // Find the end line (the line before the next SQL clause starts)
    const otherClauses = ['select', 'from', 'where', 'group', 'having', 'order', 'limit', 'union', 'intersect', 'except', 'with'];
    const otherPatterns = otherClauses
      .filter(c => c !== lowerClause && !(lowerClause === 'groupby' && c === 'group') && !(lowerClause === 'orderby' && c === 'order'))
      .map(c => new RegExp(`\\b${c}\\b`, 'i'));

    for (let i = startLine; i < lines.length; i++) {
      const lineText = lines[i];
      const startsNextClause = otherPatterns.some(pat => pat.test(lineText));
      
      if (startsNextClause) {
        endLine = i;
        break;
      }
    }

    if (endLine === -1) {
      endLine = lines.length;
    }

    return { startLine, endLine };
  };

  // Synchronize active stage highlights to the editor
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeStageId) {
      // Clear decorations
      if (editorRef.current && decorationsRef.current.length > 0) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
      return;
    }

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    
    const range = locateClause(query, activeStageId);
    
    if (range) {
      const newDecorations = [
        {
          range: new monaco.Range(range.startLine, 1, range.endLine, 100),
          options: {
            isWholeLine: true,
            className: 'bg-brand-cyan/10 border-l-4 border-brand-cyan active-pulse',
            glyphMarginClassName: 'bg-brand-cyan/80'
          }
        }
      ];

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
      
      // Smoothly scroll the editor to reveal the highlighted block
      editor.revealLineInCenterIfOutsideViewport(range.startLine);
    } else {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [activeStageId, query]);

  // Set up editor markers for SQL error highlighting
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();

    if (error) {
      // Highlight the first line by default or find error markers if parsed
      monaco.editor.setModelMarkers(model, 'sql-errors', [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: model.getLineCount(),
          endColumn: 100,
          message: error,
          severity: monaco.MarkerSeverity.Error
        }
      ]);
    } else {
      monaco.editor.setModelMarkers(model, 'sql-errors', []);
    }
  }, [error]);

  // Monaco initialization and setup autocomplete suggestions
  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Custom SQL Autocomplete Suggestion Provider
    monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' '],
      provideCompletionItems: (model: any, position: any) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const suggestions: any[] = [];

        // 1. Suggest SQL Keywords
        const keywords = [
          'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET',
          'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'ON',
          'AS', 'DISTINCT', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
          'WITH', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
        ];
        keywords.forEach(kw => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range
          });
        });

        // 2. Suggest SQL Functions (including window functions)
        const functions = [
          'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
          'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
          'PARTITION BY', 'OVER', 'DATE_TRUNC', 'EXTRACT'
        ];
        functions.forEach(fn => {
          suggestions.push({
            label: fn,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${fn}($1)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          });
        });

        // 3. Suggest Cached Database Tables
        sourceTables.forEach(t => {
          suggestions.push({
            label: t.schema.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: t.schema.name,
            detail: 'Mock Source Table',
            range
          });

          // 4. Suggest Columns for Tables (e.g. e.salary or salary)
          t.schema.columns.forEach(col => {
            suggestions.push({
              label: `${t.schema.name}.${col.name}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${t.schema.name}.${col.name}`,
              detail: `${col.type} column`,
              range
            });
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: `column from ${t.schema.name}`,
              range
            });
          });
        });

        return { suggestions };
      }
    });
  };

  const handleShare = () => {
    // Basic share feature (copies link with query param base64-encoded)
    const base64Query = btoa(query);
    const shareUrl = `${window.location.origin}?q=${encodeURIComponent(base64Query)}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Query share link copied to clipboard!');
  };

  return (
    <div className="flex flex-col h-full bg-brand-panel/40 border border-brand-border rounded-xl overflow-hidden ">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-panel/75 border-b border-brand-border">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">SQL Workspace</span>
        </div>
        
        {/* Dialect and Action Buttons */}
        <div className="flex items-center space-x-3">
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as any)}
            className="px-2.5 py-1 text-xs font-medium rounded border border-brand-border bg-brand-bg text-slate-300 focus:outline-none focus:border-brand-cyan"
          >
            <option value="sqlite">SQLite (WASM)</option>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="ansi">ANSI SQL</option>
          </select>

          <button
            onClick={resetAll}
            title="Reset Workspace"
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors bg-brand-bg/40 border border-brand-border rounded"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleShare}
            title="Copy Share Link"
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors bg-brand-bg/40 border border-brand-border rounded"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleRun}
            disabled={isLoadingDb}
            className="flex items-center space-x-1.5 px-3 py-1 text-xs font-bold rounded bg-brand-cyan text-brand-bg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoadingDb ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isLoadingDb ? 'Executing...' : 'Run Query'}</span>
          </button>
        </div>
      </div>

      {/* Transaction Active Warning Banner */}
      {isTransactionOpen && (
        <div className="flex items-center space-x-2 px-4 py-2.5 bg-amber-950/20 border-b border-amber-800/30 text-amber-400 font-sans text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 animate-pulse flex-shrink-0" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold">Transaction Active:</span> You have uncommitted database modifications. Run <code className="bg-slate-900 border border-slate-800/80 px-1 py-0.5 rounded font-mono text-[10px]">COMMIT;</code> to save or <code className="bg-slate-900 border border-slate-800/80 px-1 py-0.5 rounded font-mono text-[10px]">ROLLBACK;</code> to abort.
          </div>
        </div>
      )}

      {/* Monaco Code Editor container */}
      <div className="flex-1 min-h-[300px] ">
        <Editor
          height="100%"
          defaultLanguage="sql"
          theme="vs-dark"
          value={query}
          onChange={(val) => setQuery(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            fontFamily: 'Fira Code, monospace',
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineDecorationsWidth: 8,
            folding: false,
            glyphMargin: true,
            scrollBeyondLastLine: false,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'all',
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            }
          }}
        />
      </div>

      {/* Editor Error status bar */}
      {error && (
        <div className="flex items-start space-x-2 px-4 py-2.5 bg-rose-950/20 border-t border-rose-800/40 text-rose-400 font-sans text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 leading-relaxed">
            <span className="font-semibold">Execution Error:</span> {error}
          </div>
        </div>
      )}
    </div>
  );
}
