import React, { useState } from 'react';
import { LayoutDashboard, History, Repeat, Trophy } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Horizontal Top Menu Bar */}
      <nav className="w-full bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="text-yellow-400" />
            <h1 className="text-xl font-bold tracking-wider">FINANCE QUEST</h1>
          </div>
          
          <div className="flex gap-6">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
              <LayoutDashboard size={18} /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
              <History size={18} /> History
            </button>
            <button 
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'subscriptions' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
              <Repeat size={18} /> Subscriptions
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area - Landscape Focused */}
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-12 gap-6">
            {/* Top Left Balance Card */}
            <div className="col-span-12 md:col-span-4 bg-slate-800 p-6 rounded-xl border border-slate-700">
              <h2 className="text-slate-400 text-sm font-semibold uppercase mb-2">Available Balance</h2>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-emerald-400">$2,450.00</span>
                <span className="text-sm text-emerald-500 font-medium">+ $320</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300">Weekly</button>
                <button className="text-xs bg-indigo-600 px-2 py-1 rounded text-white">Monthly</button>
                <button className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300">Yearly</button>
              </div>
            </div>

            {/* Placeholder for Graph */}
            <div className="col-span-12 md:col-span-8 bg-slate-800 p-6 rounded-xl border border-slate-700 flex items-center justify-center min-h-[250px]">
              <p className="text-slate-500">[ Trajectory Graph Will Go Here ]</p>
            </div>
            
            {/* Placeholder for Gamification/Trophies */}
            <div className="col-span-12 bg-slate-800 p-6 rounded-xl border border-slate-700 flex items-center justify-center min-h-[200px]">
              <p className="text-slate-500">[ Trophy Case & Milestones Will Go Here ]</p>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 className="text-xl font-bold mb-4">Purchase History (Pending Filters)</h2>
            <p className="text-slate-500">List of transactions will render here.</p>
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Active Subscriptions</h2>
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                + Add Subscription
              </button>
            </div>
            <p className="text-slate-500">Grayed out past subs and active recurring items will go here.</p>
          </div>
        )}
      </main>
    </div>
  );
}