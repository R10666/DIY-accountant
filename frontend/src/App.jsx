import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Subscriptions from './components/Subscriptions';
import EntryModal from './components/EntryModal';
import TransactionDetails from './components/TransactionDetails';
import TagsManager from './components/TagsManager';
import { getTransactions, getTags, getSubscriptions, exportData, importData } from './api';

// Read once, straight from the same setting api.js itself uses to pick
// between localDB.js and api.server.js — so this badge can never say
// something different from what the app is actually doing.
const STORAGE_MODE = import.meta.env.VITE_STORAGE_MODE === 'server' ? 'server' : 'local';

function StorageModeBadge() {
  const isServer = STORAGE_MODE === 'server';
  return (
    <div
      className="fixed bottom-3 right-3 z-[200] flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-full px-3 py-1 text-[10px] font-medium text-slate-400 shadow-lg backdrop-blur-sm select-none"
      title={isServer ? 'Connected to your local backend server — data lives in finance.db' : 'Data is stored only in this browser (IndexedDB) — export a backup to move it elsewhere'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isServer ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
      {isServer ? 'Local Server' : 'Browser Storage'}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // Guards the auto-open-on-empty check so it only ever evaluates once,
  // on the true initial load — not on every refreshData() call after
  // that (which happens constantly: after creating/editing/deleting
  // anything). Without this, deleting your last remaining item later
  // would pop the guide back open, which isn't "welcome, first-timer",
  // it's just annoying.
  const hasCheckedAutoHelp = useRef(false);

  const fetchData = async () => {
    try {
      const [txData, tagsData, subsData] = await Promise.all([
        getTransactions(),
        getTags(),
        getSubscriptions(),
      ]);

      setTransactions(txData.transactions);
      setTags(tagsData.tags);
      setSubscriptions(subsData.subscriptions);

      if (!hasCheckedAutoHelp.current) {
        hasCheckedAutoHelp.current = true;
        const isFirstEverVisit = txData.transactions.length === 0 && subsData.subscriptions.length === 0;
        if (isFirstEverVisit) setIsHelpOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Export triggers a normal browser file download — fetch the full
  // backup as JSON, wrap it in a Blob, and click a throwaway <a> tag,
  // since that's the standard way to save arbitrary client-side data as
  // a file without a server needing to set download headers.
  const handleExport = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `diy-accountant-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export data:", error);
      alert(`Couldn't export your data: ${error.message}`);
    }
  };

  // Import is a full replace, not a merge — the confirmation is
  // deliberately explicit about that, since restoring a backup is not a
  // reversible action.
  const handleImport = async (file) => {
    if (!file) return;

    const confirmed = window.confirm(
      "Importing will COMPLETELY REPLACE all current data (transactions, subscriptions, tags) with what's in this file. This can't be undone.\n\nMake sure this is really what you want before continuing."
    );
    if (!confirmed) return;

    try {
      const result = await importData(file);
      const c = result.counts;
      alert(`Restored successfully: ${c.transactions} transactions, ${c.subscriptions} subscriptions, ${c.subscription_payments} subscription payments, and ${c.tags} tags.`);
      await fetchData();
    } catch (error) {
      console.error("Failed to import data:", error);
      alert(`Couldn't restore from that file: ${error.message}`);
    }
  };

  const currentBalance = transactions.reduce((acc, curr) => {
    if (curr.type === 'deposit' || curr.type === 'adjustment' || curr.type === 'refund') return acc + curr.amount;
    return acc - curr.amount;
  }, 0);

  if (selectedTx) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Navigation activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedTx(null); }} onExport={handleExport} onImport={handleImport} isHelpOpen={isHelpOpen} onOpenHelp={() => setIsHelpOpen(true)} onCloseHelp={() => setIsHelpOpen(false)} />
        <main className="max-w-7xl mx-auto p-6">
          <TransactionDetails t={selectedTx} tagsList={tags} onBack={() => setSelectedTx(null)} refreshData={fetchData} transactions={transactions} />
        </main>
        <StorageModeBadge />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} onExport={handleExport} onImport={handleImport} isHelpOpen={isHelpOpen} onOpenHelp={() => setIsHelpOpen(true)} onCloseHelp={() => setIsHelpOpen(false)} />

      <main className="max-w-7xl mx-auto p-6">
        {activeTab !== 'dashboard' && (
          <div className="mb-6 flex justify-end">
            <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">
              + New Transaction
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && <Dashboard currentBalance={currentBalance} transactions={transactions} tagsList={tags} refreshData={fetchData} onNewPurchase={() => setIsModalOpen(true)} />}
        {activeTab === 'history' && <History transactions={transactions} tagsList={tags} onViewDetails={setSelectedTx} />}
        {activeTab === 'subscriptions' && <Subscriptions subscriptions={subscriptions} transactions={transactions} onViewDetails={setSelectedTx} refreshData={fetchData} />}
        {activeTab === 'tags' && <TagsManager tags={tags} refreshTags={fetchData} />}
      </main>

      {isModalOpen && <EntryModal availableTags={tags} closeModal={() => setIsModalOpen(false)} refreshData={fetchData} />}
      <StorageModeBadge />
    </div>
  );
}