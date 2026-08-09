import React, { useState } from 'react';
import { ArrowLeft, Edit2, Check, RefreshCcw, ExternalLink, Image as ImageIcon } from 'lucide-react';

export default function TransactionDetails({ t, onBack, refreshData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    notes: t.notes || '',
    url: t.url || ''
  });

  const refunded = t.refunded_amount || 0;
  const isFullyRefunded = refunded >= t.amount;

  const handleSave = async () => {
    await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    setIsEditing(false);
    
    // We need to fetch the updated transaction to immediately show the new notes/url
    refreshData();
    t.notes = formData.notes;
    t.url = formData.url;
  };

  const handleRefund = async () => {
    const maxRefund = t.amount - refunded;
    const input = prompt(`Enter amount to refund (Max: $${maxRefund.toFixed(2)}).\nLeave as is for full remaining refund:`, maxRefund);
    
    if (input === null) return; 
    
    const amountToRefund = parseFloat(input);
    if (isNaN(amountToRefund) || amountToRefund <= 0 || amountToRefund > maxRefund) {
      alert("Invalid refund amount entered.");
      return;
    }

    const newTotalRefund = refunded + amountToRefund;

    await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refunded_amount: newTotalRefund })
    });
    refreshData();
    t.refunded_amount = newTotalRefund;
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-h-[500px]">
      {/* Header */}
      <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 sticky top-0">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} /> Back to List
        </button>
        <div className="flex gap-3">
          <button onClick={() => setIsEditing(!isEditing)} className="flex items-center gap-2 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors">
            <Edit2 size={16} /> {isEditing ? 'Cancel Edit' : 'Edit Details'}
          </button>
          {!isFullyRefunded && (
            <button onClick={handleRefund} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 px-4 py-2 rounded-lg transition-colors">
              <RefreshCcw size={16} /> Process Refund
            </button>
          )}
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Core Data */}
        <div className="space-y-6">
          <div>
            <h1 className={`text-3xl font-bold ${isFullyRefunded ? 'line-through text-slate-500' : 'text-white'}`}>
              {t.title}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-2xl font-semibold ${isFullyRefunded ? 'text-slate-500' : 'text-emerald-400'}`}>
                ${t.amount.toFixed(2)}
              </span>
              {refunded > 0 && <span className="text-sm bg-emerald-900 text-emerald-400 px-3 py-1 rounded-full">Refunded: ${refunded.toFixed(2)}</span>}
            </div>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 space-y-3 text-slate-300">
            <p className="flex justify-between"><span className="text-slate-500">Date</span> <span>{t.purchase_date}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Type</span> <span className="capitalize">{t.type}</span></p>
            {t.is_subscription && (
              <p className="flex justify-between"><span className="text-slate-500">Billing Cycle</span> <span className="capitalize">{t.billing_cycle}</span></p>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">Notes & Links</h3>
            
            {isEditing ? (
              <div className="space-y-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <div>
                  <label className="text-xs text-slate-400">Product URL</label>
                  <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 text-sm mt-1 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 text-sm mt-1 h-24 outline-none focus:border-indigo-500" />
                </div>
                <button onClick={handleSave} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-lg text-sm text-white font-medium transition-colors">
                  <Check size={16}/> Save Changes
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors">
                    <ExternalLink size={16} /> {t.url}
                  </a>
                ) : (
                  <p className="text-slate-500 text-sm italic">No link provided.</p>
                )}
                
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 min-h-[100px]">
                  {t.notes ? (
                    <p className="text-slate-300 whitespace-pre-wrap">{t.notes}</p>
                  ) : (
                    <p className="text-slate-500 text-sm italic">No notes added.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Receipt View */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">Uploaded Receipt</h3>
          <div className="bg-slate-900/80 border border-slate-700 rounded-xl h-[400px] flex items-center justify-center overflow-hidden">
            {t.receipt_file ? (
              <img src={t.receipt_file} alt="Receipt" className="object-contain w-full h-full p-2" />
            ) : (
              <div className="text-center text-slate-500 flex flex-col items-center gap-2">
                <ImageIcon size={48} className="text-slate-700" />
                <p>No receipt uploaded</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}