import React, { useState } from 'react';
import { X } from 'lucide-react';
import { uploadFile, createSubscription, createTransaction } from '../api';

export default function EntryModal({ availableTags, closeModal, refreshData }) {
  const [entryType, setEntryType] = useState('purchase');
  const [file, setFile] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    is_subscription: false,
    billing_cycle: 'monthly',
    custom_days: '',
    end_type: 'never',      // 'never' | 'date' | 'installments'
    end_date: '',
    max_installments: '',
    url: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '',
    tags: []
  });

  const toggleTag = (tagName) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagName)
        ? prev.tags.filter(t => t !== tagName)
        : [...prev.tags, tagName]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalBillingCycle = null;
    let finalEndDate = null;
    let finalMaxInstallments = null;
    if (formData.is_subscription) {
      finalBillingCycle = formData.billing_cycle === 'custom' ? `${formData.custom_days} days` : formData.billing_cycle;
      if (formData.end_type === 'date') finalEndDate = formData.end_date;
      if (formData.end_type === 'installments') finalMaxInstallments = parseInt(formData.max_installments, 10);
    }

    let receiptUrl = null;
    if (file) {
      try {
        const uploadJson = await uploadFile(file);
        receiptUrl = uploadJson.url;
      } catch (err) {
        console.error("Failed to upload file:", err);
        alert(`Couldn't upload the receipt: ${err.message}. The entry will be saved without it — you can attach it later from the details page.`);
      }
    }

    // Force tags to empty if it's a deposit, just in case they toggled back and forth
    const finalTags = entryType === 'deposit' ? [] : formData.tags;

    try {
      // Subscriptions and one-off transactions live in separate
      // tables/endpoints now. Recurring entries go through
      // createSubscription (which also immediately materializes any
      // already-due payment server-side); everything else goes through
      // createTransaction.
      if (formData.is_subscription) {
        await createSubscription({
          title: formData.title,
          amount: parseFloat(formData.amount),
          type: entryType,
          billing_cycle: finalBillingCycle,
          start_date: formData.purchase_date,
          end_date: finalEndDate,
          max_installments: finalMaxInstallments,
          url: formData.url,
          notes: formData.notes,
          tags: JSON.stringify(finalTags),
          receipt_file: receiptUrl
        });
      } else {
        await createTransaction({
          title: formData.title,
          amount: parseFloat(formData.amount),
          type: entryType,
          url: formData.url,
          purchase_date: formData.purchase_date,
          notes: formData.notes,
          tags: JSON.stringify(finalTags),
          receipt_file: receiptUrl
        });
      }

      refreshData();
      closeModal();
    } catch (error) {
      console.error("Failed to save transaction:", error);
      alert(`Couldn't save this entry: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] overflow-y-auto">
      {/*
        FIX: this used to be a fixed max-w-md, so checking "recurring"
        stacked its billing-cycle + ends fields underneath everything
        else, making the modal grow tall enough to need scrolling. It now
        widens to fit a two-column layout instead of getting taller —
        unchecked stays exactly as narrow/simple as before.
      */}
      <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 w-full my-8 transition-[max-width] duration-200 ${formData.is_subscription ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">
            {entryType === 'purchase' ? 'Add Purchase' : 'Add Deposit'}
          </h3>
          <button onClick={closeModal} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 mb-6">
          <button
            type="button"
            onClick={() => setEntryType('purchase')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${entryType === 'purchase' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Expense (Purchase)
          </button>
          <button
            type="button"
            onClick={() => setEntryType('deposit')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${entryType === 'deposit' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Income (Deposit)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={formData.is_subscription ? 'grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start' : ''}>

            {/* LEFT COLUMN (the only column when not recurring) */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-400 mb-1">Name *</label>
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder={entryType === 'purchase' ? "e.g. Spotify" : "e.g. Paycheck"} />
                </div>
                <div className="w-1/3">
                  <label className="block text-sm font-medium text-slate-400 mb-1">Amount *</label>
                  <input type="number" step="0.01" required value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder="0.00" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  {formData.is_subscription ? 'First Payment Date *' : 'Date *'}
                </label>
                <input type="date" required value={formData.purchase_date} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" />
              </div>

              {/* TAGS SECTION - Hides when Deposit is selected */}
              {entryType === 'purchase' && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Tags (Select all that apply)</label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => {
                      const isSelected = formData.tags.includes(tag.name);
                      return (
                        <button
                          key={tag.name}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border hover:opacity-80 ${isSelected ? 'drop-shadow-md' : ''}`}
                          style={isSelected
                            ? { backgroundColor: tag.color, borderColor: tag.color, color: '#ffffff' }
                            : { backgroundColor: 'transparent', borderColor: tag.color, color: tag.color }
                          }
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                    {availableTags.length === 0 && <span className="text-sm text-slate-500 italic">No tags created yet.</span>}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer bg-slate-900 p-3 rounded-lg border border-slate-700">
                <input type="checkbox" checked={formData.is_subscription} onChange={(e) => setFormData({...formData, is_subscription: e.target.checked})} className="w-4 h-4 accent-indigo-500" />
                <span className="text-sm font-medium text-slate-200">
                  {entryType === 'purchase' ? 'This is a recurring subscription' : 'This is a recurring deposit'}
                </span>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Link (Optional)</label>
                <input type="url" value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500" placeholder="https://" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Upload Receipt (Optional Image/PDF)</label>
                <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Notes (Optional)</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500 h-20 resize-none" placeholder="Add any details here..."></textarea>
              </div>
            </div>

            {/* RIGHT COLUMN: all subscription-specific settings, grouped
                into their own panel instead of stacking into the flow
                above. Only rendered (and only takes up space) once
                "recurring" is checked. */}
            {formData.is_subscription && (
              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600 space-y-3 h-fit">
                <h4 className="text-sm font-semibold text-slate-200 pb-2 border-b border-slate-600/70">Subscription Details</h4>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Billing Cycle</label>
                  <select value={formData.billing_cycle} onChange={(e) => setFormData({...formData, billing_cycle: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none">
                    <option value="weekly">Every Week</option>
                    <option value="monthly">Every Month</option>
                    <option value="yearly">Every Year</option>
                    <option value="custom">Custom (Days)</option>
                  </select>
                  {formData.billing_cycle === 'custom' && (
                    <input type="number" required={formData.billing_cycle === 'custom'} placeholder="Enter number of days" value={formData.custom_days} onChange={(e) => setFormData({...formData, custom_days: e.target.value})} className="w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none" />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ends</label>
                  <select value={formData.end_type} onChange={(e) => setFormData({...formData, end_type: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none">
                    <option value="never">Never (ongoing)</option>
                    <option value="date">On a specific date</option>
                    <option value="installments">After a number of payments</option>
                  </select>
                  {formData.end_type === 'date' && (
                    <input
                      type="date"
                      required
                      min={formData.purchase_date}
                      value={formData.end_date}
                      onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                      className="w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none"
                    />
                  )}
                  {formData.end_type === 'installments' && (
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 12"
                      value={formData.max_installments}
                      onChange={(e) => setFormData({...formData, max_installments: e.target.value})}
                      className="w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <button type="submit" className={`w-full text-white py-3 rounded-lg font-bold mt-2 transition-colors ${entryType === 'purchase' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {entryType === 'purchase' ? 'Save Purchase' : 'Save Deposit'}
          </button>
        </form>
      </div>
    </div>
  );
}