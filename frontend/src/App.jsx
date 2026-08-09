import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Subscriptions from './components/Subscriptions';
import EntryModal from './components/EntryModal';
import TransactionDetails from './components/TransactionDetails';
import TagsManager from './components/TagsManager'; // Import the new component

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [tags, setTags] = useState([]); // NEW: State for tags
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  const fetchData = async () => {
    try {
      // Fetch both transactions AND tags simultaneously
      const [txRes, tagsRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/transactions'),
        fetch('http://127.0.0.1:8000/api/tags')
      ]);
      const txData = await txRes.json();
      const tagsData = await tagsRes.json();
      
      setTransactions(txData.transactions);
      setTags(tagsData.tags);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const currentBalance = transactions.reduce((acc, curr) => {
    const refunded = curr.refunded_amount || 0;
    if (curr.type === 'deposit' || curr.type === 'adjustment') return acc + curr.amount;
    return acc - (curr.amount - refunded);
  }, 0);

  if (selectedTx) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Navigation activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedTx(null); }} />
        <main className="max-w-7xl mx-auto p-6">
          <TransactionDetails t={selectedTx} tagsList={tags} onBack={() => setSelectedTx(null)} refreshData={fetchData} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex justify-end">
          <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">
            + New Purchase
          </button>
        </div>

        {activeTab === 'dashboard' && <Dashboard currentBalance={currentBalance} refreshData={fetchData} />}
        {activeTab === 'history' && <History transactions={transactions} tagsList={tags} onViewDetails={setSelectedTx} />}
        {activeTab === 'subscriptions' && <Subscriptions transactions={transactions} onViewDetails={setSelectedTx} />}
        {/* Render the new Tags page */}
        {activeTab === 'tags' && <TagsManager tags={tags} refreshTags={fetchData} />}
      </main>

      {isModalOpen && <EntryModal availableTags={tags} closeModal={() => setIsModalOpen(false)} refreshData={fetchData} />}
    </div>
  );
}