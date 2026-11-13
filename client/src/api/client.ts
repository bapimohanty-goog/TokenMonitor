import type {
  BillingExportConfig,
  DashboardResponse,
  FilterOptionsResponse,
  Granularity,
} from '../types/analytics';

export async function fetchBillingConfig(): Promise<BillingExportConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`Failed to load configuration (${res.status})`);
  }
  return res.json();
}

export async function saveBillingConfig(payload: {
  mode: 'live' | 'demo';
  gcpProjectId: string;
  bqDataset: string;
  bqTable: string;
  bqLocation: string;
  bqRealtimeDataset?: string;
  bqRealtimeTable?: string;
  realtimeCutoffHours?: number;
  verify?: boolean;
}): Promise<BillingExportConfig> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.hint ? `${body.error} — ${body.hint}` : body.error || `Failed to save config (${res.status})`
    );
  }
  return res.json();
}

export interface FetchDashboardArgs {
  startTime: string;
  endTime: string;
  granularity: Granularity;
  projects: string[];
  users: string[];
  agents: string[];
  models: string[];
}

export async function fetchFilterOptions(
  startTime: string,
  endTime: string
): Promise<FilterOptionsResponse> {
  const params = new URLSearchParams({ startTime, endTime });
  const res = await fetch(`/api/filters?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load filter options (${res.status})`);
  }
  return res.json();
}

export async function fetchDashboardData(
  args: FetchDashboardArgs
): Promise<DashboardResponse> {
  const params = new URLSearchParams({
    startTime: args.startTime,
    endTime: args.endTime,
    granularity: args.granularity,
  });

  if (args.projects.length > 0) params.set('projects', args.projects.join(','));
  if (args.users.length > 0) params.set('users', args.users.join(','));
  if (args.agents.length > 0) params.set('agents', args.agents.join(','));
  if (args.models.length > 0) params.set('models', args.models.join(','));

  const res = await fetch(`/api/dashboard?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.hint ? `${body.error} — ${body.hint}` : body.error || `Request failed (${res.status})`
    );
  }
  return res.json();
}
