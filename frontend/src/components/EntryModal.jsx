import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function EntryModal({ closeModal, refreshData }) {
  const [file, setFile] = useState(null); // New state for actual file
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    is_subscription: false,
    billing_cycle: 'monthly',
    custom_days: '',
    url: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let finalBillingCycle = null;
    if (formData.is_subscription) {
      finalBillingCycle = formData.billing_cycle === 'custom' ? `${formData.custom_days} days` : formData.billing_cycle;
    }

    let receiptUrl = null;

    // ACTUAL FILE UPLOAD LOGIC
    if (file) {
      const uploadData = new FormData();
      uploadData.append("file", file);
      
      try {
        const uploadRes = await fetch('http://127.0.0.1:8000/api/upload', {
          method: 'POST',
          body: uploadData
        });
        const uploadJson = await uploadRes.json();
        receiptUrl = uploadJson.url;
      } catch (err) {
        console.error("Failed to upload file:", err);
      }
    }

    try {
      await fetch('http://127.0.0.1:8000/api/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          amount: parseFloat(formData.amount),
          type: 'purchase',
          is_subscription: formData.is_subscription,
          billing_cycle: finalBillingCycle,
          url: formData.url,
          purchase_date: formData.purchase_date,
          notes: formData.notes,
          receipt_file: receiptUrl // Save the real URL from the backend
        })
      });
      refreshData();
      closeModal();
    } catch (error) {
      console.error("Failed to save transaction:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] overflow-y-auto">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md my-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Add Purchase</h3>
          <button onClick={closeModal} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-400 mb-1">Name *</label>
              <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder="e.g. Spotify" />
            </div>
            <div className="w-1/3">
              <label className="block text-sm font-medium text-slate-400 mb-1">Price *</label>
              <input type="number" step="0.01" required value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Purchase Date *</label>
            <input type="date" required value={formData.purchase_date} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-slate-900 p-3 rounded-lg border border-slate-700">
            <input type="checkbox" checked={formData.is_subscription} onChange={(e) => setFormData({...formData, is_subscription: e.target.checked})} className="w-4 h-4 accent-indigo-500" />
            <span className="text-sm font-medium text-slate-200">This is a recurring subscription</span>
          </label>

          {formData.is_subscription && (
            <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600 space-y-3">
              <label className="block text-sm font-medium text-slate-300">Billing Cycle</label>
              <select value={formData.billing_cycle} onChange={(e) => setFormData({...formData, billing_cycle: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none">
                <option value="weekly">Every Week</option>
                <option value="monthly">Every Month</option>
                <option value="yearly">Every Year</option>
                <option value="custom">Custom (Days)</option>
              </select>
              {formData.billing_cycle === 'custom' && (
                <input type="number" required={formData.billing_cycle === 'custom'} placeholder="Enter number of days" value={formData.custom_days} onChange={(e) => setFormData({...formData, custom_days: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none" />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Product Page Link (Optional)</label>
            <input type="url" value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder="https://" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Upload Receipt (Optional Image)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Notes (Optional)</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500 h-20 resize-none" placeholder="Add any details here..."></textarea>
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold mt-2 transition-colors">
            Save Purchase
          </button>
        </form>
      </div>
    </div>
  );
}