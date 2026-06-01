"use client";

import React, { useEffect } from 'react';
import { Database, Layers, Loader2, Sparkles } from 'lucide-react';
import { useQueryStore } from '../store/useQueryStore';
import EditorPanel from '../components/EditorPanel';
import VisualizerPanel from '../components/VisualizerPanel';
import SchemaViewer from '../components/SchemaViewer';

export default function Home() {
  const { initializeDb, isDbInitialized, isLoadingDb, error } = useQueryStore();

  // Initialize the database on first load
  useEffect(() => {
    initializeDb();
  }, [initializeDb]);

  // Read URL query parameter for shared queries
  const setQuery = useQueryStore((state) => state.setQuery);
  const runQuery = useQueryStore((state) => state.runQuery);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryParam = params.get('q');
      if (queryParam) {
        try {
          const decoded = atob(decodeURIComponent(queryParam));
          if (decoded) {
            setQuery(decoded);
            runQuery(decoded);
          }
        } catch (e) {
          console.error('Error decoding query from URL:', e);
        }
      }
    }
  }, [setQuery, runQuery]);

  // Loading Screen for Database Initialization
  if (!isDbInitialized && isLoadingDb) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-brand-bg text-slate-300 px-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <Loader2 className="w-10 h-10 text-brand-cyan animate-spin mb-4" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Initializing Database Engine</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Compiling SQLite WebAssembly modules and seeding mock table structures in your browser context. This will take a moment...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen lg:min-h-0 bg-brand-bg text-slate-200 flex flex-col antialiased lg:overflow-hidden">
      
      {/* Top Application Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-brand-border/60 bg-brand-panel/40 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-cyan/15 border border-brand-cyan/20 active-pulse">
            <Layers className="w-4 h-4 text-brand-cyan" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="text-sm font-black tracking-wider uppercase text-slate-100">QueryFlow</h1>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/20">BETA</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans mt-0.5">Logical SQL Order of Operations Visualizer</p>
          </div>
        </div>

        {/* Engine Status indicator */}
        <div className="flex items-center space-x-2 bg-brand-panel/50 px-3 py-1.5 rounded-lg border border-brand-border/50 text-[10px] font-mono font-medium text-slate-400">
          <div className="w-2 h-2 rounded-full bg-emerald-400 active-pulse" />
          <span>SQLite WASM sandbox active</span>
        </div>
      </header>

      {/* Main Workspace Panels */}
      <main className="flex-1 flex flex-col p-4 lg:p-6 space-y-6 overflow-y-auto lg:overflow-hidden lg:h-[calc(100vh-50px)]">
        {/* Top Split workspace (Responsive: stacks on mobile, side-by-side on desktop) */}
        <div className="h-auto flex flex-col space-y-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:flex-1 lg:min-h-0 lg:space-y-0 lg:h-0">
          {/* Left panel: Monaco IDE */}
          <div className="w-full lg:col-span-5 h-[380px] lg:h-full overflow-hidden">
            <EditorPanel />
          </div>

          {/* Right panel: Visualizer timeline */}
          <div className="w-full lg:col-span-7 h-[480px] lg:h-full overflow-hidden">
            <VisualizerPanel />
          </div>
        </div>

        {/* Bottom panel: SchemaViewer catalog */}
        <div className="flex-shrink-0 pb-6 lg:pb-0">
          <SchemaViewer />
        </div>
      </main>
    </div>
  );
}
