import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Subscriptions from './components/Subscriptions';
import EntryModal from './components/EntryModal';
import TransactionDetails from './components/TransactionDetails';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null); // Tracks the currently viewed item

  const fetchTransactions = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/transactions');
      const data = await response.json();
      setTransactions(data.transactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const currentBalance = transactions.reduce((acc, curr) => {
    const refunded = curr.refunded_amount || 0;
    if (curr.type === 'deposit' || curr.type === 'adjustment') return acc + curr.amount;
    return acc - (curr.amount - refunded);
  }, 0);

  // If a transaction is selected, hide the global "New Purchase" button and show Details
  if (selectedTx) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Navigation activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedTx(null); }} />
        <main className="max-w-7xl mx-auto p-6">
          <TransactionDetails t={selectedTx} onBack={() => setSelectedTx(null)} refreshData={fetchTransactions} />
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

        {activeTab === 'dashboard' && <Dashboard currentBalance={currentBalance} refreshData={fetchTransactions} />}
        {activeTab === 'history' && <History transactions={transactions} onViewDetails={setSelectedTx} />}
        {activeTab === 'subscriptions' && <Subscriptions transactions={transactions} onViewDetails={setSelectedTx} />}
      </main>

      {isModalOpen && <EntryModal closeModal={() => setIsModalOpen(false)} refreshData={fetchTransactions} />}
    </div>
  );
}