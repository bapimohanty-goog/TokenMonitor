import { Activity, Calendar, Database, Radio, RefreshCw } from 'lucide-react';
import type {
  BillingExportConfig,
  DateRangePreset,
  FilterOptionsResponse,
  RealtimeStatus,
} from '../types/analytics';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface TopBarProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomRangeChange: (start: string, end: string) => void;
  filters: FilterOptionsResponse | null;
  selectedProjects: string[];
  selectedUsers: string[];
  selectedAgents: string[];
  selectedModels: string[];
  onProjectsChange: (next: string[]) => void;
  onUsersChange: (next: string[]) => void;
  onAgentsChange: (next: string[]) => void;
  onModelsChange: (next: string[]) => void;
  onRefresh: () => void;
  onOpenConfig: () => void;
  billingConfig: BillingExportConfig | null;
  isLivePolling: boolean;
  onToggleLivePolling: () => void;
  realtimeStatus: RealtimeStatus | null;
  realtimeMessage?: string;
  isLoading: boolean;
  lastUpdated: string | null;
  mode: 'live' | 'demo' | null;
}

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'custom', label: 'Custom' },
];

export function TopBar({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomRangeChange,
  filters,
  selectedProjects,
  selectedUsers,
  selectedAgents,
  selectedModels,
  onProjectsChange,
  onUsersChange,
  onAgentsChange,
  onModelsChange,
  onRefresh,
  onOpenConfig,
  billingConfig,
  isLivePolling,
  onToggleLivePolling,
  realtimeStatus,
  realtimeMessage,
  isLoading,
  lastUpdated,
  mode,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand & Mode / Stream Status */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                    GCP Token Monitor
                  </h1>
                  {mode && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        mode === 'live'
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mode === 'live' ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      {mode === 'live' ? 'BigQuery Live' : 'Demo Mode'}
                    </span>
                  )}
                  {realtimeStatus && (
                    <span
                      title={
                        realtimeMessage ||
                        (realtimeStatus === 'active'
                          ? 'Real-time Cloud Logging telemetry stream active'
                          : realtimeStatus === 'disabled'
                            ? 'Real-time telemetry table not configured; showing BQ Billing only'
                            : 'Real-time telemetry table error')
                      }
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        realtimeStatus === 'active'
                          ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
                          : realtimeStatus === 'error'
                            ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
                            : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700'
                      }`}
                    >
                      <Radio className="h-3 w-3" />
                      {realtimeStatus === 'active'
                        ? 'Stream Active'
                        : realtimeStatus === 'error'
                          ? 'Stream Degraded'
                          : 'Billing Only'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Vertex AI Billing + Real-Time SDK Telemetry
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1.5 lg:hidden">
              <button
                type="button"
                onClick={onToggleLivePolling}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
                  isLivePolling
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isLivePolling ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                Live
              </button>
              <button
                type="button"
                onClick={onOpenConfig}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                <Database className="h-3.5 w-3.5 text-blue-400" />
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Refresh data"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Presets */}
            <div
              role="group"
              aria-label="Date range"
              className="inline-flex h-9 items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5"
            >
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPresetChange(p.id)}
                  className={`h-8 rounded-md px-2.5 text-xs font-medium transition ${
                    preset === p.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="date"
                  aria-label="Start date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => onCustomRangeChange(e.target.value, customEnd)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none"
                />
                <span className="text-xs text-slate-500">to</span>
                <input
                  type="date"
                  aria-label="End date"
                  value={customEnd}
                  min={customStart}
                  onChange={(e) => onCustomRangeChange(customStart, e.target.value)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none"
                />
              </div>
            )}

            {/* Multi-Select Filters */}
            <MultiSelectDropdown
              label="Project"
              options={filters?.projects ?? []}
              selected={selectedProjects}
              onChange={onProjectsChange}
              disabled={!filters}
            />
            <MultiSelectDropdown
              label="User"
              options={filters?.users ?? []}
              selected={selectedUsers}
              onChange={onUsersChange}
              disabled={!filters}
            />
            <MultiSelectDropdown
              label="Agent"
              options={filters?.agents ?? []}
              selected={selectedAgents}
              onChange={onAgentsChange}
              disabled={!filters}
            />
            <MultiSelectDropdown
              label="Model"
              options={filters?.models ?? []}
              selected={selectedModels}
              onChange={onModelsChange}
              disabled={!filters}
            />

            {/* Desktop Live Toggle, Data Source & Refresh */}
            <div className="hidden items-center gap-2 pl-1 lg:flex">
              <button
                type="button"
                onClick={onToggleLivePolling}
                aria-pressed={isLivePolling}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
                  isLivePolling
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700/80 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isLivePolling ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                Live (30s)
              </button>

              <button
                type="button"
                onClick={onOpenConfig}
                title={
                  billingConfig?.mode === 'live' && billingConfig.bqTable
                    ? `${billingConfig.gcpProjectId}.${billingConfig.bqDataset}.${billingConfig.bqTable}`
                    : 'Configure BigQuery Billing Export Location'
                }
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-3 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <Database className="h-3.5 w-3.5 text-blue-400" />
                Data Source
              </button>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>

              {lastUpdated && (
                <span className="text-[11px] text-slate-400">
                  {new Date(lastUpdated).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
