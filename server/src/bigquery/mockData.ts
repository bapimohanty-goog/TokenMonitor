import type {
  BreakdownItem,
  DashboardQueryParams,
  DashboardResponse,
  DataSource,
  FilterOptionsResponse,
  Granularity,
  TimeSeriesPoint,
  UsageRow,
} from '../types.js';

interface RawMockRecord {
  timestampMs: number;
  projectId: string;
  projectName: string;
  userId: string;
  agentId: string;
  skuDescription: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const PROJECTS = [
  { id: 'prod-ai-platform', name: 'Production AI Platform' },
  { id: 'eng-copilot-dev', name: 'Engineering Copilot Dev' },
  { id: 'support-automation', name: 'Support Automation' },
  { id: 'data-rag-pipeline', name: 'Data & RAG Pipeline' },
];

const USERS = [
  'alice.chen',
  'marcus.vance',
  'priya.patel',
  'david.kim',
  'elena.rostova',
  'unassigned',
];

const AGENTS = [
  'code-reviewer-v2',
  'support-triage-bot',
  'sql-analyst-agent',
  'doc-summarizer',
  'rag-retriever',
  'unassigned',
];

const SKUS = [
  { name: 'Gemini 2.5 Pro', inputRatePer1M: 1.25, outputRatePer1M: 10.0 },
  { name: 'Gemini 2.5 Flash', inputRatePer1M: 0.15, outputRatePer1M: 0.6 },
  { name: 'Gemini 2.0 Flash', inputRatePer1M: 0.1, outputRatePer1M: 0.4 },
];

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

let cachedRecords: RawMockRecord[] | null = null;

function getMockRecords(): RawMockRecord[] {
  if (cachedRecords) return cachedRecords;

  const rand = seededRandom(42026);
  const now = new Date();
  now.setSeconds(0, 0);
  const nowMs = now.getTime();
  const daysBack = 60;
  const hoursBack = daysBack * 24;

  const records: RawMockRecord[] = [];

  // Hourly records for [60 days ago .. 2 hours ago]
  for (let h = hoursBack; h >= 2; h--) {
    const tsMs = nowMs - h * 3600_000;
    const hourOfDay = new Date(tsMs).getUTCHours();
    const diurnalMultiplier = hourOfDay >= 13 && hourOfDay <= 22 ? 1.6 : 0.7;
    const growthMultiplier = 1 + ((hoursBack - h) / hoursBack) * 0.35;

    const entriesThisHour = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < entriesThisHour; i++) {
      const project = PROJECTS[Math.floor(rand() * PROJECTS.length)];
      const user = USERS[Math.floor(rand() * USERS.length)];
      const agent = AGENTS[Math.floor(rand() * AGENTS.length)];
      const sku = SKUS[Math.floor(rand() * SKUS.length)];

      const baseInput = Math.round(
        (45_000 + rand() * 320_000) * diurnalMultiplier * growthMultiplier
      );
      const outputRatio = 0.22 + rand() * 0.35;
      const baseOutput = Math.round(baseInput * outputRatio);

      const costUsd =
        (baseInput / 1_000_000) * sku.inputRatePer1M +
        (baseOutput / 1_000_000) * sku.outputRatePer1M;

      records.push({
        timestampMs: tsMs,
        projectId: project.id,
        projectName: project.name,
        userId: user,
        agentId: agent,
        skuDescription: sku.name,
        inputTokens: baseInput,
        outputTokens: baseOutput,
        costUsd: Number(costUsd.toFixed(6)),
      });
    }
  }

  // Minute-level records for the last 120 minutes for live 1-Min granularity
  for (let m = 119; m >= 0; m--) {
    const tsMs = nowMs - m * 60_000;
    const entriesThisMin = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < entriesThisMin; i++) {
      const project = PROJECTS[Math.floor(rand() * PROJECTS.length)];
      const user = USERS[Math.floor(rand() * USERS.length)];
      const agent = AGENTS[Math.floor(rand() * AGENTS.length)];
      const sku = SKUS[Math.floor(rand() * SKUS.length)];

      const baseInput = Math.round(4_000 + rand() * 28_000);
      const baseOutput = Math.round(baseInput * (0.25 + rand() * 0.35));
      const costUsd =
        (baseInput / 1_000_000) * sku.inputRatePer1M +
        (baseOutput / 1_000_000) * sku.outputRatePer1M;

      records.push({
        timestampMs: tsMs,
        projectId: project.id,
        projectName: project.name,
        userId: user,
        agentId: agent,
        skuDescription: sku.name,
        inputTokens: baseInput,
        outputTokens: baseOutput,
        costUsd: Number(costUsd.toFixed(6)),
      });
    }
  }

  cachedRecords = records;
  return records;
}

function truncateBucket(tsMs: number, granularity: Granularity): string {
  const d = new Date(tsMs);
  if (granularity === 'minute') {
    d.setUTCSeconds(0, 0);
  } else if (granularity === 'hour') {
    d.setUTCMinutes(0, 0, 0);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d.toISOString().replace('.000Z', 'Z');
}

function computeCutoffMs(granularity: Granularity): number {
  const d = new Date(Date.now() - 24 * 3600_000);
  if (granularity === 'day') {
    d.setUTCHours(0, 0, 0, 0);
  } else if (granularity === 'hour') {
    d.setUTCMinutes(0, 0, 0);
  } else {
    d.setUTCSeconds(0, 0);
  }
  return d.getTime();
}

export class MockAnalyticsClient {
  async getFilterOptions(): Promise<FilterOptionsResponse> {
    return {
      projects: PROJECTS.map((p) => ({ id: p.id, label: p.name })),
      users: USERS.map((u) => ({ id: u, label: u })),
      agents: AGENTS.map((a) => ({ id: a, label: a })),
      hasUnlabelledData: true,
    };
  }

  async getDashboardData(params: DashboardQueryParams): Promise<DashboardResponse> {
    const records = getMockRecords();
    const startMs = Date.parse(params.startTime);
    const endMs = Date.parse(params.endTime);
    const durationMs = Math.max(endMs - startMs, 3600_000);
    const prevStartMs = startMs - durationMs;
    const cutoffMs = computeCutoffMs(params.granularity);

    const matchesDimension = (r: RawMockRecord) =>
      (params.projects.length === 0 || params.projects.includes(r.projectId)) &&
      (params.users.length === 0 || params.users.includes(r.userId)) &&
      (params.agents.length === 0 || params.agents.includes(r.agentId));

    const currentRows = records.filter(
      (r) => r.timestampMs >= startMs && r.timestampMs < endMs && matchesDimension(r)
    );
    const prevRows = records.filter(
      (r) => r.timestampMs >= prevStartMs && r.timestampMs < startMs && matchesDimension(r)
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let reconciledCostUsd = 0;
    let estimatedCostUsd = 0;

    const tsMap = new Map<string, TimeSeriesPoint>();
    const projectMap = new Map<string, BreakdownItem>();
    const userMap = new Map<string, BreakdownItem>();
    const agentMap = new Map<string, BreakdownItem>();
    const tableMap = new Map<string, UsageRow>();

    for (const r of currentRows) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      const bucket = truncateBucket(r.timestampMs, params.granularity);
      const bucketMs = Date.parse(bucket);
      const dataSource: DataSource =
        bucketMs >= cutoffMs ? 'realtime_estimated' : 'billing_reconciled';

      if (dataSource === 'billing_reconciled') {
        reconciledCostUsd += r.costUsd;
      } else {
        estimatedCostUsd += r.costUsd;
      }

      const rowTotal = r.inputTokens + r.outputTokens;

      const ts = tsMap.get(bucket) ?? {
        bucket,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        dataSource,
      };
      ts.inputTokens += r.inputTokens;
      ts.outputTokens += r.outputTokens;
      ts.totalTokens += rowTotal;
      ts.costUsd += r.costUsd;
      tsMap.set(bucket, ts);

      const addBreakdown = (
        map: Map<string, BreakdownItem>,
        id: string,
        name: string
      ) => {
        const item = map.get(id) ?? {
          id,
          name,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        };
        item.inputTokens += r.inputTokens;
        item.outputTokens += r.outputTokens;
        item.totalTokens += rowTotal;
        item.costUsd += r.costUsd;
        map.set(id, item);
      };

      addBreakdown(projectMap, r.projectId, r.projectName);
      addBreakdown(userMap, r.userId, r.userId);
      addBreakdown(agentMap, r.agentId, r.agentId);

      const tableKey = `${bucket}|${r.projectId}|${r.userId}|${r.agentId}|${r.skuDescription}|${dataSource}`;
      const existingRow = tableMap.get(tableKey) ?? {
        timestamp: bucket,
        projectId: r.projectId,
        projectName: r.projectName,
        userId: r.userId,
        agentId: r.agentId,
        skuDescription: r.skuDescription,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        dataSource,
      };
      existingRow.inputTokens += r.inputTokens;
      existingRow.outputTokens += r.outputTokens;
      existingRow.totalTokens += rowTotal;
      existingRow.costUsd += r.costUsd;
      tableMap.set(tableKey, existingRow);
    }

    const totalTokens = inputTokens + outputTokens;
    const totalCostUsd = reconciledCostUsd + estimatedCostUsd;
    let previousTotalTokens = 0;
    let previousTotalCostUsd = 0;
    for (const r of prevRows) {
      previousTotalTokens += r.inputTokens + r.outputTokens;
      previousTotalCostUsd += r.costUsd;
    }

    const sortTop10 = (map: Map<string, BreakdownItem>) =>
      Array.from(map.values())
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, 10);

    const agents = sortTop10(agentMap);
    const users = sortTop10(userMap);
    const projects = sortTop10(projectMap);

    const topAgentRow = agents.find((a) => a.id !== 'unassigned') ?? agents[0] ?? null;

    const timeSeries = Array.from(tsMap.values()).sort((a, b) =>
      a.bucket.localeCompare(b.bucket)
    );

    const usageRows = Array.from(tableMap.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.totalTokens - a.totalTokens)
      .slice(0, 500);

    return {
      mode: 'demo',
      realtimeStatus: 'active',
      cutoffTime: new Date(cutoffMs).toISOString(),
      lastUpdated: new Date().toISOString(),
      kpis: {
        totalTokens,
        previousTotalTokens,
        tokenChangePercent:
          previousTotalTokens > 0
            ? ((totalTokens - previousTotalTokens) / previousTotalTokens) * 100
            : null,
        inputTokens,
        outputTokens,
        inputOutputRatio: outputTokens > 0 ? inputTokens / outputTokens : null,
        totalCostUsd,
        reconciledCostUsd,
        estimatedCostUsd,
        previousTotalCostUsd,
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
      hasAnyLabels:
        users.some((u) => u.id !== 'unassigned') ||
        agents.some((a) => a.id !== 'unassigned'),
    };
  }
}
