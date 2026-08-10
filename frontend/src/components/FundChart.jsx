import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Maximize2, X, RotateCcw } from 'lucide-react';

export default function FundChart({ transactions, timeRange }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dateWindowOffset, setDateWindowOffset] = useState(0); 
  const [zoomLevel, setZoomLevel] = useState(180); 

  useEffect(() => {
    setDateWindowOffset(0);
    if (timeRange === '7d') setZoomLevel(14);       
    else if (timeRange === '30d') setZoomLevel(60);  
    else if (timeRange === '1y') setZoomLevel(400);  
    else setZoomLevel(365);                          
  }, [timeRange]);

  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const sorted = [...transactions].sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date));
    
    // Group net changes by date
    const grouped = {};
    sorted.forEach(t => {
      if (!grouped[t.purchase_date]) grouped[t.purchase_date] = 0;
      
      // UPDATED MATH: Add refunds and deposits, subtract purchases. No double counting!
      const amount = (t.type === 'adjustment' || t.type === 'deposit' || t.type === 'refund') 
        ? t.amount 
        : -t.amount;
        
      grouped[t.purchase_date] += amount;
    });

    const startDate = new Date(sorted[0].purchase_date);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Build continuous historical daily ledger up to Today
    const data = [];
    
    let curr = new Date(startDate);

    // Find the latest date we need to project to
    const lastTxDate = new Date(sorted[sorted.length - 1].purchase_date);
    const maxDate = new Date(Math.max(today.getTime(), lastTxDate.getTime()) + (180 * 24 * 60 * 60 * 1000));

    let activeBal = 0;

    // Deduplicate subscriptions. Collapse to ONE anchor per distinct subscription
    const latestSubByKey = {};
    transactions.filter(t => t.is_subscription).forEach(t => {
      const key = t.subscription_id ?? `${t.title}|${t.billing_cycle}`;
      if (!latestSubByKey[key] || new Date(t.purchase_date) > new Date(latestSubByKey[key].purchase_date)) {
        latestSubByKey[key] = t;
      }
    });

    // FIX: this used to project every subscription forward forever,
    // regardless of whether it had been stopped — it only ever looked at
    // title/billing_cycle/amount, never subscription_status. Every
    // subscription-payment row already carries the CURRENT status of its
    // subscription (joined server-side), so a cancelled one is filtered
    // out here before the forward-projection loop runs. Its real past
    // payments are untouched — they're already baked into `grouped`
    // above — only future projection stops.
    const subs = Object.values(latestSubByKey).filter(sub => sub.subscription_status !== 'cancelled');

    // Generate a point for EVERY SINGLE DAY so lines are precise and flat when no changes occur
    while (curr <= maxDate) {
      const dStr = curr.toISOString().split('T')[0];
      const isFuture = dStr > todayStr;

      // Apply historical transactions if any occurred on this day
      if (grouped[dStr]) {
        activeBal += grouped[dStr];
      }

      // Only re-simulate recurring charges for days AFTER today
      if (isFuture) {
        subs.forEach(sub => {
          const subDate = new Date(sub.purchase_date);
          const diffTime = Date.UTC(curr.getFullYear(), curr.getMonth(), curr.getDate()) - Date.UTC(subDate.getFullYear(), subDate.getMonth(), subDate.getDate());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 0) {
            let hit = false;
            if (sub.billing_cycle === 'weekly' && diffDays % 7 === 0) hit = true;
            if (sub.billing_cycle === 'monthly' && curr.getDate() === subDate.getDate()) hit = true;
            if (sub.billing_cycle === 'yearly' && curr.getMonth() === subDate.getMonth() && curr.getDate() === subDate.getDate()) hit = true;
            if (sub.billing_cycle?.includes('days')) {
              const days = parseInt(sub.billing_cycle);
              if (days > 0 && diffDays % days === 0) hit = true;
            }
            if (hit) {
              // UPDATED MATH: Add recurring deposits, subtract recurring purchases
              if (sub.type === 'deposit') {
                activeBal += sub.amount;
              } else {
                activeBal -= sub.amount; // Ignore refunded amounts during future projections
              }
            }
          }
        });
      }

      data.push({
        date: dStr,
        actual: isFuture ? null : activeBal,
        predicted: isFuture ? activeBal : (dStr === todayStr ? activeBal : null)
      });

      curr.setDate(curr.getDate() + 1);
    }

    return data;
  }, [transactions]);

  const visibleData = useMemo(() => {
    if (chartData.length === 0) return [];
    
    const today = new Date();
    const centerDate = new Date(today);
    centerDate.setDate(centerDate.getDate() + dateWindowOffset);

    const halfWindow = zoomLevel / 2;
    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - halfWindow);
    
    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + halfWindow);

    return chartData.filter(d => {
      const dTime = new Date(d.date).getTime();
      return dTime >= startDate.getTime() && dTime <= endDate.getTime();
    });
  }, [chartData, dateWindowOffset, zoomLevel]);

  const yAxisDomain = useMemo(() => {
    if (visibleData.length === 0) return [0, 100];
    const allValues = visibleData.flatMap(d => [d.actual, d.predicted]).filter(v => v !== null && v !== undefined);
    if (allValues.length === 0) return [0, 100];

    const maxVal = Math.max(...allValues);
    const minVal = Math.min(...allValues);
    
    const topHeadroom = Math.max(Math.abs(maxVal) * 0.15, 50);
    const bottomPadding = minVal < 0 ? Math.abs(minVal) * 0.15 : 20;

    return [minVal < 0 ? minVal - bottomPadding : 0, maxVal + topHeadroom];
  }, [visibleData]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    if (Math.abs(deltaX) > 8) {
      const daysShifted = Math.round(deltaX / 15);
      setDateWindowOffset(prev => prev - daysShifted);
      setDragStartX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel(prev => Math.max(10, prev - 20)); 
    } else {
      setZoomLevel(prev => Math.min(365, prev + 20)); 
    }
  };

  const formatXAxis = (tickItem) => {
    const d = new Date(tickItem);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const monthlyTicks = useMemo(() => {
    const ticks = [];
    if (visibleData.length === 0) return ticks;

    const start = new Date(visibleData[0].date);
    const end = new Date(visibleData[visibleData.length - 1].date);
    
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      ticks.push(current.toISOString().split('T')[0]);
      current.setMonth(current.getMonth() + 1);
    }
    return ticks;
  }, [visibleData]);

  const customXAxisTicks = useMemo(() => {
    if (visibleData.length === 0) return [];
    const allDates = visibleData.map(d => d.date);
    return Array.from(new Set([...allDates, ...monthlyTicks])).sort((a, b) => new Date(a) - new Date(b));
  }, [visibleData, monthlyTicks]);

  const computeOffset = (values) => {
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (max === min) return 1;
    return max / (max - min);
  };

  const strokeFor = (values, gradientId, positiveColor, negativeColor) => {
    if (values.length === 0) return positiveColor;
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (min >= 0) return positiveColor; 
    if (max <= 0) return negativeColor; 
    return `url(#${gradientId})`; 
  };

  const { actualOffset, predictedOffset, actualStroke, predictedStroke } = useMemo(() => {
    const actualValues = visibleData.map(d => d.actual).filter(v => v !== null && v !== undefined);
    const predictedValues = visibleData.map(d => d.predicted).filter(v => v !== null && v !== undefined);
    return {
      actualOffset: computeOffset(actualValues),
      predictedOffset: computeOffset(predictedValues),
      actualStroke: strokeFor(actualValues, 'splitColorActual', '#10b981', '#f43f5e'),
      predictedStroke: strokeFor(predictedValues, 'splitColorPredicted', '#6366f1', '#f43f5e'),
    };
  }, [visibleData]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-700/50">
        Add some purchases or adjustments to see your trajectory.
      </div>
    );
  }

  const renderChart = (containerHeight) => (
    <div 
      className="w-full relative cursor-grab active:cursor-grabbing select-none"
      style={{ height: containerHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={visibleData} margin={{ top: 25, right: 10, left: -10, bottom: 10 }}>
          <defs>
            <linearGradient id="splitColorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset={actualOffset} stopColor="#10b981" stopOpacity={1} />
              <stop offset={actualOffset} stopColor="#f43f5e" stopOpacity={1} />
            </linearGradient>

            <linearGradient id="splitColorPredicted" x1="0" y1="0" x2="0" y2="1">
              <stop offset={predictedOffset} stopColor="#6366f1" stopOpacity={1} />
              <stop offset={predictedOffset} stopColor="#f43f5e" stopOpacity={1} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          
          {monthlyTicks.map((tickDate) => (
            <ReferenceLine key={tickDate} x={tickDate} stroke="#475569" strokeDasharray="2 2" strokeOpacity={0.6} />
          ))}

          <XAxis 
            dataKey="date" 
            stroke="#94a3b8" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatXAxis}
            ticks={customXAxisTicks}
            dy={10}
            minTickGap={40}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={yAxisDomain} 
            tickFormatter={(value) => `$${Math.round(value)}`}
          />
          <Tooltip 
            cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '3 3' }}
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
            labelFormatter={(label) => formatXAxis(label)}
            formatter={(value, name) => [`$${value.toFixed(2)}`, name === 'actual' ? 'Past Record' : 'Future Projection']}
          />
          
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.7} />
          <ReferenceLine x={new Date().toISOString().split('T')[0]} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: 'Today', fill: '#94a3b8', fontSize: 12 }} />
          
          <Line dataKey="actual" stroke={actualStroke} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} name="actual" />
          <Line dataKey="predicted" stroke={predictedStroke} strokeWidth={2.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 5 }} name="predicted" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <>
      <div className="relative group">
        <div className="absolute top-0 right-0 flex gap-2 z-20">
          {(dateWindowOffset !== 0) && (
            <button 
              onClick={() => { setDateWindowOffset(0); }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white p-2 rounded-lg transition-colors shadow-md flex items-center gap-1 text-xs font-medium"
              title="Reset View"
            >
              <RotateCcw size={14} /> Reset Pan
            </button>
          )}
          <button 
            onClick={() => setIsFullscreen(true)}
            className="bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white p-2 rounded-lg transition-colors shadow-md flex items-center gap-1 text-xs font-medium"
            title="Open Fullscreen"
          >
            <Maximize2 size={14} /> Fullscreen
          </button>
        </div>
        {renderChart(330)}
      </div>

      {isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-8 cursor-zoom-out"
          onClick={() => setIsFullscreen(false)}
        >
          <button 
            className="absolute top-6 right-6 text-slate-400 hover:text-white bg-slate-900/50 p-3 rounded-full transition-colors z-50 shadow-xl"
            onClick={() => setIsFullscreen(false)}
          >
            <X size={24} />
          </button>
          
          <div 
            className="w-full h-full max-w-6xl max-h-[85vh] bg-slate-800 border border-slate-700 rounded-2xl p-8 flex flex-col justify-center cursor-default shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex justify-between items-center border-b border-slate-700 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Fund Trajectory (Expanded View)</h2>
                <p className="text-sm text-slate-400">Click and drag horizontally to pan through history/future, or scroll to zoom in/out.</p>
              </div>
              <button 
                onClick={() => { setDateWindowOffset(0); }}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              >
                <RotateCcw size={14} /> Reset Pan
              </button>
            </div>
            <div className="flex-1 flex items-center">
              {renderChart(550)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}