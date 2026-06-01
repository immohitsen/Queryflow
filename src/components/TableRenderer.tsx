import React from 'react';

interface TableRendererProps {
  columns: string[];
  rows: Record<string, any>[];
  rowStates?: Record<string, 'kept' | 'added' | 'removed' | 'modified'>;
  highlightedColumns?: string[];
}

export default function TableRenderer({
  columns,
  rows,
  rowStates = {},
  highlightedColumns = []
}: TableRendererProps) {
  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-brand-border rounded-lg bg-brand-bg/40 text-brand-text-muted">
        <p className="text-sm font-medium">0 columns / Empty Result Set</p>
        <p className="text-xs mt-1">No columns were returned by this execution step.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-brand-border rounded-lg bg-brand-bg/40 text-brand-text-muted">
        <p className="text-sm font-medium">0 rows returned</p>
        <p className="text-xs mt-1">The query executed successfully but produced an empty result set.</p>
      </div>
    );
  }

  // Filter out internal tracking variables starting with double underscore
  const displayCols = columns.filter((col) => !col.startsWith('__'));

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-brand-border bg-brand-panel/30">
      <table className="w-full border-collapse text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-brand-border bg-brand-bg/80">
            {displayCols.map((col) => {
              const isHighlighted = highlightedColumns.includes(col);
              return (
                <th
                  key={col}
                  className={`px-4 py-2.5 font-semibold tracking-wider text-slate-300 uppercase ${
                    isHighlighted ? 'border-b-2 border-brand-cyan bg-brand-cyan-glow/10' : ''
                  }`}
                >
                  {col}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border/40">
          {rows.map((row, rowIndex) => {
            const rowId = row.__row_id || rowIndex.toString();
            const state = rowStates[rowId] || 'kept';

            // Determine row background color and decorations based on execution state
            let rowClass = 'hover:bg-slate-800/20 transition-colors';
            if (state === 'added') {
              rowClass = 'bg-emerald-950/20 hover:bg-emerald-900/10 text-emerald-300 border-l-4 border-emerald-500';
            } else if (state === 'removed') {
              rowClass = 'bg-rose-950/20 hover:bg-rose-900/10 text-slate-500 line-through opacity-50 border-l-4 border-rose-500';
            } else if (state === 'modified') {
              rowClass = 'bg-amber-950/20 hover:bg-amber-900/10 text-amber-300 border-l-4 border-amber-500';
            }

            return (
              <tr key={rowId} className={rowClass}>
                {displayCols.map((col) => {
                  const val = row[col];
                  const isHighlighted = highlightedColumns.includes(col);

                  return (
                    <td
                      key={col}
                      className={`px-4 py-2 border-r border-brand-border/10 last:border-r-0 ${
                        isHighlighted ? 'bg-brand-cyan-glow/5 font-medium text-brand-cyan' : ''
                      }`}
                    >
                      {val === null || val === undefined ? (
                        <span className="inline-block text-[10px] font-sans font-extrabold italic tracking-wider text-slate-600 bg-slate-900 border border-slate-800/80 px-1 py-0.5 rounded uppercase select-none">
                          null
                        </span>
                      ) : typeof val === 'boolean' ? (
                        <span className={`font-semibold ${val ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {val ? 'TRUE' : 'FALSE'}
                        </span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
