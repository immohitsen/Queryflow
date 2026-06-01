import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, HelpCircle, Activity, Sparkles, BookOpen, X, Code, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useQueryStore } from '../store/useQueryStore';
import StageCard from './StageCard';
import QueryPlanTree from './QueryPlanTree';

export default function VisualizerPanel() {
  const { stages, explainPlan, error, performanceHints, isLoadingDb } = useQueryStore();
  const [activeTab, setActiveTab] = useState<'stages' | 'plan'>('stages');
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [showHints, setShowHints] = useState(false);

  // Filter hints to show warnings or suggestions
  const warnings = performanceHints.filter(h => h.type !== 'success');

  return (
    <div className="flex h-full relative cyan-glow">
      {/* Main visualizer block */}
      <div className="flex-1 flex flex-col h-full bg-brand-panel/40 border border-brand-border rounded-xl overflow-hidden ">
        
        {/* Visualizer Panel Header Tabs */}
        <div className="flex items-center justify-between px-4 py-2 bg-brand-panel/75 border-b border-brand-border">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('stages')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'stages'
                  ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Logical Execution Steps</span>
            </button>
            
            <button
              onClick={() => setActiveTab('plan')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'plan'
                  ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Explain Query Plan</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* Performance warnings notification badge */}
            {warnings.length > 0 && (
              <button
                onClick={() => setShowHints(!showHints)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 text-xs rounded border transition-all ${
                  showHints 
                    ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' 
                    : 'bg-amber-950/20 text-amber-400 border-amber-900/20 hover:border-amber-500/30'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-semibold">{warnings.length} Tip{warnings.length > 1 ? 's' : ''}</span>
              </button>
            )}

            {/* Cheatsheet Toggle Button */}
            <button
              onClick={() => setShowCheatsheet(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs rounded border border-brand-border bg-brand-bg/50 hover:bg-slate-800 text-slate-300 hover:text-brand-cyan hover:border-brand-cyan/20 transition-all font-sans"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>SQL Cheatsheet</span>
            </button>
          </div>
        </div>

        {/* Display Container */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar space-y-4 relative">
          {/* Visualizer Loading Overlay */}
          {isLoadingDb && (
            <div className="absolute inset-0 bg-brand-bg/40 backdrop-blur-[1px] flex items-center justify-center z-20 transition-all duration-300">
              <div className="flex flex-col items-center space-y-3 bg-brand-panel/85 border border-brand-border/60 p-6 rounded-2xl shadow-[0_0_30px_rgba(0,212,255,0.05)]">
                <Loader2 className="w-6 h-6 text-brand-cyan animate-spin" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300 font-sans">Compiling Stages...</span>
              </div>
            </div>
          )}

          {/* Performance hints accordion */}
          {showHints && warnings.length > 0 && (
            <div className="p-3 bg-amber-950/10 border border-amber-900/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-amber-900/25">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Performance Advisor</span>
                </span>
                <button 
                  onClick={() => setShowHints(false)} 
                  className="text-amber-500 hover:text-amber-300 text-[10px] font-semibold"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-2">
                {warnings.map((hint, i) => (
                  <div key={i} className="text-xs leading-relaxed text-slate-300 space-y-1">
                    <div className="font-bold text-amber-300">{hint.title}</div>
                    <div>{hint.description}</div>
                    {hint.recommendation && (
                      <div className="text-[10px] text-brand-cyan font-mono bg-slate-900/50 p-1.5 rounded border border-brand-border/20">
                        {hint.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-rose-950/5 border border-dashed border-rose-900/30 rounded-xl text-slate-400">
              <Sparkles className="w-8 h-8 mb-2 text-rose-400 opacity-60" />
              <p className="text-sm font-semibold text-rose-400">Query Visualizer Blocked</p>
              <p className="text-xs max-w-sm mt-1.5 leading-relaxed">
                Fix the syntax or database errors in the SQL Workspace panel to restore the step-by-step query execution timeline.
              </p>
            </div>
          ) : activeTab === 'stages' ? (
            stages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-brand-text-muted">
                <HelpCircle className="w-10 h-10 mb-2.5 text-brand-cyan opacity-40" />
                <p className="text-sm font-medium text-slate-300">No Query Executed</p>
                <p className="text-xs mt-1 max-w-xs leading-relaxed">
                  Write a SQL query in the left workspace editor and click "Run Query" to visualize its logical execution.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {stages.map((stage, idx) => (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    stageNumber={idx + 1}
                  />
                ))}
              </div>
            )
          ) : (
            <QueryPlanTree plan={explainPlan} />
          )}
        </div>
      </div>

      {/* Collapsible SQL Cheatsheet Sidebar */}
      <AnimatePresence>
        {showCheatsheet && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 20 }}
            className="absolute right-0 top-0 h-full w-80 bg-brand-panel border-l border-brand-border z-10 flex flex-col shadow-2xl"
          >
            {/* Cheatsheet Header */}
            <div className="flex items-center justify-between p-4 border-b border-brand-border">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-brand-cyan" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">SQL Reference Guide</h3>
              </div>
              <button 
                onClick={() => setShowCheatsheet(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cheatsheet Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 font-sans text-xs scrollbar">
              {/* Order of Operations */}
              <div>
                <span className="block font-bold text-brand-cyan uppercase tracking-wide mb-2 text-[10px]">
                  1. Logical Querying Order
                </span>
                <p className="text-slate-400 mb-2 leading-relaxed text-[11px]">
                  SQL queries are NOT processed in the order written. The physical engine executes clauses in this specific sequence:
                </p>
                <div className="bg-brand-bg/50 border border-brand-border/60 rounded-lg p-2 font-mono text-[10px] space-y-1">
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">1.</span> <span className="text-slate-300">FROM / JOIN</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">2.</span> <span className="text-slate-300">WHERE</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">3.</span> <span className="text-slate-300">GROUP BY</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">4.</span> <span className="text-slate-300">HAVING</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">5.</span> <span className="text-slate-300">SELECT (Project/Aggs)</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">6.</span> <span className="text-slate-300">DISTINCT</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">7.</span> <span className="text-slate-300">ORDER BY</span></div>
                  <div className="flex items-center space-x-2"><span className="text-brand-cyan font-bold w-4">8.</span> <span className="text-slate-300">LIMIT / OFFSET</span></div>
                </div>
              </div>

              {/* Joins */}
              <div>
                <span className="block font-bold text-brand-cyan uppercase tracking-wide mb-2 text-[10px]">
                  2. Table Joins Reference
                </span>
                <div className="space-y-2 leading-relaxed text-[11px] text-slate-400">
                  <p><strong className="text-slate-200 font-semibold font-mono">INNER JOIN:</strong> Keeps only rows where the ON predicate matches in both tables.</p>
                  <p><strong className="text-slate-200 font-semibold font-mono">LEFT JOIN:</strong> Keeps all rows from left table, pads right columns with <code className="text-brand-cyan font-mono text-[9px] bg-slate-900 border border-slate-800 px-1 py-0.5 rounded uppercase">NULL</code> if unmatched.</p>
                  <p><strong className="text-slate-200 font-semibold font-mono">RIGHT JOIN:</strong> Keeps all rows from right table, pads left with nulls.</p>
                  <p><strong className="text-slate-200 font-semibold font-mono">CROSS JOIN:</strong> Generates a full Cartesian product (combinations = rows A × rows B).</p>
                </div>
              </div>

              {/* Window Functions */}
              <div>
                <span className="block font-bold text-brand-cyan uppercase tracking-wide mb-2 text-[10px]">
                  3. Window Functions (OVER)
                </span>
                <p className="text-slate-400 mb-2 leading-relaxed text-[11px]">
                  Evaluates calculations across a set of table rows related to the current row without collapsing them:
                </p>
                <div className="bg-brand-bg/50 border border-brand-border/60 rounded-lg p-2 font-mono text-[10px] space-y-1.5">
                  <div className="text-slate-200 font-semibold">ROW_NUMBER()</div>
                  <div className="text-slate-400 pl-2">Unique sequential index per partition.</div>
                  <div className="text-slate-200 font-semibold">RANK() vs DENSE_RANK()</div>
                  <div className="text-slate-400 pl-2">Rank skips gaps (e.g. 1, 2, 2, 4); Dense does not (e.g. 1, 2, 2, 3).</div>
                  <div className="text-slate-200 font-semibold">LAG(col, n) / LEAD(col, n)</div>
                  <div className="text-slate-400 pl-2">Fetches cells from preceding/succeeding rows.</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
