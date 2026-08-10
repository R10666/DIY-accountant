import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// FIX: viewMode used to be internal state here, with its own toggle row
// rendered above the chart — which ate into the chart's vertical space
// inside an already-fixed-height card, making it look squished. The
// toggle now lives in Dashboard's header row instead (free horizontal
// space next to the "Spending Analytics" title costs nothing vertically),
// and is passed down here as a plain prop.
export default function SpendingChart({ transactions, tagsList, viewMode = 'amount' }) {
  const chartData = useMemo(() => {
    const spendingByTag = {};
    const countByTag = {};

    // Dollar amount: purchases AND refunds (a refund reduces that tag's
    // spend), split proportionally across a transaction's tags so the
    // amounts actually sum to the true total spend.
    transactions
      .filter(t => (t.type === 'purchase' || t.type === 'refund') && !t.is_subscription)
      .forEach(t => {
        const impact = t.type === 'refund' ? -t.amount : t.amount;
        let txTags = [];
        try { txTags = JSON.parse(t.tags || '[]'); } catch { }

        if (txTags.length === 0) {
          spendingByTag['Untagged'] = (spendingByTag['Untagged'] || 0) + impact;
        } else {
          const splitAmount = impact / txTags.length;
          txTags.forEach(tag => {
            spendingByTag[tag] = (spendingByTag[tag] || 0) + splitAmount;
          });
        }
      });

    // Item count: only real purchases — a refund isn't "an item bought",
    // it's the undoing of one, so it doesn't add or subtract from the
    // count. Deliberately NOT split across tags like the dollar amount
    // is: an item with two tags genuinely counts once toward each one,
    // since this answers "how many items touch this tag", not "how do
    // dollars divide across tags".
    transactions
      .filter(t => t.type === 'purchase' && !t.is_subscription)
      .forEach(t => {
        let txTags = [];
        try { txTags = JSON.parse(t.tags || '[]'); } catch { }

        if (txTags.length === 0) {
          countByTag['Untagged'] = (countByTag['Untagged'] || 0) + 1;
        } else {
          txTags.forEach(tag => {
            countByTag[tag] = (countByTag[tag] || 0) + 1;
          });
        }
      });

    const allTags = new Set([...Object.keys(spendingByTag), ...Object.keys(countByTag)]);

    const data = Array.from(allTags).map(tag => ({
      name: tag,
      amount: Math.max(0, spendingByTag[tag] || 0), // Floor at zero so chart doesn't break if refunds > purchases
      count: countByTag[tag] || 0,
    }));

    const sortKey = viewMode === 'count' ? 'count' : 'amount';
    return data.sort((a, b) => b[sortKey] - a[sortKey]);
  }, [transactions, viewMode]);

  const getColorForTag = (tagName) => {
    if (tagName === 'Untagged') return '#64748b';
    const tagObj = tagsList.find(t => t.name === tagName);
    return tagObj ? tagObj.color : '#6366f1'; 
  };

  if (chartData.length === 0) {
    return (
      <div className="h-full min-h-[150px] flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-lg border border-slate-700/50 mt-2">
        Not enough data.
      </div>
    );
  }

  return (
    <div className="h-full w-full pt-4 min-h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#94a3b8" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            allowDecimals={viewMode === 'amount'}
            tickFormatter={(value) => viewMode === 'count' ? value : `$${value}`}
          />
          <Tooltip 
            cursor={{ fill: '#334155', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
            itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
            formatter={(value) => viewMode === 'count'
              ? [`${value} item${value === 1 ? '' : 's'}`, 'Purchased']
              : [`$${value.toFixed(2)}`, 'Spent']
            }
          />
          <Bar dataKey={viewMode === 'count' ? 'count' : 'amount'} radius={[4, 4, 0, 0]} maxBarSize={50}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColorForTag(entry.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}