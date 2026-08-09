import React from 'react';

export default function Subscriptions({ transactions, onViewDetails }) {
  const subs = transactions.filter(t => t.is_subscription);
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h2 className="text-xl font-bold">Active Subscriptions</h2>
      </div>
      <div className="divide-y divide-slate-700/50">
        {subs.length === 0 ? (
          <p className="p-6 text-slate-500">No active subscriptions.</p>
        ) : (
          subs.map(t => {
            const isFullyRefunded = (t.refunded_amount || 0) >= t.amount;
            return (
              <div key={t.id} className="flex justify-between items-center py-4 px-6 hover:bg-slate-700/30 transition-colors">
                <div>
                  <p className={`font-semibold ${isFullyRefunded ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.title}</p>
                  <p className="text-xs text-slate-400 capitalize">Billed: {t.billing_cycle}</p>
                </div>
                <div className="flex items-center gap-6">
                  <span className={`font-bold ${isFullyRefunded ? 'text-slate-500' : 'text-slate-200'}`}>${t.amount.toFixed(2)} <span className="text-xs font-normal text-slate-400">/ cycle</span></span>
                  <button onClick={() => onViewDetails(t)} className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                    Manage
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}