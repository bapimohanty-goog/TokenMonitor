import { AlertCircle, CheckCircle2, Database, Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { saveBillingConfig } from '../api/client';
import type { BillingExportConfig } from '../types/analytics';

interface BillingConfigModalProps {
  open: boolean;
  initialConfig: BillingExportConfig | null;
  onClose: () => void;
  onSaved: (config: BillingExportConfig) => void;
}

export function BillingConfigModal({
  open,
  initialConfig,
  onClose,
  onSaved,
}: BillingConfigModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [bqDataset, setBqDataset] = useState('');
  const [bqTable, setBqTable] = useState('');
  const [bqLocation, setBqLocation] = useState('US');
  const [bqRealtimeDataset, setBqRealtimeDataset] = useState(
    'realtime_llm_telemetry'
  );
  const [bqRealtimeTable, setBqRealtimeTable] = useState('token_usage_logs');
  const [realtimeCutoffHours, setRealtimeCutoffHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialConfig) {
      setMode(initialConfig.needsSetup ? 'live' : initialConfig.mode);
      setGcpProjectId(initialConfig.gcpProjectId || '');
      setBqDataset(initialConfig.bqDataset || '');
      setBqTable(initialConfig.bqTable || '');
      setBqLocation(initialConfig.bqLocation || 'US');
      setBqRealtimeDataset(
        initialConfig.bqRealtimeDataset ?? 'realtime_llm_telemetry'
      );
      setBqRealtimeTable(initialConfig.bqRealtimeTable ?? 'token_usage_logs');
      setRealtimeCutoffHours(initialConfig.realtimeCutoffHours ?? 24);
    }
  }, [initialConfig, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback for browsers without native `closedby` attribute support (e.g., Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) {
        dialog.close();
      }
    };

    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, []);

  const handleFullPathPaste = (raw: string) => {
    const cleaned = raw.replace(/`/g, '').trim();
    const parts = cleaned.split('.');
    if (parts.length === 3 && parts.every(Boolean)) {
      setGcpProjectId(parts[0]);
      setBqDataset(parts[1]);
      setBqTable(parts[2]);
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const saved = await saveBillingConfig({
        mode,
        gcpProjectId: gcpProjectId.trim(),
        bqDataset: bqDataset.trim(),
        bqTable: bqTable.trim(),
        bqLocation: bqLocation.trim() || 'US',
        bqRealtimeDataset: bqRealtimeDataset.trim(),
        bqRealtimeTable: bqRealtimeTable.trim(),
        realtimeCutoffHours,
        verify: mode === 'live',
      });
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to BigQuery billing export table.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto w-full max-w-lg rounded-2xl border border-slate-700/90 bg-slate-900 p-0 text-slate-100 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <h2 id={titleId} className="text-base font-semibold text-white">
              GCP Billing Export Location
            </h2>
            <p className="text-xs text-slate-400">
              Specify where your BigQuery Cloud Billing export table lives
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('live');
              setError(null);
            }}
            className={`rounded-lg py-2 text-xs font-medium transition ${
              mode === 'live'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live BigQuery Export
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('demo');
              setError(null);
            }}
            className={`rounded-lg py-2 text-xs font-medium transition ${
              mode === 'demo'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Simulated Demo Data
          </button>
        </div>

        {mode === 'live' ? (
          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="gcpProjectId"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                GCP Project ID
              </label>
              <input
                id="gcpProjectId"
                type="text"
                required
                value={gcpProjectId}
                onChange={(e) => {
                  if (!handleFullPathPaste(e.target.value)) {
                    setGcpProjectId(e.target.value);
                  }
                }}
                placeholder="my-billing-project (or paste project.dataset.table)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="bqDataset"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  BigQuery Dataset
                </label>
                <input
                  id="bqDataset"
                  type="text"
                  required
                  value={bqDataset}
                  onChange={(e) => setBqDataset(e.target.value)}
                  placeholder="billing_export"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="bqLocation"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  BigQuery Location
                </label>
                <input
                  id="bqLocation"
                  type="text"
                  required
                  value={bqLocation}
                  onChange={(e) => setBqLocation(e.target.value)}
                  placeholder="US"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="bqTable"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Billing Export Table Name
              </label>
              <input
                id="bqTable"
                type="text"
                required
                value={bqTable}
                onChange={(e) => setBqTable(e.target.value)}
                placeholder="gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Uses Application Default Credentials (ADC) with{' '}
                <code className="text-slate-300">roles/bigquery.dataViewer</code>{' '}
                and <code className="text-slate-300">roles/bigquery.jobUser</code>.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                Real-Time Telemetry Sink (Optional)
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="bqRealtimeDataset"
                    className="mb-1 block text-[11px] text-slate-400"
                  >
                    Dataset
                  </label>
                  <input
                    id="bqRealtimeDataset"
                    type="text"
                    value={bqRealtimeDataset}
                    onChange={(e) => setBqRealtimeDataset(e.target.value)}
                    placeholder="realtime_llm_telemetry"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bqRealtimeTable"
                    className="mb-1 block text-[11px] text-slate-400"
                  >
                    Table
                  </label>
                  <input
                    id="bqRealtimeTable"
                    type="text"
                    value={bqRealtimeTable}
                    onChange={(e) => setBqRealtimeTable(e.target.value)}
                    placeholder="token_usage_logs"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="realtimeCutoffHours"
                    className="mb-1 block text-[11px] text-slate-400"
                  >
                    Cutoff (Hours)
                  </label>
                  <input
                    id="realtimeCutoffHours"
                    type="number"
                    min={1}
                    max={72}
                    value={realtimeCutoffHours}
                    onChange={(e) =>
                      setRealtimeCutoffHours(
                        Math.max(1, Math.min(72, Number(e.target.value) || 24))
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <p className="font-medium">Demo Mode Enabled</p>
            <p className="mt-1 text-amber-200/80">
              Explore the dashboard with realistic simulated Vertex AI / Gemini
              token usage across multiple projects, users, and agents—no GCP
              credentials required.
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {mode === 'live' ? 'Verifying & Saving...' : 'Applying...'}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {mode === 'live' ? 'Verify & Connect' : 'Use Demo Data'}
              </>
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
