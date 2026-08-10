import React, { useState } from 'react';
import SpendingChart from './SpendingChart';
import FundChart from './FundChart';
import { Calendar } from 'lucide-react';
import { createTransaction } from '../api';

export default function Dashboard({ currentBalance, transactions = [], tagsList = [], refreshData, onNewPurchase }) {
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [timeRange, setTimeRange] = useState('30d');
  // Lifted up from SpendingChart so its Amount/Item Count toggle can live
  // in this card's header row (next to the title) instead of inside the
  // chart's own box, which was eating into the chart's vertical space.
  const [spendingViewMode, setSpendingViewMode] = useState('amount');

  const filteredTransactions = React.useMemo(() => {
    if (timeRange === 'all') return transactions;
    const now = new Date();
    const daysLimit = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 365;
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);
    return transactions.filter(t => new Date(t.purchase_date) >= cutoffDate);
  }, [transactions, timeRange]);

  const calculateNet = (days) => {
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    return transactions.reduce((acc, t) => {
      const tDate = new Date(t.purchase_date);
      const diffDays = (now - tDate) / msPerDay;
      
      if (diffDays <= days && diffDays >= 0) {
        if (t.type === 'adjustment' || t.type === 'deposit' || t.type === 'refund') {
          return acc + t.amount;
        } else {
          return acc - t.amount;
        }
      }
      return acc;
    }, 0);
  };

  const netWeekly = calculateNet(7);
  const netMonthly = calculateNet(30);
  const netYearly = calculateNet(365);

  const formatNet = (val) => {
    if (val >= 0) return `+$${val.toFixed(2)}`;
    return `-$${Math.abs(val).toFixed(2)}`;
  };

  // Percentage change is relative to the balance at the START of the
  // period, which we can derive without any extra data: currentBalance
  // minus the net change over that period IS the balance you had before
  // it happened. If that starting balance was zero or negative, a
  // percentage doesn't mean much — dividing by zero, or (for a negative
  // base) a sign that reads backwards from what actually happened — so
  // those cases fall back to '—' rather than showing a misleading number.
  const calculatePercent = (netChange) => {
    const startBalance = currentBalance - netChange;
    if (startBalance <= 0) return null;
    return (netChange / startBalance) * 100;
  };

  const percentWeekly = calculatePercent(netWeekly);
  const percentMonthly = calculatePercent(netMonthly);
  const percentYearly = calculatePercent(netYearly);

  const formatPercent = (percent) => {
    if (percent === null || percent === undefined || !isFinite(percent)) return '—';
    const sign = percent >= 0 ? '+' : '-';
    return `${sign}${Math.abs(percent).toFixed(1)}%`;
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustAmount) return;
    
    const targetAmount = parseFloat(adjustAmount);
    const delta = targetAmount - currentBalance;

    try {
      await createTransaction({
        title: 'Manual Fund Adjustment',
        amount: delta,
        type: 'adjustment',
        purchase_date: new Date().toISOString().split('T')[0],
      });
      setIsAdjusting(false);
      setAdjustAmount('');
      refreshData();
    } catch (error) {
      console.error("Failed to adjust funds:", error);
      alert(`Couldn't apply that adjustment: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
        <div className="lg:col-span-4 bg-slate-800 rounded-xl p-2 border border-slate-700 flex justify-between items-center w-full">
          <div className="flex items-center gap-2 text-slate-300 font-medium text-sm pl-2">
            <Calendar size={16} className="text-indigo-400" />
            <span className="hidden md:inline">Timeframe:</span>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
            {[
              { id: '7d', label: '7 Days' },
              { id: '30d', label: 'Month' },
              { id: '1y', label: 'Year' },
              { id: 'all', label: 'All Time' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${timeRange === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 flex justify-end">
          <button 
            onClick={onNewPurchase} 
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors shadow-lg w-full sm:w-auto"
          >
            + New Transaction
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
        
        <div className="lg:col-span-4 flex flex-col gap-3">
          
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 relative overflow-hidden flex-1 flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-end mb-1">
                <h2 className="text-slate-400 font-medium text-sm">Available Fund</h2>
                <button 
                  onClick={() => setIsAdjusting(!isAdjusting)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  {isAdjusting ? 'Cancel' : 'Quick Adjust'}
                </button>
              </div>
              <span className="text-4xl font-bold text-white tracking-tight leading-none block mb-1">
                ${currentBalance.toFixed(2)}
              </span>

              {isAdjusting && (
                <form onSubmit={handleAdjust} className="mt-3 flex gap-2">
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="New target balance..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white outline-none focus:border-indigo-500"
                  />
                  <button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded font-medium text-sm transition-colors"
                  >
                    Set
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex-1 flex flex-col justify-center">
            <h3 className="text-sm font-bold mb-2 text-slate-300">Net Change</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/50">
                <span className="text-slate-400">Past 7 Days</span>
                <span className={`font-medium ${netWeekly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatNet(netWeekly)}
                  <span className="text-xs text-slate-500 font-normal ml-1.5">({formatPercent(percentWeekly)})</span>
                </span>
              </div>
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/50">
                <span className="text-slate-400">Past 30 Days</span>
                <span className={`font-medium ${netMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatNet(netMonthly)}
                  <span className="text-xs text-slate-500 font-normal ml-1.5">({formatPercent(percentMonthly)})</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Past 365 Days</span>
                <span className={`font-medium ${netYearly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatNet(netYearly)}
                  <span className="text-xs text-slate-500 font-normal ml-1.5">({formatPercent(percentYearly)})</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-lg font-bold">Spending Analytics</h2>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setSpendingViewMode('amount')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${spendingViewMode === 'amount' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Amount ($)
              </button>
              <button
                onClick={() => setSpendingViewMode('count')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${spendingViewMode === 'count' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                Item Count
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col">
            <SpendingChart transactions={filteredTransactions} tagsList={tagsList} viewMode={spendingViewMode} />
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shrink-0">
        <div className="mb-1.5">
          <h2 className="text-lg font-bold">Fund Trajectory</h2>
        </div>
        <div className="-ml-2 -mt-5">
          <FundChart transactions={transactions} timeRange={timeRange} />
        </div>
      </div>

    </div>
  );
}