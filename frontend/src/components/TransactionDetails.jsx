import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit2, Check, RefreshCcw, ExternalLink, UploadCloud, Trash2, X, Maximize2 } from 'lucide-react';
import { getLinkPreview, updateTransaction, updateSubscription, updateSubscriptionPayment, createTransaction, uploadFile, deleteTransaction, deleteSubscription } from '../api';

// Accepts `transactions` prop to generate the subscription payment history table
export default function TransactionDetails({ t, tagsList, onBack, refreshData, transactions }) {
  const [isEditing, setIsEditing] = useState(false);

  const parseTags = () => {
    try { return JSON.parse(t.tags || '[]'); }
    catch { return []; }
  };

  const [formData, setFormData] = useState({
    notes: t.notes || '',
    url: t.url || '',
    tags: parseTags()
  });

  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const refunded = t.refunded_amount || 0;
  const isFullyRefunded = refunded >= t.amount;
  const isIncome = t.type === 'deposit' || t.type === 'refund' || t.type === 'adjustment';

  const isSub = t.is_subscription;
  // A subscription row's own definition lives in the subscriptions table
  // (t.subscription_id), separate from any individual payment (t.id here
  // is a subscription_payments id, not a transactions id). Editing notes/
  // url/tags/receipt applies to the DEFINITION — shared across every
  // payment — while refunding applies to one specific payment.
  const isCancelled = isSub && t.subscription_status === 'cancelled';

  // Payment history is now matched by subscription_id, not title, so two
  // differently-tracked subscriptions that happen to share a name can
  // never bleed into each other's history.
  const subHistory = isSub && transactions
    ? transactions.filter(tx => tx.is_subscription && tx.subscription_id === t.subscription_id)
        .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)) // Newest first
    : [];

  useEffect(() => {
    if (t.url && !isEditing) {
      getLinkPreview(t.url)
        .then(data => setPreview(data))
        .catch(() => setPreview(null));
    }
  }, [t.url, isEditing]);

  const toggleTag = (tagName) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagName) ? prev.tags.filter(tg => tg !== tagName) : [...prev.tags, tagName]
    }));
  };

  const handleSave = async () => {
    const finalTags = t.type === 'deposit' ? [] : formData.tags;
    try {
      const payload = { notes: formData.notes, url: formData.url, tags: JSON.stringify(finalTags) };
      if (isSub) {
        await updateSubscription(t.subscription_id, payload);
      } else {
        await updateTransaction(t.id, payload);
      }

      setIsEditing(false);
      refreshData();
      t.notes = formData.notes;
      t.url = formData.url;
      t.tags = JSON.stringify(finalTags);
    } catch (error) {
      console.error("Failed to save changes:", error);
      alert(`Couldn't save your changes: ${error.message}`);
    }
  };

  const handleRefund = async () => {
    if (isSub && !t.id) {
      alert("This subscription hasn't had its first payment yet, so there's nothing to refund.");
      return;
    }

    const maxRefund = t.amount - refunded;
    const input = prompt(`Enter amount to refund (Max: $${maxRefund.toFixed(2)}).`, maxRefund);
    if (input === null) return;

    const amountToRefund = parseFloat(input);
    if (isNaN(amountToRefund) || amountToRefund <= 0 || amountToRefund > maxRefund) {
      alert("Invalid refund amount entered.");
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const dateInput = prompt(`Enter date of refund (YYYY-MM-DD):`, today);
    if (!dateInput) return;

    const newTotalRefund = refunded + amountToRefund;

    try {
      // Refunding a subscription payment updates that ONE payment row;
      // refunding a one-off updates the transaction row directly. Either
      // way, the refund itself is always logged as a normal one-off
      // 'refund' transaction so it shows up in the ledger and History.
      if (isSub) {
        await updateSubscriptionPayment(t.id, { refunded_amount: newTotalRefund });
      } else {
        await updateTransaction(t.id, { refunded_amount: newTotalRefund });
      }

      await createTransaction({
        title: `Refund: ${t.title}`,
        amount: amountToRefund,
        type: 'refund',
        purchase_date: dateInput,
        tags: t.tags
      });

      refreshData();
      t.refunded_amount = newTotalRefund;
    } catch (error) {
      console.error("Failed to process refund:", error);
      alert(`Something went wrong processing this refund: ${error.message}\n\nPlease check the transaction history before retrying, to avoid a duplicate refund.`);
    }
  };

  // FIX/NEW: deleting a subscription row deletes the whole SUBSCRIPTION
  // (definition + all its payment history), not just this one payment.
  // A single subscription_payments row can't safely be deleted on its
  // own — the sync engine anchors future generation off the MOST RECENT
  // payment date, so deleting just the latest one would simply get
  // silently regenerated the next time data refreshes. Deleting the
  // whole subscription sidesteps that entirely, and is clearly labeled
  // as different from "Stop" (which pauses billing but keeps history).
  const handleDelete = async () => {
    const confirmMessage = isSub
      ? `Delete "${t.title}" permanently? This removes the subscription AND all ${subHistory.length} payment${subHistory.length === 1 ? '' : 's'} of its history — this can't be undone.\n\nIf you just want to pause future billing and keep the history, use "Stop" on the Subscriptions page instead.`
      : `Delete "${t.title}" permanently? This can't be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      if (isSub) {
        await deleteSubscription(t.subscription_id);
      } else {
        await deleteTransaction(t.id);
      }
      refreshData();
      onBack();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert(`Couldn't delete this ${isSub ? 'subscription' : 'transaction'}: ${error.message}`);
    }
  };

  const handleInlineUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadJson = await uploadFile(file);
      const payload = { receipt_file: uploadJson.url };
      if (isSub) {
        await updateSubscription(t.subscription_id, payload);
      } else {
        await updateTransaction(t.id, payload);
      }

      refreshData();
      t.receipt_file = uploadJson.url;
    } catch (err) {
      console.error("Failed to upload file:", err);
      alert(`Couldn't attach that receipt: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!confirm("Are you sure you want to remove this receipt?")) return;
    try {
      const payload = { receipt_file: "" };
      if (isSub) {
        await updateSubscription(t.subscription_id, payload);
      } else {
        await updateTransaction(t.id, payload);
      }

      refreshData();
      t.receipt_file = "";
    } catch (error) {
      console.error("Failed to delete receipt:", error);
      alert(`Couldn't remove the receipt: ${error.message}`);
    }
  };

  const isPdf = t.receipt_file?.toLowerCase().endsWith('.pdf');
  const currentTags = parseTags();

  return (
    <>
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-h-[500px]">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 sticky top-0 z-40">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} /> Back to List
          </button>
          <div className="flex gap-3">
            <button onClick={() => setIsEditing(!isEditing)} className="flex items-center gap-2 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors">
              <Edit2 size={16} /> {isEditing ? 'Cancel Edit' : 'Edit Details'}
            </button>
            {!isFullyRefunded && !isIncome && (
              <button onClick={handleRefund} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 px-4 py-2 rounded-lg transition-colors">
                <RefreshCcw size={16} /> Process Refund
              </button>
            )}
            <button onClick={handleDelete} className="flex items-center gap-2 text-rose-400 hover:text-rose-300 bg-rose-900/30 hover:bg-rose-900/50 px-4 py-2 rounded-lg transition-colors">
              <Trash2 size={16} /> {isSub ? 'Delete Subscription' : 'Delete'}
            </button>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <h1 className={`text-3xl font-bold ${isFullyRefunded && t.type === 'purchase' ? 'line-through text-slate-500' : 'text-white'}`}>{t.title}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className={`text-2xl font-semibold ${isFullyRefunded && t.type === 'purchase' ? 'text-slate-500' : (isIncome ? 'text-emerald-400' : 'text-slate-200')}`}>
                  {isIncome ? '+' : ''}${t.amount.toFixed(2)}
                </span>
                {refunded > 0 && t.type === 'purchase' && <span className="text-sm bg-emerald-900 text-emerald-400 px-3 py-1 rounded-full">Refunded: ${refunded.toFixed(2)}</span>}
              </div>
            </div>

            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 space-y-3 text-slate-300">
              <p className="flex justify-between"><span className="text-slate-500">Date</span> <span>{t.purchase_date}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Type</span> <span className="capitalize">{t.type}</span></p>
              {isSub ? (
                <p className="flex justify-between"><span className="text-slate-500">Billing Cycle</span> <span className="capitalize">{t.billing_cycle}</span></p>
              ) : null}
              {isCancelled ? (
                <p className="flex justify-between"><span className="text-slate-500">Status</span> <span className="text-slate-500 font-bold uppercase">Inactive</span></p>
              ) : null}

              {t.type !== 'deposit' && (
                <div className="flex justify-between items-start pt-2 border-t border-slate-700/50">
                  <span className="text-slate-500">Tags</span>
                  <div className="flex flex-wrap gap-2 justify-end max-w-[200px]">
                    {currentTags.length === 0 ? <span className="text-sm italic">No tags</span> : currentTags.map(tagName => {
                      const tagObj = tagsList.find(tg => tg.name === tagName);
                      return (
                        <span key={tagName} className="px-2 py-0.5 rounded text-xs text-white drop-shadow-md" style={{ backgroundColor: tagObj ? tagObj.color : '#64748b' }}>
                          {tagName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">Notes & Links</h3>

              {isEditing ? (
                <div className="space-y-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  {t.type !== 'deposit' && (
                    <div>
                      <label className="text-xs text-slate-400 mb-2 block">Tags (Select to toggle)</label>
                      <div className="flex flex-wrap gap-2">
                        {tagsList.map(tag => {
                          const isSelected = formData.tags.includes(tag.name);
                          return (
                            <button
                              key={tag.name}
                              type="button"
                              onClick={() => toggleTag(tag.name)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border hover:opacity-80 ${isSelected ? 'drop-shadow-md' : ''}`}
                              style={isSelected ? { backgroundColor: tag.color, borderColor: tag.color, color: '#ffffff' } : { backgroundColor: 'transparent', borderColor: tag.color, color: tag.color }}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-400">Product URL</label>
                    <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 text-sm mt-1 outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Notes</label>
                    <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded p-2.5 text-sm mt-1 h-24 outline-none focus:border-indigo-500" />
                  </div>
                  {isSub && (
                    <p className="text-xs text-slate-500 italic">
                      Notes, links, and tags apply to the whole subscription — every past and future payment shares them.
                    </p>
                  )}
                  <button onClick={handleSave} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-lg text-sm text-white font-medium transition-colors">
                    <Check size={16}/> Save Changes
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {t.url ? (
                    preview && preview.title !== t.url ? (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="block border border-slate-700 bg-slate-900 rounded-lg overflow-hidden hover:border-indigo-500 transition-colors max-w-sm group">
                        {preview.image && <div className="h-32 overflow-hidden"><img src={preview.image} alt="preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>}
                        <div className="p-4 border-t border-slate-700">
                          <h4 className="text-sm font-bold text-slate-200 line-clamp-1">{preview.title}</h4>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{preview.description}</p>
                        </div>
                      </a>
                    ) : (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors">
                        <ExternalLink size={16} /> {t.url}
                      </a>
                    )
                  ) : (
                    <p className="text-slate-500 text-sm italic">No link provided.</p>
                  )}

                  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 min-h-[100px]">
                    {t.notes ? <p className="text-slate-300 whitespace-pre-wrap">{t.notes}</p> : <p className="text-slate-500 text-sm italic">No notes added.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">Receipt</h3>
            {t.receipt_file ? (
              <div className="bg-slate-900/80 border border-slate-700 rounded-xl h-[450px] relative group overflow-hidden flex items-center justify-center">
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => setShowFullscreen(true)} className="bg-slate-800 hover:bg-indigo-600 text-white p-2 rounded-lg shadow-lg transition-colors" title="Open Full Size">
                    <Maximize2 size={18} />
                  </button>
                  <button onClick={handleDeleteReceipt} className="bg-slate-800 hover:bg-rose-600 text-rose-200 hover:text-white p-2 rounded-lg shadow-lg transition-colors" title="Delete Receipt">
                    <Trash2 size={18} />
                  </button>
                </div>
                {isPdf ? (
                  <object data={t.receipt_file} type="application/pdf" className="w-full h-full">
                    <p className="text-slate-400 p-4">PDF cannot be displayed. <a href={t.receipt_file} className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer">Download here</a>.</p>
                  </object>
                ) : (
                  <div onClick={() => setShowFullscreen(true)} className="w-full h-full cursor-zoom-in flex items-center justify-center p-2" title="Click to view full size">
                    <img src={t.receipt_file} alt="Receipt" className="object-contain max-w-full max-h-full" />
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 bg-slate-800/30 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                <p className="text-slate-400 mb-4">No receipt uploaded for this transaction.</p>
                <label className="flex items-center gap-2 cursor-pointer bg-slate-700 hover:bg-slate-600 px-4 py-2.5 rounded-lg text-sm text-white font-medium transition-colors shadow-lg">
                  <UploadCloud size={18} /> {isUploading ? 'Uploading...' : 'Upload File (Image/PDF)'}
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={isUploading} onChange={handleInlineUpload} />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Full Width Subscription Payment History Table */}
        {isSub && (
          <div className="px-8 pb-8">
            <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 mb-4">Complete Payment History</h3>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden max-h-72 overflow-y-auto">
              {subHistory.length === 0 ? (
                <p className="text-slate-500 text-sm italic p-6">No payments recorded yet for this subscription.</p>
              ) : subHistory.map((tx, idx) => {
                const chronologicalIteration = subHistory.length - idx; // because array is sorted newest first

                return (
                  <div key={tx.id} className="flex justify-between items-center py-3 px-6 border-b border-slate-700/50 last:border-b-0 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 text-sm font-medium w-12">#{chronologicalIteration}</span>
                      <span className="text-slate-200 font-medium">{tx.purchase_date}</span>

                      {tx.refunded_amount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider bg-emerald-900/60 text-emerald-400 ml-2">
                          Refunded ${tx.refunded_amount.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <span className={`font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isIncome ? '+' : '-'}${tx.amount.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {isCancelled && (
              <p className="text-xs text-slate-500 italic mt-3">
                This subscription is currently inactive — no new payments will be generated until it's restarted.
              </p>
            )}
          </div>
        )}
      </div>

      {showFullscreen && t.receipt_file && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 cursor-zoom-out"
          onClick={() => setShowFullscreen(false)}
        >
          <button
            className="absolute top-6 right-6 text-slate-400 hover:text-white bg-slate-900/50 p-2 rounded-full transition-colors z-50"
            onClick={() => setShowFullscreen(false)}
          >
            <X size={24} />
          </button>
          <div className="w-full h-full max-w-5xl max-h-[90vh] flex items-center justify-center cursor-default" onClick={(e) => e.stopPropagation()} >
            {isPdf ? (
              <object data={t.receipt_file} type="application/pdf" className="w-full h-full rounded-xl bg-white">
                <p className="text-slate-800 p-4">PDF cannot be displayed. <a href={t.receipt_file} className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer">Download here</a>.</p>
              </object>
            ) : (
              <img src={t.receipt_file} alt="Fullscreen Receipt" className="object-contain w-full h-full rounded-xl" />
            )}
          </div>
        </div>
      )}
    </>
  );
}