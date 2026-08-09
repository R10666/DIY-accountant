import React from 'react';

export default function History({ transactions, onViewDetails }) {
  const purchases = transactions.filter(t => !t.is_subscription && t.type !== 'adjustment');
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h2 className="text-xl font-bold">Purchase History (Filters incoming)</h2>
      </div>
      <div className="divide-y divide-slate-700/50">
        {purchases.length === 0 ? (
          <p className="p-6 text-slate-500">No purchases found.</p>
        ) : (
          purchases.map(t => {
            const isFullyRefunded = (t.refunded_amount || 0) >= t.amount;
            return (
              <div key={t.id} className="flex justify-between items-center py-4 px-6 hover:bg-slate-700/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${isFullyRefunded ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.title}</p>
                    {t.refunded_amount > 0 && <span className="text-xs bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded">Refunded</span>}
                  </div>
                  <p className="text-xs text-slate-400">{t.purchase_date}</p>
                </div>
                <div className="flex items-center gap-6">
                  <span className={`font-bold ${isFullyRefunded ? 'text-slate-500' : 'text-slate-200'}`}>${t.amount.toFixed(2)}</span>
                  <button onClick={() => onViewDetails(t)} className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                    View Details
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