// localDB.js — a browser-only replacement for api.js. Same function
// names, same return shapes, same recurring-payment logic — but backed
// by IndexedDB instead of HTTP calls to a FastAPI server. The intent is
// that components eventually just switch which of these two files they
// import from, rather than needing their own logic rewritten.
//
// One deliberate limitation: getLinkPreview() can't scrape a URL's
// title/image the way the old server-side version could — browsers
// block a page's JS from directly reading another site's HTML
// cross-origin (CORS). It returns a graceful fallback instead of trying
// to fake that.

const DB_NAME = 'diy-accountant';
const DB_VERSION = 1;

// ---------- Low-level IndexedDB plumbing ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('subscriptions')) {
        db.createObjectStore('subscriptions', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('subscription_payments')) {
        const store = db.createObjectStore('subscription_payments', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_subscription_id', 'subscription_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'name' });
      }
      // Receipt files are stored as raw Blobs, addressed by an integer id.
      // A transaction/subscription's receipt_file field holds a reference
      // string like "idb-file:7" rather than a real URL, since object
      // URLs (URL.createObjectURL) only last for the current page load —
      // getFileURL() below re-derives a fresh one from the stored Blob
      // whenever a component needs to actually render it.
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map(name => [name, transaction.objectStore(name)]))
      : transaction.objectStore(storeNames);

    let result;
    Promise.resolve(work(stores))
      .then(r => { result = r; })
      .catch(reject);

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(store) {
  return reqToPromise(store.getAll());
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

// ---------- Billing-cycle math (ported 1:1 from the Python backend's
// subscription_sync.py, so behavior matches exactly) ----------

function advance(dateStr, cycle) {
  const d = new Date(dateStr + 'T00:00:00Z');

  if (cycle === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (cycle === 'monthly') {
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + 1);
    // If the month rolled over past its own end (e.g. Jan 31 -> Mar 3),
    // clamp back to the last day of the intended month, same as the
    // Python version's explicit days-in-month table.
    if (d.getUTCDate() !== day) {
      d.setUTCDate(0);
    }
  } else if (cycle === 'yearly') {
    const month = d.getUTCMonth(), day = d.getUTCDate();
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    if (d.getUTCMonth() !== month) {
      // Only reachable for Feb 29 -> non-leap year; clamp to Feb 28.
      d.setUTCMonth(month + 1, 0);
    } else {
      d.setUTCDate(day);
    }
  } else if (cycle && cycle.endsWith('days')) {
    const days = parseInt(cycle, 10);
    if (!Number.isFinite(days) || days <= 0) return null;
    d.setUTCDate(d.getUTCDate() + days);
  } else {
    return null;
  }

  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// The single authoritative place recurring payments get generated —
// mirrors sync_subscription_payments() in the Python backend exactly,
// including the end_date/max_installments completion logic.
async function syncSubscriptionPayments(db) {
  await tx(db, ['subscriptions', 'subscription_payments'], 'readwrite', async (stores) => {
    const subs = (await getAll(stores.subscriptions)).filter(s => s.status === 'active');
    const today = todayStr();

    for (const sub of subs) {
      const allPayments = await new Promise((resolve, reject) => {
        const idx = stores.subscription_payments.index('by_subscription_id');
        const req = idx.getAll(sub.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      let paymentCount = allPayments.length;
      let lastPaid = allPayments.reduce((max, p) => (!max || p.purchase_date > max) ? p.purchase_date : max, null);
      let anchor = lastPaid || sub.start_date;

      const limitReached = (count) => sub.max_installments != null && count >= sub.max_installments;

      let completed = false;

      const insertPayment = (date) => {
        stores.subscription_payments.add({
          subscription_id: sub.id,
          amount: sub.amount,
          purchase_date: date,
          refunded_amount: 0,
        });
        paymentCount += 1;
      };

      if (!lastPaid && anchor <= today) {
        if (sub.end_date && anchor > sub.end_date) {
          completed = true;
        } else if (!limitReached(paymentCount)) {
          insertPayment(anchor);
          if (limitReached(paymentCount)) completed = true;
        }
      }

      let safety = 0;
      while (!completed) {
        safety += 1;
        if (safety > 2000) break; // guard against a malformed cycle looping forever
        const nxt = advance(anchor, sub.billing_cycle);
        if (!nxt || nxt > today) break;
        if (sub.end_date && nxt > sub.end_date) { completed = true; break; }
        insertPayment(nxt);
        anchor = nxt;
        if (limitReached(paymentCount)) { completed = true; break; }
      }

      if (completed) {
        stores.subscriptions.put({ ...sub, status: 'completed' });
      }
    }
  });
}

// ---------- Unified ledger ----------

export async function getTransactions() {
  const db = await getDb();
  await syncSubscriptionPayments(db);

  return tx(db, ['transactions', 'subscriptions', 'subscription_payments'], 'readonly', async (stores) => {
    const oneOffs = (await getAll(stores.transactions)).map(t => ({
      ...t,
      is_subscription: false,
      billing_cycle: null,
      subscription_id: null,
      subscription_status: null,
    }));

    const subs = await getAll(stores.subscriptions);
    const subsById = Object.fromEntries(subs.map(s => [s.id, s]));
    const payments = (await getAll(stores.subscription_payments)).map(p => {
      const s = subsById[p.subscription_id];
      return {
        id: p.id,
        title: s?.title,
        amount: p.amount,
        type: s?.type,
        billing_cycle: s?.billing_cycle,
        url: s?.url,
        purchase_date: p.purchase_date,
        receipt_file: s?.receipt_file,
        notes: s?.notes,
        tags: s?.tags,
        refunded_amount: p.refunded_amount || 0,
        subscription_id: s?.id,
        subscription_status: s?.status,
        is_subscription: true,
      };
    });

    const combined = [...oneOffs, ...payments];
    combined.sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : a.purchase_date > b.purchase_date ? -1 : 0));
    return { transactions: combined };
  });
}

// ---------- One-off transactions ----------

export async function createTransaction(payload) {
  const db = await getDb();
  return tx(db, 'transactions', 'readwrite', (store) => {
    store.add({ tags: '[]', refunded_amount: 0, ...payload });
  });
}

export async function updateTransaction(id, payload) {
  const db = await getDb();
  return tx(db, 'transactions', 'readwrite', async (store) => {
    const existing = await reqToPromise(store.get(id));
    if (!existing) return;
    store.put({ ...existing, ...payload });
  });
}

export async function deleteTransaction(id) {
  const db = await getDb();
  return tx(db, 'transactions', 'readwrite', (store) => {
    store.delete(id);
  });
}

// ---------- Subscriptions ----------

export async function getSubscriptions() {
  const db = await getDb();
  await syncSubscriptionPayments(db);

  return tx(db, ['subscriptions', 'subscription_payments'], 'readonly', async (stores) => {
    const subs = await getAll(stores.subscriptions);
    subs.sort((a, b) => a.title.localeCompare(b.title));

    for (const sub of subs) {
      const payments = await new Promise((resolve, reject) => {
        const idx = stores.subscription_payments.index('by_subscription_id');
        const req = idx.getAll(sub.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      sub.payment_count = payments.length;
      sub.lifetime_total = payments.reduce((sum, p) => sum + (p.amount - (p.refunded_amount || 0)), 0);
      sub.last_payment_date = payments.reduce((max, p) => (!max || p.purchase_date > max) ? p.purchase_date : max, null);
      sub.next_due_date = sub.status === 'active'
        ? advance(sub.last_payment_date || sub.start_date, sub.billing_cycle)
        : null;
      sub.remaining_installments = sub.max_installments != null
        ? Math.max(0, sub.max_installments - sub.payment_count)
        : null;
    }

    return { subscriptions: subs };
  });
}

export async function createSubscription(payload) {
  const db = await getDb();
  await tx(db, 'subscriptions', 'readwrite', (store) => {
    store.add({
      status: 'active',
      end_date: null,
      max_installments: null,
      tags: '[]',
      ...payload,
    });
  });
  await syncSubscriptionPayments(db); // immediately materialize any already-due payment
}

export async function updateSubscription(id, payload) {
  const db = await getDb();
  return tx(db, 'subscriptions', 'readwrite', async (store) => {
    const existing = await reqToPromise(store.get(id));
    if (!existing) return;
    store.put({ ...existing, ...payload });
  });
}

export async function deleteSubscription(id) {
  const db = await getDb();
  return tx(db, ['subscriptions', 'subscription_payments'], 'readwrite', async (stores) => {
    const idx = stores.subscription_payments.index('by_subscription_id');
    const payments = await new Promise((resolve, reject) => {
      const req = idx.getAll(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const p of payments) stores.subscription_payments.delete(p.id);
    stores.subscriptions.delete(id);
  });
}

export async function getSubscriptionPayments(id) {
  const db = await getDb();
  return tx(db, 'subscription_payments', 'readonly', async (store) => {
    const idx = store.index('by_subscription_id');
    const payments = await new Promise((resolve, reject) => {
      const req = idx.getAll(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    payments.sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1));
    return { payments };
  });
}

export async function updateSubscriptionPayment(paymentId, payload) {
  const db = await getDb();
  return tx(db, 'subscription_payments', 'readwrite', async (store) => {
    const existing = await reqToPromise(store.get(paymentId));
    if (!existing) return;
    store.put({ ...existing, ...payload });
  });
}

// ---------- Tags ----------

export async function getTags() {
  const db = await getDb();
  return tx(db, 'tags', 'readonly', async (store) => {
    const tags = await getAll(store);
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return { tags };
  });
}

export async function createTag(payload) {
  const db = await getDb();
  return tx(db, 'tags', 'readwrite', (store) => {
    store.put(payload); // put, not add — mirrors the old REPLACE INTO semantics
  });
}

export async function deleteTag(name) {
  const db = await getDb();
  return tx(db, ['tags', 'transactions', 'subscriptions'], 'readwrite', async (stores) => {
    stores.tags.delete(name);

    // Mirrors the backend's cleanup: strip the deleted tag out of every
    // transaction/subscription that had it, rather than leaving a
    // dangling, uncolored name behind.
    for (const storeName of ['transactions', 'subscriptions']) {
      const rows = await getAll(stores[storeName]);
      for (const row of rows) {
        let tagList;
        try { tagList = JSON.parse(row.tags || '[]'); } catch { continue; }
        if (tagList.includes(name)) {
          stores[storeName].put({ ...row, tags: JSON.stringify(tagList.filter(t => t !== name)) });
        }
      }
    }
  });
}

// ---------- Misc ----------

// Can't replicate server-side scraping without a server (CORS blocks a
// page's JS from reading another site's raw HTML cross-origin) — this
// returns a graceful fallback rather than silently pretending to work.
export async function getLinkPreview(url) {
  return { title: url, image: null, description: 'Preview not available (no backend to fetch it).', url };
}

export async function uploadFile(file) {
  const db = await getDb();
  const id = await tx(db, 'files', 'readwrite', (store) => {
    return reqToPromise(store.add({ filename: file.name, blob: file, type: file.type }));
  });
  // Embed the original filename at the end of the reference so
  // extension-based checks (e.g. "does this end in .pdf?") still work
  // unchanged on the reference string itself — matching how the old
  // server-hosted URLs, which ended in the real filename, behaved.
  return { filename: file.name, url: `idb-file:${id}:${encodeURIComponent(file.name)}` };
}

// Components render receipts with <img src="..."> / <object data="...">,
// which need an actual URL. Object URLs from URL.createObjectURL() only
// live for the current page session, so this re-derives a fresh one from
// the stored Blob on demand — call it right before rendering, not once
// and cache the result across reloads.
export async function getFileURL(ref) {
  if (!ref || !ref.startsWith('idb-file:')) return ref; // not one of ours — pass through
  const id = parseInt(ref.split(':')[1], 10);
  const db = await getDb();
  const record = await tx(db, 'files', 'readonly', (store) => reqToPromise(store.get(id)));
  return record ? URL.createObjectURL(record.blob) : null;
}

// ---------- Backup / Restore ----------
// Since there's no server, export/import is now the ONLY way to move
// data between browsers/devices — not just a safety net.

export async function exportData() {
  const db = await getDb();
  return tx(db, ['tags', 'transactions', 'subscriptions', 'subscription_payments'], 'readonly', async (stores) => ({
    version: 1,
    exported_at: new Date().toISOString(),
    tags: await getAll(stores.tags),
    transactions: await getAll(stores.transactions),
    subscriptions: await getAll(stores.subscriptions),
    subscription_payments: await getAll(stores.subscription_payments),
  }));
}

export async function importData(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON — make sure you're uploading an export produced by this app.");
  }

  const requiredKeys = ['tags', 'transactions', 'subscriptions', 'subscription_payments'];
  if (!requiredKeys.every(k => k in data)) {
    throw new Error("This file is missing expected data — it doesn't look like a valid backup from this app.");
  }

  const db = await getDb();
  await tx(db, ['tags', 'transactions', 'subscriptions', 'subscription_payments'], 'readwrite', async (stores) => {
    // Full replace, same as the backend's import: clear everything, then
    // restore exactly what's in the file, preserving original ids so
    // subscription_payments.subscription_id still points at the right row.
    for (const name of requiredKeys) {
      const existing = await getAll(stores[name]);
      const keyPath = name === 'tags' ? 'name' : 'id';
      for (const row of existing) stores[name].delete(row[keyPath]);
    }
    for (const t of data.tags) stores.tags.put(t);
    for (const s of data.subscriptions) stores.subscriptions.put(s);
    for (const p of data.subscription_payments) stores.subscription_payments.put(p);
    for (const t of data.transactions) stores.transactions.put(t);
  });

  return {
    message: 'Data restored successfully',
    counts: {
      tags: data.tags.length,
      transactions: data.transactions.length,
      subscriptions: data.subscriptions.length,
      subscription_payments: data.subscription_payments.length,
    },
  };
}
