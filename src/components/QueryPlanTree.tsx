import React from 'react';
import { QueryPlanNode } from '../engine/sqlEngine';
import { Network, Activity, ArrowDownRight } from 'lucide-react';

interface QueryPlanTreeProps {
  plan: QueryPlanNode | null;
}

export default function QueryPlanTree({ plan }: QueryPlanTreeProps) {
  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed border-brand-border rounded-xl bg-brand-panel/10 text-brand-text-muted">
        <Activity className="w-8 h-8 mb-2 opacity-40 text-brand-cyan" />
        <p className="text-sm font-medium">No Explain Plan Available</p>
        <p className="text-xs mt-1">Run a valid SELECT query to generate SQLite's execution tree plan.</p>
      </div>
    );
  }

  // Recursive component to render tree nodes
  const TreeNode = ({ node, isLast = false, depth = 0 }: { node: QueryPlanNode; isLast?: boolean; depth?: number }) => {
    // Categorize operation for color coding
    const detail = node.detail.toUpperCase();
    let badgeColor = 'bg-blue-950/40 text-blue-400 border-blue-900/40';
    let label = 'OPER';

    if (detail.includes('SCAN')) {
      badgeColor = 'bg-rose-950/40 text-rose-400 border-rose-900/40';
      label = 'SCAN';
    } else if (detail.includes('SEARCH')) {
      badgeColor = 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40';
      label = 'SEARCH';
    } else if (detail.includes('INDEX')) {
      badgeColor = 'bg-brand-cyan-glow/40 text-brand-cyan border-brand-cyan/20';
      label = 'INDEX';
    } else if (detail.includes('SORT') || detail.includes('ORDER BY') || detail.includes('B-TREE')) {
      badgeColor = 'bg-amber-950/40 text-amber-400 border-amber-900/40';
      label = 'SORT';
    }

    return (
      <div className="flex flex-col relative pl-6 mt-3">
        {/* Connection line indicator */}
        {depth > 0 && (
          <div 
            className="absolute left-0 top-0 border-l border-b border-brand-border/60"
            style={{
              width: '18px',
              height: '24px',
              top: '-12px',
            }}
          />
        )}

        {/* Node detail block */}
        <div className="flex items-center space-x-3 p-3 bg-brand-panel/30 border border-brand-border/60 hover:border-brand-cyan/25 rounded-lg transition-colors max-w-2xl">
          <div className="flex-shrink-0">
            <span className={`px-2 py-0.5 text-[9px] font-bold font-sans uppercase rounded border ${badgeColor}`}>
              {label}
            </span>
          </div>
          <div className="flex-1 font-mono text-xs text-slate-300 leading-relaxed">
            {node.detail}
          </div>
          <span className="text-[10px] text-slate-600 font-sans font-medium">
            ID: {node.id}
          </span>
        </div>

        {/* Child nodes recursive render container */}
        {node.children && node.children.length > 0 && (
          <div className="flex flex-col border-l border-brand-border/30 ml-2">
            {node.children.map((child, idx) => (
              <TreeNode
                key={child.id}
                node={child}
                isLast={idx === node.children.length - 1}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full p-4 bg-brand-panel/10 border border-brand-border rounded-xl overflow-hidden">
      <div className="flex items-center space-x-2 pb-3 border-b border-brand-border/40 mb-2">
        <Network className="w-4 h-4 text-brand-cyan" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Query Execution Plan Diagram
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar">
        {plan.children.map((child, idx) => (
          <TreeNode
            key={child.id}
            node={child}
            isLast={idx === plan.children.length - 1}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
