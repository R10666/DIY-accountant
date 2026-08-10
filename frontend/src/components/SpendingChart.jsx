import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function SpendingChart({ transactions, tagsList }) {
  const chartData = useMemo(() => {
    const purchases = transactions.filter(t => t.type === 'purchase' && !t.is_subscription);
    const spendingByTag = {};

    purchases.forEach(t => {
      const amount = t.amount - (t.refunded_amount || 0);
      if (amount <= 0) return; 

      let txTags = [];
      try { txTags = JSON.parse(t.tags || '[]'); } catch { }

      if (txTags.length === 0) {
        spendingByTag['Untagged'] = (spendingByTag['Untagged'] || 0) + amount;
      } else {
        const splitAmount = amount / txTags.length;
        txTags.forEach(tag => {
          spendingByTag[tag] = (spendingByTag[tag] || 0) + splitAmount;
        });
      }
    });

    return Object.keys(spendingByTag)
      .map(tag => ({
        name: tag,
        amount: spendingByTag[tag]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

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
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            cursor={{ fill: '#334155', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
            itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
            formatter={(value) => [`$${value.toFixed(2)}`, 'Spent']}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={50}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColorForTag(entry.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}