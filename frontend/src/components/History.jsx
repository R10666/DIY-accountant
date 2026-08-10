import React, { useState, useRef, useMemo } from 'react';
import { Search, Filter, CheckSquare } from 'lucide-react';

export default function History({ transactions, tagsList, onViewDetails }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedFilterTags, setSelectedFilterTags] = useState([]);
  
  const [typeFilters, setTypeFilters] = useState({
    purchase: true,
    deposit: true,
    refund: true,
    subscription: true
  });

  const [highlightedId, setHighlightedId] = useState(null);
  const rowRefs = useRef({}); 

  // FIX: now that the backend gives every subscription payment a real
  // subscription_id, group by that directly instead of `${title}|${cycle}`.
  // The old key worked in practice since billing_cycle no longer doubles
  // as a status flag, but subscription_id is the actual foreign key and
  // can never collide, even if two subscriptions happen to share a name.
  const subIterations = useMemo(() => {
    const counts = {};
    const iters = {};
    
    const sorted = [...transactions].sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date));
    
    sorted.filter(t => t.is_subscription).forEach(t => {
      const key = t.subscription_id ?? `${t.title}|${t.billing_cycle}`; // fallback for safety
      counts[key] = (counts[key] || 0) + 1;
      iters[t.id] = counts[key];
    });
    
    return iters;
  }, [transactions]);

  // Category badge for the fixed-width center column: Subscription,
  // Deposit, Refund, Purchase all live here so they line up vertically
  // across every row. A recurring DEPOSIT shows as "Deposit" rather than
  // "Subscription" — it's still income, just recurring income, and
  // "Subscription" reads as an expense to most people. Recurring
  // purchases (Netflix etc.) still show "Subscription" as before. Either
  // way, the "Payment #x" indicator further down (tied to is_subscription
  // alone, not type) still signals that a row is part of a recurring
  // series — the badge just no longer has to carry that meaning too.
  const getCategory = (t) => {
    if (t.is_subscription && t.type !== 'deposit') return { label: 'Subscription', className: 'bg-purple-900/70 text-purple-300' };
    if (t.type === 'deposit') return { label: 'Deposit', className: 'bg-sky-900/80 text-sky-300' };
    if (t.type === 'refund') return { label: 'Refund', className: 'bg-indigo-900/80 text-indigo-300' };
    if (t.type === 'purchase') return { label: 'Purchase', className: 'bg-pink-900/70 text-pink-300' };
    return null;
  };

  const toggleFilterTag = (tagName) => {
    setSelectedFilterTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName) 
        : [...prev, tagName]
    );
  };

  // FIX: showAllTypes used to be its own piece of state, kept in sync via
  // a setState call INSIDE setTypeFilters's updater function. That updater
  // is supposed to be pure — React can invoke it more than once per update
  // (Strict Mode does this deliberately in development, and concurrent
  // rendering can too, if a render is started and later discarded). Every
  // extra invocation re-fired the setShowAllTypes side effect, even for
  // renders that never committed, letting the two pieces of state drift
  // apart after enough clicks. Deriving showAllTypes directly from
  // typeFilters on every render removes the second source of truth
  // entirely, so there's nothing left to desync.
  const showAllTypes = Object.values(typeFilters).every(Boolean);

  const handleTypeToggle = (typeKey) => {
    setTypeFilters(prev => ({ ...prev, [typeKey]: !prev[typeKey] }));
  };

  const handleShowAllToggle = () => {
    const nextState = !showAllTypes;
    setTypeFilters({
      purchase: nextState,
      deposit: nextState,
      refund: nextState,
      subscription: nextState
    });
  };

  let processedPurchases = transactions.filter(t => {
    if (t.type === 'adjustment') return false;
    if (searchTerm && !t.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;

    // These mirror getCategory()'s exact priority below, so a row's
    // checkbox and its badge always agree: a recurring DEPOSIT is
    // governed by the Deposits checkbox (like its badge says "Deposit"),
    // not Subscriptions. Subscriptions only governs recurring rows that
    // AREN'T deposits (i.e. recurring purchases/expenses). Purchase and
    // Refund stay scoped to one-off rows, same as before.
    if (t.type === 'deposit' && !typeFilters.deposit) return false;
    if (t.is_subscription && t.type !== 'deposit' && !typeFilters.subscription) return false;
    if (!t.is_subscription && t.type === 'purchase' && !typeFilters.purchase) return false;
    if (!t.is_subscription && t.type === 'refund' && !typeFilters.refund) return false;

    let txTags = [];
    try { txTags = JSON.parse(t.tags || '[]'); } catch { }
    
    if (selectedFilterTags.length > 0) {
      const hasMatch = selectedFilterTags.some(selectedTag => txTags.includes(selectedTag));
      if (!hasMatch) return false;
    }
    
    return true;
  });

  processedPurchases.sort((a, b) => {
    if (sortBy === 'date-desc') return new Date(b.purchase_date) - new Date(a.purchase_date);
    if (sortBy === 'date-asc') return new Date(a.purchase_date) - new Date(b.purchase_date);
    if (sortBy === 'price-desc') return b.amount - a.amount;
    if (sortBy === 'price-asc') return a.amount - b.amount;
    if (sortBy === 'alpha-asc') return a.title.localeCompare(b.title);
    return 0;
  });

  // Total spending across whatever is currently visible after ALL
  // filters (search, type checkboxes, tag chips) — since it's derived
  // straight from processedPurchases, it updates automatically with no
  // separate state to keep in sync. Purchases add to it, refunds
  // subtract, and deposits are ignored entirely (income isn't spending).
  // Subscription payments need no special-casing — they're type:
  // 'purchase' underneath, so they're already included.
  const totalSpending = processedPurchases.reduce((sum, t) => {
    if (t.type === 'purchase') return sum + t.amount;
    if (t.type === 'refund') return sum - t.amount;
    return sum;
  }, 0);

  const formatTotal = (val) => {
    if (val < 0) return `-$${Math.abs(val).toFixed(2)}`;
    return `$${val.toFixed(2)}`;
  };

  // FIX: transactions.id and subscription_payments.id are two SEPARATE
  // AUTOINCREMENT sequences, each starting at 1 — so a one-off transaction
  // and a subscription payment can (and very often do) share the same raw
  // `id` once they're merged into one combined list by the backend. Using
  // t.id directly as a React key produces duplicate keys, which React
  // explicitly documents as producing "unsupported" behavior — including
  // stale rows surviving a re-render even when the underlying data (and
  // this list's own length) says they shouldn't still be there. rowKey()
  // namespaces by row type so it's unique across the whole combined list,
  // while t.id itself is left untouched everywhere it's used to build API
  // calls, since that still needs to be the real underlying row id.
  const rowKey = (t) => `${t.is_subscription ? 'sub' : 'tx'}-${t.id}`;

  const scrollToRefund = (originalTitle) => {
    const targetTitle = `Refund: ${originalTitle}`;
    const refundTx = processedPurchases.find(tx => tx.type === 'refund' && tx.title === targetTitle);
    
    if (refundTx && rowRefs.current[rowKey(refundTx)]) {
      rowRefs.current[rowKey(refundTx)].scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setHighlightedId(rowKey(refundTx));
      setTimeout(() => {
        setHighlightedId(null);
      }, 2000);
    } else {
      alert("Refund entry not found. Ensure 'Refunds' is checked in your filters!");
    }
  };
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Transaction History</h2>
        <div className="text-right">
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider">Total Spending (filtered)</p>
          <p className={`text-xl font-bold ${totalSpending >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatTotal(totalSpending)}
          </p>
        </div>
      </div>

      <div className="p-4 bg-slate-900 border-b border-slate-700 flex flex-col gap-4">
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search purchases, deposits, refunds..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500 md:w-48"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="price-desc">Highest Amount</option>
            <option value="price-asc">Lowest Amount</option>
            <option value="alpha-asc">Alphabetical (A-Z)</option>
          </select>
        </div>

        <div className="flex flex-col gap-3 pt-3 border-t border-slate-700/50">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1 text-sm font-medium text-slate-400 mr-2">
              <CheckSquare size={14} /> Show:
            </span>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-white select-none">
              <input type="checkbox" checked={showAllTypes} onChange={handleShowAllToggle} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded bg-slate-800 border-slate-600" />
              All
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-white select-none">
              <input type="checkbox" checked={typeFilters.purchase} onChange={() => handleTypeToggle('purchase')} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded bg-slate-800 border-slate-600" />
              Purchases
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-white select-none">
              <input type="checkbox" checked={typeFilters.deposit} onChange={() => handleTypeToggle('deposit')} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded bg-slate-800 border-slate-600" />
              Deposits
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-white select-none">
              <input type="checkbox" checked={typeFilters.refund} onChange={() => handleTypeToggle('refund')} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded bg-slate-800 border-slate-600" />
              Refunds
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-white select-none">
              <input type="checkbox" checked={typeFilters.subscription} onChange={() => handleTypeToggle('subscription')} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded bg-slate-800 border-slate-600" />
              Subscriptions
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-medium text-slate-400 mr-2">
              <Filter size={14} /> Tags:
            </span>
            {tagsList.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No tags created yet.</span>
            ) : (
              tagsList.map(tag => {
                const isSelected = selectedFilterTags.includes(tag.name);
                return (
                  <button
                    key={tag.name}
                    onClick={() => toggleFilterTag(tag.name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border hover:opacity-80 ${isSelected ? 'drop-shadow-md' : ''}`}
                    style={isSelected 
                      ? { backgroundColor: tag.color, borderColor: tag.color, color: '#ffffff' } 
                      : { backgroundColor: 'transparent', borderColor: tag.color, color: tag.color }
                    }
                  >
                    {tag.name}
                  </button>
                );
              })
            )}
            
            {selectedFilterTags.length > 0 && (
              <button 
                onClick={() => setSelectedFilterTags([])}
                className="text-xs text-indigo-400 hover:text-indigo-300 ml-2 underline underline-offset-2 transition-colors"
              >
                Clear Tag Filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        {processedPurchases.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Filter size={32} className="text-slate-600 mb-3" />
            <p className="text-slate-400 font-medium">No transactions match your filters.</p>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or checkboxes.</p>
          </div>
        ) : (
          processedPurchases.map(t => {
            const isFullyRefunded = t.type === 'purchase' && (t.refunded_amount || 0) >= t.amount;
            const isIncome = t.type === 'deposit' || t.type === 'refund';
            const isHighlighted = highlightedId === rowKey(t);
            const category = getCategory(t);
            
            let txTags = [];
            try { txTags = JSON.parse(t.tags || '[]'); } catch { }

            let amountColor = 'text-rose-400'; 
            if (isFullyRefunded) amountColor = 'text-slate-500'; 
            else if (isIncome) amountColor = 'text-emerald-400'; 

            return (
              <div 
                key={rowKey(t)} 
                ref={(el) => (rowRefs.current[rowKey(t)] = el)} 
                className={`flex justify-between items-center py-4 px-6 border-b border-slate-700/50 last:border-b-0 transition-all duration-500 ${isHighlighted ? 'bg-indigo-900/40 border-l-4 border-l-indigo-400' : 'hover:bg-slate-700/30 border-l-4 border-l-transparent'}`}
              >
                {/* Left: title, refund status, tags/date. */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold truncate ${isFullyRefunded ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {t.title}
                    </p>

                    {t.refunded_amount > 0 && t.type === 'purchase' ? (
                      <button 
                        onClick={() => scrollToRefund(t.title)}
                        title="Click to find the refund entry"
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded shrink-0 transition-colors cursor-pointer hover:text-white ${
                          isFullyRefunded 
                            ? 'bg-emerald-900 hover:bg-emerald-700 text-emerald-400' 
                            : 'bg-amber-900/80 hover:bg-amber-700 text-amber-400'
                        }`}
                      >
                        {isFullyRefunded ? 'Fully Refunded' : 'Partially Refunded'}
                      </button>
                    ) : null}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-slate-400 mr-1">{t.purchase_date}</span>

                    {txTags.map(tagName => {
                      const tagObj = tagsList.find(tg => tg.name === tagName);
                      return (
                        <span 
                          key={tagName} 
                          className="text-[10px] px-2 py-0.5 rounded text-white drop-shadow-md font-medium" 
                          style={{ backgroundColor: tagObj ? tagObj.color : '#64748b' }}
                        >
                          {tagName}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Center: category badge — Subscription, Deposit, Refund, and
                    Purchase all live here in a fixed-width column, so they line
                    up vertically across every row regardless of title length.
                    Payment #x now stacks directly underneath the badge, using
                    the empty vertical space in this column instead of crowding
                    the tags row. */}
                <div className="w-36 shrink-0 flex flex-col items-center justify-center gap-1">
                  {category ? (
                    <span className={`text-xs uppercase font-bold px-3 py-1 rounded ${category.className}`}>
                      {category.label}
                    </span>
                  ) : null}

                  {t.is_subscription ? (
                    <span className="text-[10px] text-purple-300/80 font-medium">
                      Payment #{subIterations[t.id]}
                    </span>
                  ) : null}
                </div>
                
                {/* Right: amount, button */}
                <div className="flex items-center gap-6 shrink-0">
                  <span className={`font-bold ${amountColor} w-24 text-right`}>
                    {isIncome ? '+' : '-'}${t.amount.toFixed(2)}
                  </span>
                  
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