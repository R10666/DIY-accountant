import React from 'react';
import { LayoutDashboard, History, Repeat, Trophy } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab }) {
  return (
    <nav className="w-full bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="text-slate-600" />
          <h1 className="text-xl font-bold tracking-wider">FINANCE QUEST</h1>
        </div>
        
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
            <History size={18} /> History
          </button>
          <button onClick={() => setActiveTab('subscriptions')} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'subscriptions' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
            <Repeat size={18} /> Subscriptions
          </button>
        </div>
      </div>
    </nav>
  );
}