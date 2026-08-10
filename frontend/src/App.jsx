import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Subscriptions from './components/Subscriptions';
import EntryModal from './components/EntryModal';
import TransactionDetails from './components/TransactionDetails';
import TagsManager from './components/TagsManager';
import { getTransactions, getTags, getSubscriptions } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

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
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const currentBalance = transactions.reduce((acc, curr) => {
    if (curr.type === 'deposit' || curr.type === 'adjustment' || curr.type === 'refund') return acc + curr.amount;
    return acc - curr.amount;
  }, 0);

  if (selectedTx) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Navigation activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedTx(null); }} />
        <main className="max-w-7xl mx-auto p-6">
          <TransactionDetails t={selectedTx} tagsList={tags} onBack={() => setSelectedTx(null)} refreshData={fetchData} transactions={transactions} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

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
    </div>
  );
}