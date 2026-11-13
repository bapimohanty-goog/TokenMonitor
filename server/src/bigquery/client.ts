import { BigQuery } from '@google-cloud/bigquery';
import type { AppConfig } from '../config.js';
import type {
  BreakdownItem,
  DashboardQueryParams,
  DashboardResponse,
  FilterOptionsResponse,
  RealtimeStatus,
  TimeSeriesPoint,
  UsageRow,
} from '../types.js';
import {
  buildBreakdownQuery,
  buildFilterOptionsQuery,
  buildKpiSummaryQuery,
  buildTimeSeriesQuery,
  buildUsageTableQuery,
} from './queries.js';
import {
  buildRealtimeBreakdownQuery,
  buildRealtimeKpiQuery,
  buildRealtimeTimeSeriesQuery,
  buildRealtimeUsageTableQuery,
} from './realtimeQueries.js';

interface KpiRow {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
}

interface TsRow {
  bucket: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

interface BdRow {
  id: string;
  name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

interface TableRow {
  timestamp: string;
  project_id: string;
  project_name: string;
  user_id: string;
  agent_id: string;
  sku_description: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

function computeCutoffIso(
  realtimeCutoffHours: number,
  granularity: DashboardQueryParams['granularity']
): string {
  const cutoffDate = new Date(Date.now() - realtimeCutoffHours * 3600_000);
  if (granularity === 'day') {
    // Align to UTC midnight so daily buckets never mix billing and realtime
    cutoffDate.setUTCHours(0, 0, 0, 0);
  } else if (granularity === 'hour') {
    cutoffDate.setUTCMinutes(0, 0, 0);
  } else {
    cutoffDate.setUTCSeconds(0, 0);
  }
  return cutoffDate.toISOString();
}

function mergeBreakdowns(
  a: BdRow[],
  b: BdRow[]
): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();
  for (const r of [...a, ...b]) {
    const existing = map.get(r.id) ?? {
      id: r.id,
      name: r.name || r.id,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    existing.inputTokens += Number(r.input_tokens) || 0;
    existing.outputTokens += Number(r.output_tokens) || 0;
    existing.totalTokens += Number(r.total_tokens) || 0;
    existing.costUsd += Number(r.cost_usd) || 0;
    map.set(r.id, existing);
  }
  return Array.from(map.values())
    .sort((x, y) => y.totalTokens - x.totalTokens)
    .slice(0, 10);
}

export class BigQueryAnalyticsClient {
  private readonly bq: BigQuery;
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.bq = new BigQuery({
      projectId: config.gcpProjectId,
      location: config.bqLocation,
    });
  }

  async verifyTableAccess(): Promise<{ numRows?: string; location?: string }> {
    const table = this.bq
      .dataset(this.config.bqDataset)
      .table(this.config.bqTable);
    const [metadata] = await table.getMetadata();
    return {
      numRows: metadata?.numRows,
      location: metadata?.location,
    };
  }

  /**
   * Ensures the real-time telemetry dataset and day-partitioned table exist
   * in BigQuery, creating them automatically if missing.
   */
  async ensureRealtimeTelemetryTable(): Promise<{
    createdDataset: boolean;
    createdTable: boolean;
  }> {
    if (!this.config.bqRealtimeDataset || !this.config.bqRealtimeTable) {
      return { createdDataset: false, createdTable: false };
    }

    let createdDataset = false;
    let createdTable = false;

    const dataset = this.bq.dataset(this.config.bqRealtimeDataset);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      await this.bq.createDataset(this.config.bqRealtimeDataset, {
        location: this.config.bqLocation,
      });
      createdDataset = true;
    }

    const table = dataset.table(this.config.bqRealtimeTable);
    const [tableExists] = await table.exists();
    if (!tableExists) {
      await dataset.createTable(this.config.bqRealtimeTable, {
        timePartitioning: {
          type: 'DAY',
          field: 'timestamp',
        },
        schema: {
          fields: [
            { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'severity', type: 'STRING', mode: 'NULLABLE' },
            {
              name: 'jsonPayload',
              type: 'RECORD',
              mode: 'NULLABLE',
              fields: [
                { name: 'event', type: 'STRING', mode: 'NULLABLE' },
                { name: 'project_id', type: 'STRING', mode: 'NULLABLE' },
                { name: 'user_id', type: 'STRING', mode: 'NULLABLE' },
                { name: 'agent_id', type: 'STRING', mode: 'NULLABLE' },
                { name: 'session_id', type: 'STRING', mode: 'NULLABLE' },
                { name: 'model_version', type: 'STRING', mode: 'NULLABLE' },
                { name: 'prompt_token_count', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'candidates_token_count', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'cached_content_token_count', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'total_token_count', type: 'INTEGER', mode: 'NULLABLE' },
                { name: 'duration_ms', type: 'FLOAT', mode: 'NULLABLE' },
                { name: 'stream', type: 'BOOLEAN', mode: 'NULLABLE' },
              ],
            },
          ],
        },
      });
      createdTable = true;
    }

    return { createdDataset, createdTable };
  }

  private async runParameterizedQuery<T>(
    query: string,
    params: Record<string, unknown>,
    types: Record<string, string | string[]>
  ): Promise<T[]> {
    const [rows] = await this.bq.query({
      query,
      params,
      types,
      location: this.config.bqLocation,
    });
    return rows as T[];
  }

  async getFilterOptions(startTime: string, endTime: string): Promise<FilterOptionsResponse> {
    const query = buildFilterOptionsQuery(this.config.fullyQualifiedTable);
    const rows = await this.runParameterizedQuery<{
      projects: Array<{ id: string; label: string }> | null;
      users: string[] | null;
      agents: string[] | null;
    }>(
      query,
      { startTime, endTime },
      { startTime: 'TIMESTAMP', endTime: 'TIMESTAMP' }
    );

    const row = rows[0] ?? { projects: [], users: [], agents: [] };
    const users = (row.users ?? []).map((u) => ({ id: u, label: u }));
    const agents = (row.agents ?? []).map((a) => ({ id: a, label: a }));
    const hasUnlabelledData =
      users.some((u) => u.id === 'unassigned') ||
      agents.some((a) => a.id === 'unassigned');

    return {
      projects: row.projects ?? [],
      users,
      agents,
      hasUnlabelledData,
    };
  }

  async getDashboardData(params: DashboardQueryParams): Promise<DashboardResponse> {
    const startMs = Date.parse(params.startTime);
    const endMs = Date.parse(params.endTime);
    const durationMs = Math.max(endMs - startMs, 3600_000);
    const prevStartTime = new Date(startMs - durationMs).toISOString();
    const prevEndTime = new Date(startMs).toISOString();

    const cutoffIso = computeCutoffIso(
      this.config.realtimeCutoffHours,
      params.granularity
    );
    const cutoffMs = Date.parse(cutoffIso);

    const hasRealtimeTable = Boolean(this.config.fullyQualifiedRealtimeTable);

    // Determine non-overlapping windows:
    //   Billing:  [startTime, min(endTime, cutoffIso))
    //   Realtime: [max(startTime, cutoffIso), endTime)
    // If realtime table is not configured, billing covers the full [startTime, endTime).
    const billingEndMs = hasRealtimeTable ? Math.min(endMs, cutoffMs) : endMs;
    const realtimeStartMs = hasRealtimeTable ? Math.max(startMs, cutoffMs) : endMs;

    const queryBillingWindow = billingEndMs > startMs;
    const queryRealtimeWindow = hasRealtimeTable && endMs > realtimeStartMs;

    const sharedTypes = {
      startTime: 'TIMESTAMP',
      endTime: 'TIMESTAMP',
      projects: ['STRING'],
      users: ['STRING'],
      agents: ['STRING'],
    };

    const billingTable = this.config.fullyQualifiedTable;
    const realtimeTable = this.config.fullyQualifiedRealtimeTable;

    const billingParams = {
      startTime: params.startTime,
      endTime: new Date(billingEndMs).toISOString(),
      projects: params.projects,
      users: params.users,
      agents: params.agents,
    };

    const prevParams = {
      startTime: prevStartTime,
      endTime: prevEndTime,
      projects: params.projects,
      users: params.users,
      agents: params.agents,
    };

    const billingPromises = queryBillingWindow
      ? Promise.all([
          this.runParameterizedQuery<KpiRow>(
            buildKpiSummaryQuery(billingTable),
            billingParams,
            sharedTypes
          ),
          this.runParameterizedQuery<TsRow>(
            buildTimeSeriesQuery(billingTable, params.granularity),
            billingParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildBreakdownQuery(billingTable, 'project'),
            billingParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildBreakdownQuery(billingTable, 'user'),
            billingParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildBreakdownQuery(billingTable, 'agent'),
            billingParams,
            sharedTypes
          ),
          this.runParameterizedQuery<TableRow>(
            buildUsageTableQuery(billingTable, params.granularity),
            billingParams,
            sharedTypes
          ),
        ])
      : Promise.resolve([[], [], [], [], [], []] as [
          KpiRow[],
          TsRow[],
          BdRow[],
          BdRow[],
          BdRow[],
          TableRow[],
        ]);

    const prevKpiPromise = this.runParameterizedQuery<KpiRow>(
      buildKpiSummaryQuery(billingTable),
      prevParams,
      sharedTypes
    );

    let realtimeStatus: RealtimeStatus = hasRealtimeTable ? 'active' : 'disabled';
    let realtimeMessage: string | undefined;

    const realtimeParams = {
      startTime: new Date(realtimeStartMs).toISOString(),
      endTime: params.endTime,
      projects: params.projects,
      users: params.users,
      agents: params.agents,
    };

    const realtimePromise = queryRealtimeWindow
      ? Promise.all([
          this.runParameterizedQuery<KpiRow>(
            buildRealtimeKpiQuery(realtimeTable),
            realtimeParams,
            sharedTypes
          ),
          this.runParameterizedQuery<TsRow>(
            buildRealtimeTimeSeriesQuery(realtimeTable, params.granularity),
            realtimeParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildRealtimeBreakdownQuery(realtimeTable, 'project'),
            realtimeParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildRealtimeBreakdownQuery(realtimeTable, 'user'),
            realtimeParams,
            sharedTypes
          ),
          this.runParameterizedQuery<BdRow>(
            buildRealtimeBreakdownQuery(realtimeTable, 'agent'),
            realtimeParams,
            sharedTypes
          ),
          this.runParameterizedQuery<TableRow>(
            buildRealtimeUsageTableQuery(realtimeTable, params.granularity),
            realtimeParams,
            sharedTypes
          ),
        ]).catch((err: unknown) => {
          realtimeStatus = 'error';
          realtimeMessage =
            err instanceof Error
              ? err.message
              : 'Real-time telemetry table unavailable; showing billing data only.';
          return [[], [], [], [], [], []] as [
            KpiRow[],
            TsRow[],
            BdRow[],
            BdRow[],
            BdRow[],
            TableRow[],
          ];
        })
      : Promise.resolve([[], [], [], [], [], []] as [
          KpiRow[],
          TsRow[],
          BdRow[],
          BdRow[],
          BdRow[],
          TableRow[],
        ]);

    const [
      [bKpi, bTs, bProj, bUser, bAgent, bTable],
      prevKpiRows,
      [rKpi, rTs, rProj, rUser, rAgent, rTable],
    ] = await Promise.all([billingPromises, prevKpiPromise, realtimePromise]);

    const bCurr = bKpi[0] ?? {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      total_cost_usd: 0,
    };
    const rCurr = rKpi[0] ?? {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      total_cost_usd: 0,
    };
    const prev = prevKpiRows[0] ?? {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      total_cost_usd: 0,
    };

    const inputTokens =
      (Number(bCurr.input_tokens) || 0) + (Number(rCurr.input_tokens) || 0);
    const outputTokens =
      (Number(bCurr.output_tokens) || 0) + (Number(rCurr.output_tokens) || 0);
    const totalTokens =
      (Number(bCurr.total_tokens) || 0) + (Number(rCurr.total_tokens) || 0);
    const reconciledCostUsd = Number(bCurr.total_cost_usd) || 0;
    const estimatedCostUsd = Number(rCurr.total_cost_usd) || 0;
    const totalCostUsd = reconciledCostUsd + estimatedCostUsd;

    const prevTotalTokens = Number(prev.total_tokens) || 0;
    const tokenChangePercent =
      prevTotalTokens > 0
        ? ((totalTokens - prevTotalTokens) / prevTotalTokens) * 100
        : null;
    const inputOutputRatio =
      outputTokens > 0 ? inputTokens / outputTokens : null;

    const projects = mergeBreakdowns(bProj, rProj);
    const users = mergeBreakdowns(bUser, rUser);
    const agents = mergeBreakdowns(bAgent, rAgent);
    const topAgentRow = agents.find((a) => a.id !== 'unassigned') ?? agents[0] ?? null;

    const timeSeries: TimeSeriesPoint[] = [
      ...bTs.map((r) => ({
        bucket: r.bucket,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        costUsd: Number(r.cost_usd) || 0,
        dataSource: 'billing_reconciled' as const,
      })),
      ...rTs.map((r) => ({
        bucket: r.bucket,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        costUsd: Number(r.cost_usd) || 0,
        dataSource: 'realtime_estimated' as const,
      })),
    ].sort((a, b) => a.bucket.localeCompare(b.bucket));

    const usageRows: UsageRow[] = [
      ...rTable.map((r) => ({
        timestamp: r.timestamp,
        projectId: r.project_id,
        projectName: r.project_name,
        userId: r.user_id,
        agentId: r.agent_id,
        skuDescription: r.sku_description,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        costUsd: Number(r.cost_usd) || 0,
        dataSource: 'realtime_estimated' as const,
      })),
      ...bTable.map((r) => ({
        timestamp: r.timestamp,
        projectId: r.project_id,
        projectName: r.project_name,
        userId: r.user_id,
        agentId: r.agent_id,
        skuDescription: r.sku_description,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        costUsd: Number(r.cost_usd) || 0,
        dataSource: 'billing_reconciled' as const,
      })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.totalTokens - a.totalTokens)
      .slice(0, 500);

    const hasAnyLabels =
      users.some((u) => u.id !== 'unassigned') ||
      agents.some((a) => a.id !== 'unassigned');

    return {
      mode: 'live',
      realtimeStatus,
      realtimeMessage,
      cutoffTime: cutoffIso,
      lastUpdated: new Date().toISOString(),
      kpis: {
        totalTokens,
        previousTotalTokens: prevTotalTokens,
        tokenChangePercent,
        inputTokens,
        outputTokens,
        inputOutputRatio,
        totalCostUsd,
        reconciledCostUsd,
        estimatedCostUsd,
        previousTotalCostUsd: Number(prev.total_cost_usd) || 0,
        topAgent: topAgentRow
          ? {
              agentId: topAgentRow.id,
              totalTokens: topAgentRow.totalTokens,
              costUsd: topAgentRow.costUsd,
            }
          : null,
      },
      timeSeries,
      breakdowns: {
        projects,
        users,
        agents,
      },
      usageRows,
      hasAnyLabels,
    };
  }
}
