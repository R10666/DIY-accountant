import React, { useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, ArrowRight, Calendar, StopCircle, PlayCircle } from 'lucide-react';

export default function Subscriptions({ transactions, onViewDetails, refreshData }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStop = async (sub) => {
    if (!window.confirm(`Are you sure you want to stop "${sub.title}"?`)) return;
    
    setIsProcessing(true);
    try {
      const relatedTxs = transactions.filter(t => t.is_subscription && t.title === sub.title);
      for (const t of relatedTxs) {
        await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billing_cycle: 'cancelled' })
        });
      }
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to stop subscription:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestart = async (sub) => {
    const cycle = prompt(`Enter billing cycle to restart "${sub.title}" (weekly, monthly, yearly, or custom days):`, "monthly");
    if (!cycle) return;
    
    setIsProcessing(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // We create a fresh entry for today. The old ones stay cancelled, so they don't back-fill, 
      // but this new one becomes the active anchor for future Auto-Syncs!
      await fetch('http://127.0.0.1:8000/api/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sub.title,
          amount: sub.amount,
          type: sub.type,
          is_subscription: true,
          billing_cycle: cycle,
          url: sub.url || "",
          notes: sub.notes || "",
          tags: sub.tags || "[]",
          purchase_date: todayStr,
          receipt_file: sub.receipt_file || ""
        })
      });
      
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to restart subscription:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const allSubscriptions = useMemo(() => {
    const latestSubByKey = {};
    const lifetimeTotals = {};

    transactions.filter(t => t.is_subscription).forEach(t => {
      // Group solely by title so active and cancelled versions merge into one timeline
      const key = t.title;
      
      const netAmount = t.type === 'purchase' ? (t.amount - (t.refunded_amount || 0)) : t.amount;
      lifetimeTotals[key] = (lifetimeTotals[key] || 0) + netAmount;

      if (!latestSubByKey[key] || new Date(t.purchase_date) > new Date(latestSubByKey[key].purchase_date)) {
        latestSubByKey[key] = { ...t }; 
      }
    });

    return Object.values(latestSubByKey).map(sub => {
      return {
        ...sub,
        lifetimeTotal: lifetimeTotals[sub.title] || 0
      };
    });
  }, [transactions]);

  const expenses = allSubscriptions.filter(s => s.type !== 'deposit');
  const deposits = allSubscriptions.filter(s => s.type === 'deposit');

  const getMonthlyImpact = (sub) => {
    if (sub.billing_cycle === 'cancelled') return 0; // Inactive costs nothing
    let amount = sub.amount;
    if (sub.billing_cycle === 'weekly') return amount * (52 / 12);
    if (sub.billing_cycle === 'yearly') return amount / 12;
    if (sub.billing_cycle?.includes('days')) {
      const days = parseInt(sub.billing_cycle);
      if (days > 0) return amount * (30 / days);
    }
    return amount; 
  };

  const getNextDate = (lastDateStr, cycle) => {
    if (cycle === 'cancelled') return '—';
    const date = new Date(lastDateStr + 'T12:00:00'); 
    
    if (cycle === 'weekly') date.setDate(date.getDate() + 7);
    else if (cycle === 'monthly') date.setMonth(date.getMonth() + 1);
    else if (cycle === 'yearly') date.setFullYear(date.getFullYear() + 1);
    else if (cycle?.includes('days')) {
      const days = parseInt(cycle);
      if (days > 0) date.setDate(date.getDate() + days);
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Only calculate totals using ACTIVE subscriptions
  const monthlyExpenseTotal = expenses.reduce((acc, sub) => acc + getMonthlyImpact(sub), 0);
  const monthlyDepositTotal = deposits.reduce((acc, sub) => acc + getMonthlyImpact(sub), 0);
  const netMonthly = monthlyDepositTotal - monthlyExpenseTotal;
  const activeExpenseCount = expenses.filter(e => e.billing_cycle !== 'cancelled').length;
  const activeDepositCount = deposits.filter(d => d.billing_cycle !== 'cancelled').length;

  const renderList = (subs, isIncome) => {
    if (subs.length === 0) {
      return (
        <div className="p-8 text-center text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
          No recurring {isIncome ? 'deposits' : 'expenses'} found.
        </div>
      );
    }

    // Sort: Active items top, Inactive items bottom. Then by highest price.
    const sortedSubs = [...subs].sort((a, b) => {
      const aActive = a.billing_cycle !== 'cancelled';
      const bActive = b.billing_cycle !== 'cancelled';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return b.amount - a.amount;
    });

    return (
      <div className="flex flex-col gap-4">
        {sortedSubs.map(t => {
          const isActive = t.billing_cycle !== 'cancelled';
          const monthlyAmount = getMonthlyImpact(t);
          const nextDate = getNextDate(t.purchase_date, t.billing_cycle);
          
          return (
            <div key={t.id} className={`rounded-xl p-5 border transition-all ${isActive ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-lg' : 'bg-slate-800/40 border-slate-700/50 opacity-80'}`}>
              
              <div className="flex justify-between items-start mb-5">
                <div className="pr-4">
                  <div className="flex items-center gap-3">
                    <h4 className={`text-lg font-bold ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>{t.title}</h4>
                    {/* Active/Inactive Badge */}
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider ${isActive ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {isActive && (
                    <span className="inline-block mt-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                      {t.billing_cycle}
                    </span>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className={`text-2xl font-bold ${isActive ? (isIncome ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                    {isIncome ? '+' : '-'}${t.amount.toFixed(2)}
                  </div>
                  {isActive && t.billing_cycle !== 'monthly' && (
                    <div className="text-xs text-slate-500 mt-1">
                      (~${monthlyAmount.toFixed(2)}/mo)
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between pt-4 border-t border-slate-700/50">
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  
                  <div>
                    <p className="text-[11px] text-slate-500 mb-1 uppercase font-semibold tracking-wider">Next Payment</p>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                      <Calendar size={14} className={isActive ? (isIncome ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-600'} />
                      {nextDate}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-[11px] text-slate-500 mb-1 uppercase font-semibold tracking-wider">
                      Lifetime {isIncome ? 'Deposited' : 'Spent'}
                    </p>
                    <p className={`text-sm font-medium ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
                      ${t.lifetimeTotal.toFixed(2)}
                    </p>
                  </div>

                </div>

                <div className="flex gap-2 shrink-0 ml-4">
                  {isActive ? (
                    <button 
                      onClick={() => handleStop(t)}
                      disabled={isProcessing}
                      className="bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 p-2.5 rounded-lg transition-colors border border-slate-700 hover:border-rose-800 shadow-sm disabled:opacity-50 flex items-center justify-center"
                      title="Stop Subscription"
                    >
                      <StopCircle size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleRestart(t)}
                      disabled={isProcessing}
                      className="bg-slate-800 hover:bg-emerald-900/40 text-slate-400 hover:text-emerald-400 p-2.5 rounded-lg transition-colors border border-slate-700 hover:border-emerald-800 shadow-sm disabled:opacity-50 flex items-center justify-center"
                      title="Restart Subscription"
                    >
                      <PlayCircle size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => onViewDetails(t)} 
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-2.5 rounded-lg transition-colors border border-slate-600 shadow-sm flex items-center justify-center"
                    title="View Details"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-rose-400 mb-2">
            <TrendingDown size={18} />
            <h3 className="font-medium text-sm">Monthly Expenses</h3>
          </div>
          <span className="text-3xl font-bold text-white">
            ${monthlyExpenseTotal.toFixed(2)}
          </span>
          <p className="text-xs text-slate-400 mt-2">{activeExpenseCount} active subscriptions</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <TrendingUp size={18} />
            <h3 className="font-medium text-sm">Monthly Income</h3>
          </div>
          <span className="text-3xl font-bold text-white">
            ${monthlyDepositTotal.toFixed(2)}
          </span>
          <p className="text-xs text-slate-400 mt-2">{activeDepositCount} recurring deposits</p>
        </div>

        <div className={`rounded-xl p-6 border flex flex-col justify-center relative overflow-hidden ${netMonthly >= 0 ? 'bg-emerald-900/20 border-emerald-900/50' : 'bg-rose-900/20 border-rose-900/50'}`}>
          <div className="relative z-10">
            <div className={`flex items-center gap-2 mb-2 ${netMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <RefreshCw size={18} />
              <h3 className="font-medium text-sm">Net Monthly Cashflow</h3>
            </div>
            <span className="text-3xl font-bold text-white">
              {netMonthly >= 0 ? '+' : '-'}${Math.abs(netMonthly).toFixed(2)}
            </span>
            <p className="text-xs text-slate-400 mt-2">Guaranteed recurring impact</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-700 bg-slate-800">
            <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp size={20} /> Recurring Income
            </h2>
          </div>
          <div className="p-5 bg-slate-900/40">
            {renderList(deposits, true)}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-700 bg-slate-800">
            <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <TrendingDown size={20} /> Recurring Expenses
            </h2>
          </div>
          <div className="p-5 bg-slate-900/40">
            {renderList(expenses, false)}
          </div>
        </div>
      </div>
    </div>
  );
}