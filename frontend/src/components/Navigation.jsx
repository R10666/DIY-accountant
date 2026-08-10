import React, { useRef } from 'react';
import { LayoutDashboard, History, Repeat, Trophy, Tag, Download, Upload } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, onExport, onImport }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onImport) onImport(file);
    e.target.value = ''; // reset so picking the exact same file again still fires onChange
  };

  return (
    <nav className="w-full bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="text-slate-600" />
          <h1 className="text-xl font-bold tracking-wider">FINANCE QUEST</h1>
        </div>
        
        <div className="flex items-center gap-2">
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
            {/* NEW TAGS BUTTON */}
            <button onClick={() => setActiveTab('tags')} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'tags' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}>
              <Tag size={18} /> Tags
            </button>
          </div>

          {/* Backup/Restore: a global action, not scoped to any tab's
              filtered state, so it lives here rather than on a page. */}
          <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-700">
            <button
              onClick={onExport}
              title="Export / Backup All Data"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import / Restore From Backup"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <Upload size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}