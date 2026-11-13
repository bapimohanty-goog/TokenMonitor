import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9_-]+$/;
const SAFE_PROJECT_RE = /^[a-z0-9.:-]+$/;
const SAFE_LOCATION_RE = /^[A-Za-z0-9_-]+$/;

export function assertSafeIdentifier(
  value: string,
  name: string,
  pattern: RegExp
): string {
  if (!pattern.test(value)) {
    throw new Error(
      `Invalid ${name} format: "${value}". Must match ${pattern.toString()}.`
    );
  }
  return value;
}

export interface AppConfig {
  port: number;
  demoMode: boolean;
  needsSetup: boolean;
  gcpProjectId: string;
  bqDataset: string;
  bqTable: string;
  bqLocation: string;
  fullyQualifiedTable: string;
  bqRealtimeDataset: string;
  bqRealtimeTable: string;
  fullyQualifiedRealtimeTable: string;
  realtimeCutoffHours: number;
}

function buildRealtimeFqn(
  projectId: string,
  dataset: string,
  table: string
): string {
  if (!projectId || !dataset || !table) return '';
  assertSafeIdentifier(projectId, 'GCP_PROJECT_ID', SAFE_PROJECT_RE);
  assertSafeIdentifier(dataset, 'BQ_REALTIME_DATASET', SAFE_IDENTIFIER_RE);
  assertSafeIdentifier(table, 'BQ_REALTIME_TABLE', SAFE_IDENTIFIER_RE);
  return `\`${projectId}.${dataset}.${table}\``;
}

export function buildLiveConfig(
  port: number,
  input: {
    gcpProjectId: string;
    bqDataset: string;
    bqTable: string;
    bqLocation?: string;
    bqRealtimeDataset?: string;
    bqRealtimeTable?: string;
    realtimeCutoffHours?: number;
  }
): AppConfig {
  const gcpProjectId = assertSafeIdentifier(
    input.gcpProjectId.trim(),
    'GCP_PROJECT_ID',
    SAFE_PROJECT_RE
  );
  const bqDataset = assertSafeIdentifier(
    input.bqDataset.trim(),
    'BQ_DATASET',
    SAFE_IDENTIFIER_RE
  );
  const bqTable = assertSafeIdentifier(
    input.bqTable.trim(),
    'BQ_TABLE',
    SAFE_IDENTIFIER_RE
  );
  const bqLocation = assertSafeIdentifier(
    (input.bqLocation || 'US').trim(),
    'BQ_LOCATION',
    SAFE_LOCATION_RE
  );

  const bqRealtimeDataset = (input.bqRealtimeDataset ?? 'realtime_llm_telemetry').trim();
  const bqRealtimeTable = (input.bqRealtimeTable ?? 'token_usage_logs').trim();
  const cutoff = Number(input.realtimeCutoffHours ?? 24);
  const realtimeCutoffHours =
    Number.isFinite(cutoff) && cutoff >= 1 && cutoff <= 72 ? cutoff : 24;

  return {
    port,
    demoMode: false,
    needsSetup: false,
    gcpProjectId,
    bqDataset,
    bqTable,
    bqLocation,
    fullyQualifiedTable: `\`${gcpProjectId}.${bqDataset}.${bqTable}\``,
    bqRealtimeDataset,
    bqRealtimeTable,
    fullyQualifiedRealtimeTable: buildRealtimeFqn(
      gcpProjectId,
      bqRealtimeDataset,
      bqRealtimeTable
    ),
    realtimeCutoffHours,
  };
}

export function loadConfig(): AppConfig {
  const rawPort = Number.parseInt(process.env.PORT || '4000', 10);
  const port = Number.isFinite(rawPort) ? rawPort : 4000;
  const demoMode = process.env.DEMO_MODE === 'true';

  const gcpProjectId = (process.env.GCP_PROJECT_ID || '').trim();
  const bqDataset = (process.env.BQ_DATASET || '').trim();
  const bqTable = (process.env.BQ_TABLE || '').trim();
  const bqLocation = (process.env.BQ_LOCATION || 'US').trim();
  const bqRealtimeDataset = (
    process.env.BQ_REALTIME_DATASET || 'realtime_llm_telemetry'
  ).trim();
  const bqRealtimeTable = (
    process.env.BQ_REALTIME_TABLE || 'token_usage_logs'
  ).trim();
  const rawCutoff = Number.parseInt(
    process.env.REALTIME_CUTOFF_HOURS || '24',
    10
  );
  const realtimeCutoffHours =
    Number.isFinite(rawCutoff) && rawCutoff >= 1 && rawCutoff <= 72
      ? rawCutoff
      : 24;

  if (demoMode) {
    return {
      port,
      demoMode: true,
      needsSetup: false,
      gcpProjectId,
      bqDataset,
      bqTable,
      bqLocation,
      fullyQualifiedTable:
        gcpProjectId && bqDataset && bqTable
          ? `\`${gcpProjectId}.${bqDataset}.${bqTable}\``
          : '',
      bqRealtimeDataset,
      bqRealtimeTable,
      fullyQualifiedRealtimeTable: '',
      realtimeCutoffHours,
    };
  }

  if (!gcpProjectId || !bqDataset || !bqTable) {
    return {
      port,
      demoMode: false,
      needsSetup: true,
      gcpProjectId,
      bqDataset,
      bqTable,
      bqLocation,
      fullyQualifiedTable: '',
      bqRealtimeDataset,
      bqRealtimeTable,
      fullyQualifiedRealtimeTable: '',
      realtimeCutoffHours,
    };
  }

  return buildLiveConfig(port, {
    gcpProjectId,
    bqDataset,
    bqTable,
    bqLocation,
    bqRealtimeDataset,
    bqRealtimeTable,
    realtimeCutoffHours,
  });
}
