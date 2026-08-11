import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Maximize2, X, RotateCcw } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_YEARS_DAYS = 365 * 5;

// Past/future window (in days) shown BY DEFAULT for each timeframe
// preset — deliberately asymmetric. "1y" means "show the past year,
// plus a modest look-ahead", not "200 days on either side of today".
// 'all' is computed dynamically (see getAllTimePastDays below) since it
// depends on how old the account's data actually is.
const PRESET_WINDOWS = {
  '7d': { past: 7, future: 5 },
  '30d': { past: 30, future: 14 },
  '1y': { past: 365, future: 60 },
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export default function FundChart({ transactions, timeRange }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dateWindowOffset, setDateWindowOffset] = useState(0);
  const [pastDays, setPastDays] = useState(365);
  const [futureDays, setFutureDays] = useState(60);

  // The real first transaction date, if any — used both to decide how
  // far back to actually generate data, and to size the "All Time"
  // default window to the account's real age (capped at 5 years).
  const earliestDate = useMemo(() => {
    if (!transactions || transactions.length === 0) return null;
    return transactions.reduce((min, t) => (!min || t.purchase_date < min) ? t.purchase_date : min, null);
  }, [transactions]);

  const getAllTimePastDays = () => {
    if (!earliestDate) return FIVE_YEARS_DAYS;
    const today = new Date();
    const first = new Date(earliestDate);
    const accountAgeDays = Math.ceil((today - first) / DAY_MS) + 30; // small buffer so the first point isn't jammed at the very edge
    return clamp(accountAgeDays, 30, FIVE_YEARS_DAYS);
  };

  const applyPreset = (range) => {
    setDateWindowOffset(0);
    if (PRESET_WINDOWS[range]) {
      setPastDays(PRESET_WINDOWS[range].past);
      setFutureDays(PRESET_WINDOWS[range].future);
    } else {
      // 'all'
      setPastDays(getAllTimePastDays());
      setFutureDays(90);
    }
  };

  useEffect(() => {
    applyPreset(timeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, earliestDate]);

  const chartData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const sorted = [...transactions].sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date));

    // Group net changes by date
    const grouped = {};
    sorted.forEach(t => {
      if (!grouped[t.purchase_date]) grouped[t.purchase_date] = 0;
      const amount = (t.type === 'adjustment' || t.type === 'deposit' || t.type === 'refund')
        ? t.amount
        : -t.amount;
      grouped[t.purchase_date] += amount;
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // FIX: this used to start generation exactly at the first real
    // transaction, so any window requesting more history than actually
    // existed (e.g. the "1y" preset on a 2-month-old account, or "All
    // Time" on any account at all) just came up short — the chart was
    // never as wide as the selected timeframe implied. Generation now
    // always starts at least 5 years back (padded with a flat $0
    // balance for days before any real activity), OR at the true first
    // transaction if that's even earlier — so real history is never
    // truncated, and every timeframe preset always has a fully
    // populated window to draw from, however sparse the actual account.
    const realFirstDate = new Date(sorted[0].purchase_date);
    const fiveYearsAgo = new Date(today);
    fiveYearsAgo.setDate(fiveYearsAgo.getDate() - FIVE_YEARS_DAYS);
    const startDate = realFirstDate < fiveYearsAgo ? realFirstDate : fiveYearsAgo;

    // Generous forward buffer (2 years) so panning into the future stays
    // possible well beyond any preset's default future window.
    const lastTxDate = new Date(sorted[sorted.length - 1].purchase_date);
    const maxDate = new Date(Math.max(today.getTime(), lastTxDate.getTime()) + (730 * DAY_MS));

    const data = [];
    let curr = new Date(startDate);
    let activeBal = 0;

    // Deduplicate subscriptions. Collapse to ONE anchor per distinct subscription
    const latestSubByKey = {};
    transactions.filter(t => t.is_subscription).forEach(t => {
      const key = t.subscription_id ?? `${t.title}|${t.billing_cycle}`;
      if (!latestSubByKey[key] || new Date(t.purchase_date) > new Date(latestSubByKey[key].purchase_date)) {
        latestSubByKey[key] = t;
      }
    });

    // Only project forward for subscriptions that are still active —
    // cancelled ones keep their real past payments (already in
    // `grouped`) but stop generating anything further.
    const subs = Object.values(latestSubByKey).filter(sub => sub.subscription_status !== 'cancelled');

    while (curr <= maxDate) {
      const dStr = curr.toISOString().split('T')[0];
      const isFuture = dStr > todayStr;

      if (grouped[dStr]) {
        activeBal += grouped[dStr];
      }

      if (isFuture) {
        subs.forEach(sub => {
          const subDate = new Date(sub.purchase_date);
          const diffTime = Date.UTC(curr.getFullYear(), curr.getMonth(), curr.getDate()) - Date.UTC(subDate.getFullYear(), subDate.getMonth(), subDate.getDate());
          const diffDays = Math.floor(diffTime / DAY_MS);

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
              if (sub.type === 'deposit') activeBal += sub.amount;
              else activeBal -= sub.amount;
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

    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - pastDays);

    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + futureDays);

    return chartData.filter(d => {
      const dTime = new Date(d.date).getTime();
      return dTime >= startDate.getTime() && dTime <= endDate.getTime();
    });
  }, [chartData, dateWindowOffset, pastDays, futureDays]);

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

  const isPanned = dateWindowOffset !== 0 || (PRESET_WINDOWS[timeRange]
    ? (pastDays !== PRESET_WINDOWS[timeRange].past || futureDays !== PRESET_WINDOWS[timeRange].future)
    : (pastDays !== getAllTimePastDays() || futureDays !== 90));

  const resetView = () => applyPreset(timeRange);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    if (Math.abs(deltaX) > 8) {
      // Scale the drag-to-days ratio with the current window size, so
      // panning a multi-year "All Time" view doesn't take forever, while
      // a 7-day view stays precise.
      const totalWindow = pastDays + futureDays;
      const pxPerDay = Math.max(2, 800 / totalWindow);
      const daysShifted = Math.round(deltaX / pxPerDay);
      setDateWindowOffset(prev => prev - daysShifted);
      setDragStartX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.15; // zoom in shrinks the window, zoom out grows it
    setPastDays(prev => clamp(Math.round(prev * factor), 3, FIVE_YEARS_DAYS * 2));
    setFutureDays(prev => clamp(Math.round(prev * factor), 2, 1000));
  };

  const formatXAxis = (tickItem) => {
    const d = new Date(tickItem);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    const totalWindow = pastDays + futureDays;
    // Include the year once windows get wide enough that month/day alone
    // would be ambiguous across year boundaries.
    return totalWindow > 400
      ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Vertical reference lines marking each month boundary — purely
  // decorative, so no need to worry about this scaling to thousands of
  // entries the way axis ticks would.
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

  // FIX: this used to put a tick at EVERY visible day plus every month
  // boundary — fine for a ~200 day window, but once "All Time" can span
  // 5 years that's 1800+ tick entries handed to Recharts. Ticks now
  // scale with the size of the visible window instead: dense for short
  // windows, sparser for long ones, always anchored at the first/last
  // visible date so the axis never looks like it's floating.
  const customXAxisTicks = useMemo(() => {
    if (visibleData.length === 0) return [];

    const start = new Date(visibleData[0].date);
    const end = new Date(visibleData[visibleData.length - 1].date);
    const totalDays = Math.round((end - start) / DAY_MS);

    const ticks = [];

    if (totalDays <= 16) {
      let current = new Date(start);
      while (current <= end) {
        ticks.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 2);
      }
    } else if (totalDays <= 70) {
      let current = new Date(start);
      while (current <= end) {
        ticks.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
      }
    } else if (totalDays <= 500) {
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      if (current < start) current.setMonth(current.getMonth() + 1);
      while (current <= end) {
        ticks.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      if (current < start) current.setMonth(current.getMonth() + 1);
      while (current <= end) {
        ticks.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 3);
      }
    }

    const firstStr = visibleData[0].date;
    const lastStr = visibleData[visibleData.length - 1].date;
    if (!ticks.includes(firstStr)) ticks.unshift(firstStr);
    if (!ticks.includes(lastStr)) ticks.push(lastStr);

    return Array.from(new Set(ticks)).sort();
  }, [visibleData]);

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
            labelFormatter={(label) => {
              const d = new Date(label);
              d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }}
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
          {isPanned && (
            <button
              onClick={resetView}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white p-2 rounded-lg transition-colors shadow-md flex items-center gap-1 text-xs font-medium"
              title="Reset View"
            >
              <RotateCcw size={14} /> Reset View
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
        {renderChart(295)}
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
                onClick={resetView}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
              >
                <RotateCcw size={14} /> Reset View
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