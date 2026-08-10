import React, { useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, ArrowRight, Calendar, StopCircle, PlayCircle, Trash2 } from 'lucide-react';
import { updateSubscription, deleteSubscription } from '../api';

// `subscriptions` now comes straight from GET /api/subscriptions — status,
// payment_count, lifetime_total, and next_due_date are all computed
// server-side, so there's no more client-side grouping/derivation logic
// here at all. `transactions` (the unified ledger) is only used to look
// up the exact latest payment row for a subscription when the user opens
// "View Details".
export default function Subscriptions({ subscriptions, transactions, onViewDetails, refreshData }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStop = async (sub) => {
    if (!window.confirm(`Are you sure you want to stop "${sub.title}"? No further payments will be tracked until you restart it.`)) return;

    setIsProcessing(true);
    try {
      // ONE request, ONE field, ONE row.
      await updateSubscription(sub.id, { status: 'cancelled' });
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to stop subscription:", error);
      alert(`Couldn't stop "${sub.title}": ${error.message}\n\nNothing was changed — please try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestart = async (sub) => {
    const wasCompleted = sub.status === 'completed';
    const cycle = prompt(`Restart "${sub.title}" — confirm billing cycle (weekly, monthly, yearly, or "N days"):`, sub.billing_cycle);
    if (!cycle) return;

    // A subscription that finished its planned run (hit its end_date or
    // max_installments) still has those limits stored. If we just flip
    // status back to 'active' without clearing them, the next sync would
    // immediately see the limit already met and flip it straight back to
    // 'completed' — a "restart" that silently generates nothing. Confirm
    // that explicitly and clear the old limits when that's the case.
    let clearLimits = false;
    if (wasCompleted) {
      clearLimits = window.confirm(
        `"${sub.title}" already completed its full planned run${sub.max_installments ? ` (${sub.max_installments} payments)` : ''}${sub.end_date ? ` (ending ${sub.end_date})` : ''}.\n\nRestarting will clear that end condition so it continues indefinitely — set a new one afterward via "Edit End Condition" if you want it to stop again later.\n\nContinue?`
      );
      if (!clearLimits) return;
    }

    setIsProcessing(true);
    try {
      // Restarting no longer creates a new "anchor" transaction. Payments
      // just resume forward from last_payment_date the next time the
      // server syncs, since the subscription row itself never went away —
      // only its status did.
      const payload = { status: 'active', billing_cycle: cycle };
      if (clearLimits) {
        payload.end_date = null;
        payload.max_installments = null;
      }
      await updateSubscription(sub.id, payload);
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to restart subscription:", error);
      alert(`Couldn't restart "${sub.title}": ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // NEW: lets an ACTIVE subscription's end condition be set, changed, or
  // cleared without a full Stop/Restart cycle. Uses the same lightweight
  // prompt()-based pattern as Restart's billing-cycle prompt rather than
  // a full modal, to stay consistent with the existing interaction style.
  const handleEditEndCondition = async (sub) => {
    const current = sub.max_installments
      ? `after ${sub.max_installments} payments`
      : sub.end_date
        ? `on ${sub.end_date}`
        : 'never (ongoing)';

    const choice = prompt(
      `Edit when "${sub.title}" ends.\nCurrently: ${current}\n\n` +
      `Type one of:\n  "never" — remove any end condition\n  a date like 2026-12-31 — end on that date\n  a number like 12 — end after that many payments`,
      sub.max_installments ? String(sub.max_installments) : (sub.end_date || 'never')
    );
    if (choice === null) return;

    const trimmed = choice.trim();
    let payload;
    if (trimmed === '' || trimmed.toLowerCase() === 'never') {
      payload = { end_date: null, max_installments: null };
    } else if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10);
      if (n <= 0) {
        alert("Number of payments must be at least 1.");
        return;
      }
      if (n <= (sub.payment_count || 0)) {
        alert(`"${sub.title}" already has ${sub.payment_count} payment${sub.payment_count === 1 ? '' : 's'} logged — a limit of ${n} would mark it completed immediately. Choose a higher number if that's not what you want.`);
      }
      payload = { max_installments: n, end_date: null };
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      payload = { end_date: trimmed, max_installments: null };
    } else {
      alert('Not recognized — enter "never", a date as YYYY-MM-DD, or a whole number of payments.');
      return;
    }

    setIsProcessing(true);
    try {
      await updateSubscription(sub.id, payload);
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to update end condition:", error);
      alert(`Couldn't update "${sub.title}": ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // NEW: distinct from Stop — this removes the subscription AND every
  // payment in its history permanently, rather than just pausing future
  // billing. The confirmation is deliberately more explicit about that
  // difference, since it's the kind of action that's easy to reach for
  // by mistake when "Stop" was what was actually wanted.
  const handleDelete = async (sub) => {
    const paymentCount = sub.payment_count || 0;
    const confirmMessage = `Delete "${sub.title}" permanently? This removes the subscription AND all ${paymentCount} payment${paymentCount === 1 ? '' : 's'} of its history — this can't be undone.\n\nIf you just want to pause future billing and keep the history, use "Stop" instead.`;
    if (!window.confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      await deleteSubscription(sub.id);
      if (refreshData) await refreshData();
    } catch (error) {
      console.error("Failed to delete subscription:", error);
      alert(`Couldn't delete "${sub.title}": ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Build a transaction-shaped object for TransactionDetails when the user
  // clicks "View Details" — find that subscription's most recent payment
  // row in the unified ledger (matched by subscription_id, not title, so
  // two subscriptions that happen to share a name can never collide).
  const handleViewDetails = (sub) => {
    const payments = (transactions || [])
      .filter(tx => tx.is_subscription && tx.subscription_id === sub.id)
      .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date));

    if (payments.length > 0) {
      onViewDetails(payments[0]);
    } else {
      // No payment has landed yet (e.g. a future-dated subscription) —
      // synthesize a minimal transaction-shaped object so details/edit
      // still works.
      onViewDetails({
        id: null,
        subscription_id: sub.id,
        title: sub.title,
        amount: sub.amount,
        type: sub.type,
        is_subscription: true,
        billing_cycle: sub.billing_cycle,
        url: sub.url,
        notes: sub.notes,
        tags: sub.tags,
        receipt_file: sub.receipt_file,
        purchase_date: sub.start_date,
        refunded_amount: 0,
      });
    }
  };

  const expenses = subscriptions.filter(s => s.type !== 'deposit');
  const deposits = subscriptions.filter(s => s.type === 'deposit');

  const getMonthlyImpact = (sub) => {
    if (sub.status !== 'active') return 0; // Inactive/completed costs nothing further
    let amount = sub.amount;
    if (sub.billing_cycle === 'weekly') return amount * (52 / 12);
    if (sub.billing_cycle === 'yearly') return amount / 12;
    if (sub.billing_cycle?.includes('days')) {
      const days = parseInt(sub.billing_cycle);
      if (days > 0) return amount * (30 / days);
    }
    return amount;
  };

  const formatNextDue = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // A subscription's status is one of 'active' | 'cancelled' | 'completed'.
  // 'completed' means it finished its own planned run (hit end_date or
  // max_installments) rather than being manually stopped — worth telling
  // apart from a plain Stop, so it doesn't look like something the user
  // did or forgot to do.
  const statusInfo = (sub) => {
    if (sub.status === 'active') return { label: 'Active', className: 'bg-emerald-900/60 text-emerald-400' };
    if (sub.status === 'completed') return { label: 'Completed', className: 'bg-indigo-900/60 text-indigo-400' };
    return { label: 'Inactive', className: 'bg-slate-700 text-slate-400' };
  };

  // Only calculate totals using ACTIVE subscriptions
  const monthlyExpenseTotal = expenses.reduce((acc, sub) => acc + getMonthlyImpact(sub), 0);
  const monthlyDepositTotal = deposits.reduce((acc, sub) => acc + getMonthlyImpact(sub), 0);
  const netMonthly = monthlyDepositTotal - monthlyExpenseTotal;
  const activeExpenseCount = expenses.filter(e => e.status === 'active').length;
  const activeDepositCount = deposits.filter(d => d.status === 'active').length;

  const renderList = (subs, isIncome) => {
    if (subs.length === 0) {
      return (
        <div className="p-8 text-center text-slate-500 bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
          No recurring {isIncome ? 'deposits' : 'expenses'} found.
        </div>
      );
    }

    // Sort: Active items top, everything else (cancelled/completed) below. Then by highest price.
    const sortedSubs = [...subs].sort((a, b) => {
      const aActive = a.status === 'active';
      const bActive = b.status === 'active';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return b.amount - a.amount;
    });

    return (
      <div className="flex flex-col gap-4">
        {sortedSubs.map(sub => {
          const isActive = sub.status === 'active';
          const monthlyAmount = getMonthlyImpact(sub);
          const status = statusInfo(sub);

          // "Ends" summary shown under the billing-cycle chip: the plan
          // as set, regardless of current status, so it's visible even
          // on a completed/cancelled card.
          const endSummary = sub.max_installments
            ? `${Math.min(sub.payment_count, sub.max_installments)}/${sub.max_installments} payments`
            : sub.end_date
              ? `Ends ${sub.end_date}`
              : null;

          return (
            <div key={sub.id} className={`rounded-xl p-5 border transition-all ${isActive ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-lg' : 'bg-slate-800/40 border-slate-700/50 opacity-80'}`}>

              <div className="flex justify-between items-start mb-5">
                <div className="pr-4">
                  <div className="flex items-center gap-3">
                    <h4 className={`text-lg font-bold ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>{sub.title}</h4>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {isActive && (
                      <span className="inline-block text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                        {sub.billing_cycle}
                      </span>
                    )}
                    {endSummary && (
                      <span className="inline-block text-[10px] uppercase font-bold text-slate-400 tracking-wider bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                        {endSummary}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className={`text-2xl font-bold ${isActive ? (isIncome ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                    {isIncome ? '+' : '-'}${sub.amount.toFixed(2)}
                  </div>
                  {isActive && sub.billing_cycle !== 'monthly' && (
                    <div className="text-xs text-slate-500 mt-1">
                      (~${monthlyAmount.toFixed(2)}/mo)
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between pt-4 border-t border-slate-700/50">
                <div className="flex flex-wrap gap-x-8 gap-y-4">

                  <div>
                    <p className="text-[11px] text-slate-500 mb-1 uppercase font-semibold tracking-wider">Next Payment</p>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                      <Calendar size={14} className={isActive ? (isIncome ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-600'} />
                      {isActive ? formatNextDue(sub.next_due_date) : '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] text-slate-500 mb-1 uppercase font-semibold tracking-wider">
                      Lifetime {isIncome ? 'Deposited' : 'Spent'}
                    </p>
                    <p className={`text-sm font-medium ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
                      ${sub.lifetime_total.toFixed(2)}
                      <span className="text-slate-500 font-normal ml-1">({sub.payment_count} payments)</span>
                    </p>
                  </div>

                </div>

                <div className="flex gap-2 shrink-0 ml-4">
                  {isActive ? (
                    <>
                      <button
                        onClick={() => handleStop(sub)}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 px-3 py-2.5 rounded-lg transition-colors border border-rose-900/60 hover:border-rose-700 shadow-sm disabled:opacity-50"
                        title="Stop Subscription"
                      >
                        <StopCircle size={18} />
                        <span className="text-sm font-medium">{isProcessing ? 'Stopping…' : 'Stop'}</span>
                      </button>
                      <button
                        onClick={() => handleEditEndCondition(sub)}
                        disabled={isProcessing}
                        className="bg-slate-800 hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-400 p-2.5 rounded-lg transition-colors border border-slate-700 hover:border-indigo-800 shadow-sm disabled:opacity-50 flex items-center justify-center"
                        title="Edit When This Ends"
                      >
                        <Calendar size={18} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestart(sub)}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-900/40 text-emerald-400 hover:text-emerald-300 px-3 py-2.5 rounded-lg transition-colors border border-emerald-900/60 hover:border-emerald-700 shadow-sm disabled:opacity-50"
                      title="Restart Subscription"
                    >
                      <PlayCircle size={18} />
                      <span className="text-sm font-medium">{isProcessing ? 'Restarting…' : 'Restart'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(sub)}
                    disabled={isProcessing}
                    className="bg-slate-800 hover:bg-rose-900/40 text-slate-500 hover:text-rose-400 p-2.5 rounded-lg transition-colors border border-slate-700 hover:border-rose-800 shadow-sm disabled:opacity-50 flex items-center justify-center"
                    title="Delete Subscription Permanently (removes all history)"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    onClick={() => handleViewDetails(sub)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-2.5 rounded-lg transition-colors border border-slate-600 shadow-sm flex items-center justify-center"
                    title="View Details"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-rose-400 mb-2">
            <TrendingDown size={18} />
            <h3 className="font-medium text-sm">Monthly Expenses</h3>
          </div>
          <span className="text-3xl font-bold text-white">
            ${monthlyExpenseTotal.toFixed(2)}
          </span>
          <p className="text-xs text-slate-400 mt-2">{activeExpenseCount} active subscriptions</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <TrendingUp size={18} />
            <h3 className="font-medium text-sm">Monthly Income</h3>
          </div>
          <span className="text-3xl font-bold text-white">
            ${monthlyDepositTotal.toFixed(2)}
          </span>
          <p className="text-xs text-slate-400 mt-2">{activeDepositCount} recurring deposits</p>
        </div>

        <div className={`rounded-xl p-6 border flex flex-col justify-center relative overflow-hidden ${netMonthly >= 0 ? 'bg-emerald-900/20 border-emerald-900/50' : 'bg-rose-900/20 border-rose-900/50'}`}>
          <div className="relative z-10">
            <div className={`flex items-center gap-2 mb-2 ${netMonthly >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <RefreshCw size={18} />
              <h3 className="font-medium text-sm">Net Monthly Cashflow</h3>
            </div>
            <span className="text-3xl font-bold text-white">
              {netMonthly >= 0 ? '+' : '-'}${Math.abs(netMonthly).toFixed(2)}
            </span>
            <p className="text-xs text-slate-400 mt-2">Guaranteed recurring impact</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-700 bg-slate-800">
            <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp size={20} /> Recurring Income
            </h2>
          </div>
          <div className="p-5 bg-slate-900/40">
            {renderList(deposits, true)}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-700 bg-slate-800">
            <h2 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <TrendingDown size={20} /> Recurring Expenses
            </h2>
          </div>
          <div className="p-5 bg-slate-900/40">
            {renderList(expenses, false)}
          </div>
        </div>
      </div>
    </div>
  );
}