export type Granularity = 'minute' | 'hour' | 'day';

export type DataSource = 'billing_reconciled' | 'realtime_estimated';

export type RealtimeStatus = 'active' | 'disabled' | 'error';

export interface DashboardQueryParams {
  startTime: string; // ISO-8601 UTC
  endTime: string;   // ISO-8601 UTC
  granularity: Granularity;
  projects: string[];
  users: string[];
  agents: string[];
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterOptionsResponse {
  projects: FilterOption[];
  users: FilterOption[];
  agents: FilterOption[];
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
  bucket: string; // ISO timestamp
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
  };
  usageRows: UsageRow[];
  hasAnyLabels: boolean;
}
