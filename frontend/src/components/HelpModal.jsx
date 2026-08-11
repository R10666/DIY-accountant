import React from 'react';
import { X, PlusCircle, Repeat, History as HistoryIcon, Download, HardDrive } from 'lucide-react';

export default function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[200]" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-bold">Quick Guide</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="space-y-5">
          <div className="flex gap-3">
            <PlusCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-100 mb-1">Adding Entries</h4>
              <p className="text-sm text-slate-400">
                Use <span className="text-slate-300">+ New Transaction</span> to log a purchase or deposit.
                Check <span className="text-slate-300">"recurring"</span> to turn it into a subscription —
                you can optionally set it to end on a date or after a set number of payments.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Repeat size={20} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-100 mb-1">Managing Subscriptions</h4>
              <p className="text-sm text-slate-400">
                <span className="text-slate-300">Stop</span> pauses future billing but keeps history.
                <span className="text-slate-300"> Restart</span> resumes it.
                <span className="text-slate-300"> Delete</span> (trash icon) removes the subscription and
                its entire payment history permanently — use Stop instead if you just want to pause it.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <HistoryIcon size={20} className="text-slate-300 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-100 mb-1">History</h4>
              <p className="text-sm text-slate-400">
                Search, filter by type or tag, and see your total spending update to match whatever's
                currently filtered. Click any row for details — that's also where you edit, refund, or
                delete an individual entry.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Download size={20} className="text-slate-300 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-100 mb-1">Backup</h4>
              <p className="text-sm text-slate-400">
                The download/upload icons at the top export or restore <span className="text-slate-300">all</span> your
                data as a single file. Restoring completely replaces what's currently here, so use it to move
                data between browsers or devices, not to merge.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <HardDrive size={20} className="text-slate-300 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-100 mb-1">The badge in the corner</h4>
              <p className="text-sm text-slate-400">
                <span className="text-emerald-400">Browser Storage</span> means your data lives only in this
                browser — clearing site data or switching browsers loses it, so back up with Export regularly.
                <span className="text-indigo-400"> Local Server</span> means you're connected to your own backend instead.
              </p>

              <details className="mt-2 group">
                <summary className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer select-none list-none flex items-center gap-1">
                  <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                  Advanced: how to change which one is active
                </summary>
                <div className="mt-2 text-xs text-slate-400 space-y-2 pl-4 border-l border-slate-700">
                  <p>
                    This is controlled by a build-time setting,{' '}
                    <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">VITE_STORAGE_MODE</code>,
                    read from an env file in <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">frontend/</code>.
                    It isn't a setting you toggle in the app itself — it's decided when the app is built/started.
                  </p>
                  <p>
                    <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">frontend/.env</code> sets the
                    default (normally <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">local</code>,
                    so anyone visiting a public deploy of this app gets Browser Storage automatically, no setup
                    required). A separate, personal <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">frontend/.env.local</code> file
                    — gitignored, never shared — can override that on your own machine.
                  </p>
                  <p>To switch modes on a machine you control:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>
                      Open (or create) <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">frontend/.env.local</code>
                    </li>
                    <li>
                      Set it to <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">VITE_STORAGE_MODE=server</code> for
                      Local Server, or <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">VITE_STORAGE_MODE=local</code> (or
                      just delete the file) for Browser Storage
                    </li>
                    <li>Restart <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">npm run dev</code>, or rebuild if deploying — Vite only reads this at startup/build time, not live</li>
                  </ol>
                  <p>
                    Server mode also needs the FastAPI backend actually running (<code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">uvicorn main:app</code> in{' '}
                    <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded">backend/</code>) — without it, requests will just fail even
                    though the badge says Local Server.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}