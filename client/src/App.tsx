import { AlertTriangle, Database } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBillingConfig,
  fetchDashboardData,
  fetchFilterOptions,
} from './api/client';
import { BillingConfigModal } from './components/BillingConfigModal';
import { BreakdownCharts } from './components/BreakdownCharts';
import { KpiCards } from './components/KpiCards';
import { TokenTimeSeriesChart } from './components/TokenTimeSeriesChart';
import { TopBar } from './components/TopBar';
import { UsageTable } from './components/UsageTable';
import type {
  BillingExportConfig,
  DashboardResponse,
  DateRangePreset,
  FilterOptionsResponse,
  Granularity,
} from './types/analytics';

function toDateInputString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeWindow(
  preset: DateRangePreset,
  customStart: string,
  customEnd: string
): { startTime: string; endTime: string } {
  const now = new Date();
  if (preset === '1h') {
    return {
      startTime: new Date(now.getTime() - 3600_000).toISOString(),
      endTime: now.toISOString(),
    };
  }
  if (preset === '24h') {
    return {
      startTime: new Date(now.getTime() - 24 * 3600_000).toISOString(),
      endTime: now.toISOString(),
    };
  }
  if (preset === '7d') {
    return {
      startTime: new Date(now.getTime() - 7 * 24 * 3600_000).toISOString(),
      endTime: now.toISOString(),
    };
  }
  if (preset === '30d') {
    return {
      startTime: new Date(now.getTime() - 30 * 24 * 3600_000).toISOString(),
      endTime: now.toISOString(),
    };
  }
  const start = new Date(`${customStart}T00:00:00.000Z`);
  const end = new Date(`${customEnd}T23:59:59.999Z`);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

export function App() {
  const [preset, setPreset] = useState<DateRangePreset>('7d');
  const [customStart, setCustomStart] = useState<string>(() =>
    toDateInputString(new Date(Date.now() - 7 * 24 * 3600_000))
  );
  const [customEnd, setCustomEnd] = useState<string>(() =>
    toDateInputString(new Date())
  );
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [isLivePolling, setIsLivePolling] = useState<boolean>(false);

  const [billingConfig, setBillingConfig] = useState<BillingExportConfig | null>(
    null
  );
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [filters, setFilters] = useState<FilterOptionsResponse | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const windowRange = useMemo(
    () => computeWindow(preset, customStart, customEnd),
    [preset, customStart, customEnd, refreshTick]
  );

  // Load initial server billing export configuration
  useEffect(() => {
    let active = true;
    fetchBillingConfig()
      .then((cfg) => {
        if (!active) return;
        setBillingConfig(cfg);
        if (cfg.needsSetup) {
          setIsConfigOpen(true);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load config');
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // 30-second auto-refresh when Live mode is enabled
  useEffect(() => {
    if (!isLivePolling || !billingConfig || billingConfig.needsSetup) return;
    const id = window.setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [isLivePolling, billingConfig]);

  const handlePresetChange = (nextPreset: DateRangePreset) => {
    setPreset(nextPreset);
    if (nextPreset === '1h') {
      setGranularity('minute');
    } else if (nextPreset === '24h') {
      setGranularity('hour');
    } else if (nextPreset === '7d' || nextPreset === '30d') {
      setGranularity('day');
    }
  };

  const handleCustomRangeChange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
  };

  const loadData = useCallback(async () => {
    if (!billingConfig || billingConfig.needsSetup) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [filterRes, dashRes] = await Promise.all([
        fetchFilterOptions(windowRange.startTime, windowRange.endTime),
        fetchDashboardData({
          startTime: windowRange.startTime,
          endTime: windowRange.endTime,
          granularity,
          projects: selectedProjects,
          users: selectedUsers,
          agents: selectedAgents,
        }),
      ]);
      setFilters(filterRes);
      setDashboard(dashRes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load BigQuery analytics'
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    billingConfig,
    windowRange.startTime,
    windowRange.endTime,
    granularity,
    selectedProjects,
    selectedUsers,
    selectedAgents,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleConfigSaved = (nextConfig: BillingExportConfig) => {
    setBillingConfig(nextConfig);
    setIsConfigOpen(false);
    setSelectedProjects([]);
    setSelectedUsers([]);
    setSelectedAgents([]);
    setRefreshTick((t) => t + 1);
  };

  const allowMinuteGranularity = preset === '1h' || preset === '24h';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar
        preset={preset}
        onPresetChange={handlePresetChange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomRangeChange={handleCustomRangeChange}
        filters={filters}
        selectedProjects={selectedProjects}
        selectedUsers={selectedUsers}
        selectedAgents={selectedAgents}
        onProjectsChange={setSelectedProjects}
        onUsersChange={setSelectedUsers}
        onAgentsChange={setSelectedAgents}
        onRefresh={() => setRefreshTick((t) => t + 1)}
        onOpenConfig={() => setIsConfigOpen(true)}
        billingConfig={billingConfig}
        isLivePolling={isLivePolling}
        onToggleLivePolling={() => setIsLivePolling((prev) => !prev)}
        realtimeStatus={dashboard?.realtimeStatus ?? null}
        realtimeMessage={dashboard?.realtimeMessage}
        isLoading={isLoading}
        lastUpdated={dashboard?.lastUpdated ?? null}
        mode={
          dashboard?.mode ??
          (billingConfig?.needsSetup ? null : billingConfig?.mode ?? null)
        }
      />

      <BillingConfigModal
        open={isConfigOpen}
        initialConfig={billingConfig}
        onClose={() => setIsConfigOpen(false)}
        onSaved={handleConfigSaved}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {billingConfig?.needsSetup ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
              <Database className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Connect Your GCP Billing Export
            </h2>
            <p className="mt-1.5 max-w-md text-xs text-slate-400">
              Specify the BigQuery project, dataset, and{' '}
              <code className="text-slate-300">
                gcp_billing_export_resource_v1_*
              </code>{' '}
              table where your Cloud Billing export resides, or switch to Demo
              Mode.
            </p>
            <button
              type="button"
              onClick={() => setIsConfigOpen(true)}
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
            >
              <Database className="h-3.5 w-3.5" />
              Configure Billing Export Location
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshTick((t) => t + 1)}
                  className="self-start rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/30 sm:self-auto"
                >
                  Retry
                </button>
              </div>
            )}

            <KpiCards kpis={dashboard?.kpis ?? null} isLoading={isLoading} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="xl:col-span-7">
                <TokenTimeSeriesChart
                  data={dashboard?.timeSeries ?? []}
                  granularity={granularity}
                  onGranularityChange={setGranularity}
                  allowMinuteGranularity={allowMinuteGranularity}
                  isLoading={isLoading}
                />
              </div>
              <div className="xl:col-span-5">
                <BreakdownCharts
                  projects={dashboard?.breakdowns.projects ?? []}
                  users={dashboard?.breakdowns.users ?? []}
                  agents={dashboard?.breakdowns.agents ?? []}
                  hasAnyLabels={dashboard?.hasAnyLabels ?? true}
                  isLoading={isLoading}
                />
              </div>
            </div>

            <UsageTable
              rows={dashboard?.usageRows ?? []}
              granularity={granularity}
              isLoading={isLoading}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
