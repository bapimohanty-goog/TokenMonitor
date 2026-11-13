export type Granularity = 'minute' | 'hour' | 'day';

export type DateRangePreset = '1h' | '24h' | '7d' | '30d' | 'custom';

export type DataSource = 'billing_reconciled' | 'realtime_estimated';

export type RealtimeStatus = 'active' | 'disabled' | 'error';

export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterOptionsResponse {
  projects: FilterOption[];
  users: FilterOption[];
  agents: FilterOption[];
  models: FilterOption[];
  hasUnlabelledData: boolean;
}

export interface KpiSummary {
  totalTokens: number;
  previousTotalTokens: number;
  tokenChangePercent: number | null;
  inputTokens: number;
  outputTokens: number;
  inputOutputRatio: number | null;
  totalCostUsd: number;
  reconciledCostUsd: number;
  estimatedCostUsd: number;
  previousTotalCostUsd: number;
  topAgent: {
    agentId: string;
    totalTokens: number;
    costUsd: number;
  } | null;
}

export interface TimeSeriesPoint {
  bucket: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  dataSource: DataSource;
}

export interface BreakdownItem {
  id: string;
  name: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageRow {
  timestamp: string;
  projectId: string;
  projectName: string;
  userId: string;
  agentId: string;
  skuDescription: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  dataSource: DataSource;
}

export interface BillingExportConfig {
  mode: 'live' | 'demo';
  needsSetup: boolean;
  gcpProjectId: string;
  bqDataset: string;
  bqTable: string;
  bqLocation: string;
  bqRealtimeDataset?: string;
  bqRealtimeTable?: string;
  realtimeCutoffHours?: number;
}

export interface DashboardResponse {
  mode: 'live' | 'demo';
  realtimeStatus: RealtimeStatus;
  realtimeMessage?: string;
  cutoffTime: string;
  lastUpdated: string;
  kpis: KpiSummary;
  timeSeries: TimeSeriesPoint[];
  breakdowns: {
    projects: BreakdownItem[];
    users: BreakdownItem[];
    agents: BreakdownItem[];
    models: BreakdownItem[];
  };
  usageRows: UsageRow[];
  hasAnyLabels: boolean;
}
