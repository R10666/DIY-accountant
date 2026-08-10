import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit2, Check, RefreshCcw, ExternalLink, UploadCloud, Trash2, X, Maximize2 } from 'lucide-react';

// NEW: Accept transactions prop to generate the history table
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

  // NEW: Find all historical payments for this subscription
  const isSub = t.is_subscription;
  const subHistory = isSub && transactions 
    ? transactions.filter(tx => tx.is_subscription && tx.title === t.title)
        .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)) // Newest first
    : [];

  useEffect(() => {
    if (t.url && !isEditing) {
      fetch(`http://127.0.0.1:8000/api/preview?url=${encodeURIComponent(t.url)}`)
        .then(res => res.json())
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
    await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: formData.notes, url: formData.url, tags: JSON.stringify(finalTags) })
    });
    setIsEditing(false);
    refreshData();
    t.notes = formData.notes;
    t.url = formData.url;
    t.tags = JSON.stringify(finalTags);
  };

  const handleRefund = async () => {
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
    await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refunded_amount: newTotalRefund })
    });

    await fetch('http://127.0.0.1:8000/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Refund: ${t.title}`,
        amount: amountToRefund,
        type: 'refund',
        purchase_date: dateInput,
        is_subscription: false,
        tags: t.tags 
      })
    });

    refreshData();
    t.refunded_amount = newTotalRefund;
  };

  const handleInlineUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const uploadData = new FormData();
    uploadData.append("file", file);
    try {
      const uploadRes = await fetch('http://127.0.0.1:8000/api/upload', { method: 'POST', body: uploadData });
      const uploadJson = await uploadRes.json();
      await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_file: uploadJson.url })
      });
      refreshData();
      t.receipt_file = uploadJson.url;
    } catch (err) {
      console.error("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!confirm("Are you sure you want to remove this receipt?")) return;
    await fetch(`http://127.0.0.1:8000/api/transaction/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_file: "" })
    });
    refreshData();
    t.receipt_file = ""; 
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
              {t.is_subscription && t.billing_cycle !== 'cancelled' ? (
                <p className="flex justify-between"><span className="text-slate-500">Billing Cycle</span> <span className="capitalize">{t.billing_cycle}</span></p>
              ) : null}
              {t.is_subscription && t.billing_cycle === 'cancelled' ? (
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

        {/* NEW: Full Width Subscription Payment History Table */}
        {isSub && (
          <div className="px-8 pb-8">
            <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 mb-4">Complete Payment History</h3>
            
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden max-h-72 overflow-y-auto">
              {subHistory.map((tx, idx) => {
                const chronologicalIteration = subHistory.length - idx; // because array is sorted newest first
                const isCancelled = tx.billing_cycle === 'cancelled';
                
                return (
                  <div key={tx.id} className="flex justify-between items-center py-3 px-6 border-b border-slate-700/50 last:border-b-0 hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 text-sm font-medium w-12">#{chronologicalIteration}</span>
                      <span className="text-slate-200 font-medium">{tx.purchase_date}</span>
                      
                      {isCancelled && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider bg-slate-700 text-slate-400 ml-2">
                          Inactive Record
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