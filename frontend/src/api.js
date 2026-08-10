const BASE_URL = 'http://127.0.0.1:8000';

/**
 * Every request goes through here so response.ok is checked exactly once,
 * consistently, everywhere — instead of each component repeating (or
 * forgetting) that check on its own fetch() calls. fetch() only rejects on
 * network failure, not on HTTP error status, so without this a failed
 * request can silently look like it succeeded.
 */
async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: isFormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Request failed (${res.status}): ${detail || res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : null;
}

const json = (body) => JSON.stringify(body);

// ---------- Unified ledger (one-off transactions + subscription payments) ----------

export const getTransactions = () => request('/api/transactions');

// ---------- One-off transactions ----------

export const createTransaction = (payload) =>
  request('/api/transaction', { method: 'POST', body: json(payload) });

export const updateTransaction = (id, payload) =>
  request(`/api/transaction/${id}`, { method: 'PUT', body: json(payload) });

export const deleteTransaction = (id) =>
  request(`/api/transaction/${id}`, { method: 'DELETE' });

// ---------- Subscriptions ----------

export const getSubscriptions = () => request('/api/subscriptions');

export const createSubscription = (payload) =>
  request('/api/subscriptions', { method: 'POST', body: json(payload) });

export const updateSubscription = (id, payload) =>
  request(`/api/subscriptions/${id}`, { method: 'PUT', body: json(payload) });

export const deleteSubscription = (id) =>
  request(`/api/subscriptions/${id}`, { method: 'DELETE' });

export const getSubscriptionPayments = (id) =>
  request(`/api/subscriptions/${id}/payments`);

export const updateSubscriptionPayment = (paymentId, payload) =>
  request(`/api/subscription-payments/${paymentId}`, { method: 'PUT', body: json(payload) });

// ---------- Tags ----------

export const getTags = () => request('/api/tags');

export const createTag = (payload) =>
  request('/api/tags', { method: 'POST', body: json(payload) });

export const deleteTag = (name) =>
  request(`/api/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });

// ---------- Misc ----------

export const getLinkPreview = (url) =>
  request(`/api/preview?url=${encodeURIComponent(url)}`);

export const uploadFile = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  // NOTE: no Content-Type header here on purpose — the browser sets the
  // multipart boundary itself. request() already skips the JSON header
  // when the body is FormData.
  return request('/api/upload', { method: 'POST', body: formData });
};
