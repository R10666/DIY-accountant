import React from 'react';

export default function Dashboard({ currentBalance, refreshData }) {
  const handleQuickAdjust = async () => {
    const amountStr = prompt("Enter the amount to add to your balance (use negative for deduction):");
    if (!amountStr || isNaN(amountStr)) return;
    
    await fetch('http://127.0.0.1:8000/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Manual Adjustment',
        amount: parseFloat(amountStr),
        type: 'adjustment',
        is_subscription: false,
        purchase_date: new Date().toISOString().split('T')[0]
      })
    });
    refreshData();
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-4 bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h2 className="text-slate-400 text-sm font-semibold uppercase mb-2">Available Fund</h2>
        <div className="flex items-baseline gap-3">
          <span className={`text-4xl font-bold ${currentBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${currentBalance.toFixed(2)}
          </span>
          <span className="text-sm text-slate-400 font-medium">Net Change: --</span>
        </div>
        
        <div className="mt-4 flex gap-2">
          <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-slate-300">Weekly</button>
          <button className="text-xs bg-indigo-600 px-3 py-1.5 rounded text-white">Monthly</button>
          <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-slate-300">Yearly</button>
        </div>

        <button 
          onClick={handleQuickAdjust}
          className="mt-6 w-full border border-slate-600 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm transition-colors">
          Quick Adjust Fund
        </button>
      </div>

      <div className="col-span-12 md:col-span-8 bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col items-center justify-center min-h-[250px]">
        <p className="text-slate-500">[ Trajectory Graph Will Go Here ]</p>
      </div>
    </div>
  );
}