import React, { useState } from 'react';
import { Search, Filter } from 'lucide-react';

export default function History({ transactions, tagsList, onViewDetails }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedFilterTags, setSelectedFilterTags] = useState([]);

  const basePurchases = transactions.filter(t => !t.is_subscription && t.type !== 'adjustment');
  
  const toggleFilterTag = (tagName) => {
    setSelectedFilterTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName) 
        : [...prev, tagName]
    );
  };

  let processedPurchases = basePurchases.filter(t => {
    if (searchTerm && !t.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    
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
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <h2 className="text-xl font-bold">Purchase History</h2>
      </div>

      <div className="p-4 bg-slate-900 border-b border-slate-700 flex flex-col gap-4">
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search purchases..." 
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
            <option value="price-desc">Highest Price</option>
            <option value="price-asc">Lowest Price</option>
            <option value="alpha-asc">Alphabetical (A-Z)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
          <span className="flex items-center gap-1 text-sm font-medium text-slate-400 mr-2">
            <Filter size={14} /> Filter by Tags:
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
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-700/50">
        {processedPurchases.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Filter size={32} className="text-slate-600 mb-3" />
            <p className="text-slate-400 font-medium">No purchases match your filters.</p>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or unselecting some tags.</p>
          </div>
        ) : (
          processedPurchases.map(t => {
            const isFullyRefunded = (t.refunded_amount || 0) >= t.amount;
            
            let txTags = [];
            try { txTags = JSON.parse(t.tags || '[]'); } catch { }

            return (
              <div key={t.id} className="flex justify-between items-center py-4 px-6 hover:bg-slate-700/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${isFullyRefunded ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.title}</p>
                    {t.refunded_amount > 0 && <span className="text-xs bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded">Refunded</span>}
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