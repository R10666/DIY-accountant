import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Subscriptions from './components/Subscriptions';
import EntryModal from './components/EntryModal';
import TransactionDetails from './components/TransactionDetails';
import TagsManager from './components/TagsManager';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [tags, setTags] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  const syncSubscriptions = async (transactionsList) => {
    const todayStr = new Date().toISOString().split('T')[0];

    const latestSubByTitle = {};
    
    // Group strictly by title so we know if the latest status is cancelled
    transactionsList.filter(t => t.is_subscription).forEach(t => {
      const key = t.title; 
      
      if (!latestSubByTitle[key] || t.purchase_date > latestSubByTitle[key].purchase_date) {
        latestSubByTitle[key] = t;
      }
    });

    const newEntries = [];

    for (const sub of Object.values(latestSubByTitle)) {
      // If it is cancelled, do not generate any missing past payments
      if (sub.billing_cycle === 'cancelled') continue;

      let cycleCount = 1;
      
      while (true) {
        let nextDate = new Date(sub.purchase_date + 'T12:00:00');
        
        if (sub.billing_cycle === 'weekly') {
          nextDate.setDate(nextDate.getDate() + (7 * cycleCount));
        } else if (sub.billing_cycle === 'monthly') {
          nextDate.setMonth(nextDate.getMonth() + cycleCount);
        } else if (sub.billing_cycle === 'yearly') {
          nextDate.setFullYear(nextDate.getFullYear() + cycleCount);
        } else if (sub.billing_cycle?.includes('days')) {
          const days = parseInt(sub.billing_cycle);
          if (days > 0) nextDate.setDate(nextDate.getDate() + (days * cycleCount));
          else break;
        } else {
          break; 
        }

        const nextStr = nextDate.toISOString().split('T')[0];
        
        if (nextStr > todayStr) break;

        newEntries.push({
          title: sub.title,
          amount: sub.amount,
          type: sub.type,
          is_subscription: true,
          billing_cycle: sub.billing_cycle,
          url: sub.url || "",
          notes: sub.notes || "",
          tags: sub.tags || "[]",
          purchase_date: nextStr,
          receipt_file: sub.receipt_file || ""
        });
        
        cycleCount++;
      }
    }
    
    if (newEntries.length > 0) {
      for (const entry of newEntries) {
        await fetch('http://127.0.0.1:8000/api/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      }
      return true; 
    }
    return false;
  };

  const fetchData = async () => {
    try {
      const [txRes, tagsRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/transactions'),
        fetch('http://127.0.0.1:8000/api/tags')
      ]);
      let txData = await txRes.json();
      const tagsData = await tagsRes.json();
      
      const hasNewData = await syncSubscriptions(txData.transactions);
      
      if (hasNewData) {
        const freshTxRes = await fetch('http://127.0.0.1:8000/api/transactions');
        txData = await freshTxRes.json();
      }
      
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
        {activeTab === 'subscriptions' && <Subscriptions transactions={transactions} onViewDetails={setSelectedTx} refreshData={fetchData} />}
        {activeTab === 'tags' && <TagsManager tags={tags} refreshTags={fetchData} />}
      </main>

      {isModalOpen && <EntryModal availableTags={tags} closeModal={() => setIsModalOpen(false)} refreshData={fetchData} />}
    </div>
  );
}