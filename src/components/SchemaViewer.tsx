import React, { useState } from 'react';
import { Database, RefreshCw, ChevronDown, ChevronUp, TableProperties } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryStore } from '../store/useQueryStore';
import TableRenderer from './TableRenderer';

export default function SchemaViewer() {
  const { sourceTables, regenerateMockData, isLoadingDb } = useQueryStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');

  // Automatically select the first table as the active tab if not set
  React.useEffect(() => {
    if (sourceTables.length > 0 && !activeTab) {
      setActiveTab(sourceTables[0].schema.name);
    }
  }, [sourceTables, activeTab]);

  if (sourceTables.length === 0) {
    return null;
  }

  const selectedTable = sourceTables.find((t) => t.schema.name === activeTab) || sourceTables[0];

  return (
    <div className="glass-panel border border-brand-border rounded-xl overflow-hidden ">
      {/* Header bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 bg-brand-panel/70 border-b border-brand-border cursor-pointer select-none"
      >
        <div className="flex items-center space-x-2.5">
          <TableProperties className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Source Database Catalog ({sourceTables.length} tables loaded)
          </span>
        </div>

        <div className="flex items-center space-x-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={regenerateMockData}
            disabled={isLoadingDb}
            className="flex items-center space-x-1.5 px-3 py-1 text-[11px] font-bold rounded border border-brand-border bg-brand-bg/50 hover:bg-slate-800 text-brand-cyan hover:border-brand-cyan/40 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingDb ? 'animate-spin' : ''}`} />
            <span>Regenerate Mock Data</span>
          </button>
          
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-400 hover:text-slate-200"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Drawer content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col md:flex-row h-64 divide-y md:divide-y-0 md:divide-x divide-brand-border/40 bg-brand-bg/25">
              {/* Table Tab selector */}
              <div className="w-full md:w-56 overflow-y-auto p-2 bg-brand-bg/40 space-y-1">
                <span className="block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Tables in sandbox
                </span>
                {sourceTables.map((t) => {
                  const name = t.schema.name;
                  const isActive = activeTab === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setActiveTab(name)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left font-mono text-xs transition-all ${
                        isActive
                          ? 'bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan font-semibold'
                          : 'border border-transparent text-slate-400 hover:bg-slate-800/20 hover:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Database className="w-3.5 h-3.5 opacity-80" />
                        <span>{name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-sans">
                        ({t.rows.length} rows)
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Table Schema & rows content */}
              {selectedTable && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Table details bar */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border/30 bg-brand-panel/10">
                    <div className="flex items-center space-x-2 font-mono text-xs text-slate-300">
                      <span className="font-bold text-slate-200">Table:</span>
                      <span className="text-brand-cyan">{selectedTable.schema.name}</span>
                    </div>
                    {/* Columns meta detail list */}
                    <div className="flex flex-wrap gap-2">
                      {selectedTable.schema.columns.map((col) => (
                        <span
                          key={col.name}
                          className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded bg-brand-panel border border-brand-border/40 text-slate-400"
                        >
                          <span className="text-slate-300 font-semibold mr-1">{col.name}</span>
                          <span className="text-slate-500 text-[9px]">{col.type}</span>
                          {col.isPrimaryKey && <span className="ml-1 text-brand-cyan font-sans text-[8px] font-bold">PK</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Rows scrollable container */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <TableRenderer
                      columns={selectedTable.schema.columns.map((c) => c.name)}
                      rows={selectedTable.rows}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
