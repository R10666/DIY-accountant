// api.js — the single place every component imports data functions
// from. It doesn't do any work itself; it picks between two complete
// implementations based on VITE_STORAGE_MODE (set via .env files, see
// below) and forwards every call to whichever one is active. Every
// component is written against this file only, so neither mode required
// touching a single component.
//
//   - localDB.js    — browser-only storage via IndexedDB. This is the
//                      DEFAULT (see the committed .env file) — it's what
//                      anyone who deploys this app statically (GitHub
//                      Pages, Netlify, etc.) or clones the repo fresh
//                      gets automatically, with zero setup.
//
//   - api.server.js — the original implementation, calling a real
//                      FastAPI backend over HTTP.
//
// To keep using the real backend for local development, create a file
// called `frontend/.env.local` (NOT `.env` — that one's committed) with:
//
//     VITE_STORAGE_MODE=server
//
// `.env.local` is already gitignored, so this override stays on your
// machine only and never gets pushed — the public repo keeps defaulting
// to local storage for everyone else.

import * as localImpl from './localDB.js';
import * as serverImpl from './api.server.js';

const impl = import.meta.env.VITE_STORAGE_MODE === 'server' ? serverImpl : localImpl;

export const getTransactions = (...args) => impl.getTransactions(...args);

export const createTransaction = (...args) => impl.createTransaction(...args);
export const updateTransaction = (...args) => impl.updateTransaction(...args);
export const deleteTransaction = (...args) => impl.deleteTransaction(...args);

export const getSubscriptions = (...args) => impl.getSubscriptions(...args);
export const createSubscription = (...args) => impl.createSubscription(...args);
export const updateSubscription = (...args) => impl.updateSubscription(...args);
export const deleteSubscription = (...args) => impl.deleteSubscription(...args);
export const getSubscriptionPayments = (...args) => impl.getSubscriptionPayments(...args);
export const updateSubscriptionPayment = (...args) => impl.updateSubscriptionPayment(...args);

export const getTags = (...args) => impl.getTags(...args);
export const createTag = (...args) => impl.createTag(...args);
export const deleteTag = (...args) => impl.deleteTag(...args);

export const getLinkPreview = (...args) => impl.getLinkPreview(...args);
export const uploadFile = (...args) => impl.uploadFile(...args);
export const getFileURL = (...args) => impl.getFileURL(...args);

export const exportData = (...args) => impl.exportData(...args);
export const importData = (...args) => impl.importData(...args);