import { Router, type Request, type Response } from 'express';
import { BigQueryAnalyticsClient } from '../bigquery/client.js';
import { MockAnalyticsClient } from '../bigquery/mockData.js';
import { buildLiveConfig, type AppConfig } from '../config.js';
import type { DashboardQueryParams, Granularity } from '../types.js';

export interface RuntimeState {
  config: AppConfig;
  client: BigQueryAnalyticsClient | MockAnalyticsClient | null;
}

function parseCsvParam(val: unknown): string[] {
  if (typeof val !== 'string' || val.trim() === '') return [];
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDateRange(req: Request): {
  startTime: string;
  endTime: string;
  granularity: Granularity;
} {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 7 * 24 * 3600_000);

  const rawStart = typeof req.query.startTime === 'string' ? req.query.startTime : '';
  const rawEnd = typeof req.query.endTime === 'string' ? req.query.endTime : '';

  const startDate = rawStart ? new Date(rawStart) : defaultStart;
  const endDate = rawEnd ? new Date(rawEnd) : now;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HttpError(400, 'Invalid startTime or endTime ISO timestamp.');
  }
  if (startDate >= endDate) {
    throw new HttpError(400, 'startTime must be strictly earlier than endTime.');
  }

  const diffHours = (endDate.getTime() - startDate.getTime()) / 3600_000;
  const rawGranularity = req.query.granularity;
  const granularity: Granularity =
    rawGranularity === 'minute' ||
    rawGranularity === 'hour' ||
    rawGranularity === 'day'
      ? rawGranularity
      : diffHours <= 2
        ? 'minute'
        : diffHours <= 48
          ? 'hour'
          : 'day';

  return {
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    granularity,
  };
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createAnalyticsRouter(state: RuntimeState): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      mode: state.config.demoMode ? 'demo' : 'live',
      needsSetup: state.config.needsSetup,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      mode: state.config.demoMode ? 'demo' : 'live',
      needsSetup: state.config.needsSetup,
      gcpProjectId: state.config.gcpProjectId,
      bqDataset: state.config.bqDataset,
      bqTable: state.config.bqTable,
      bqLocation: state.config.bqLocation,
      bqRealtimeDataset: state.config.bqRealtimeDataset,
      bqRealtimeTable: state.config.bqRealtimeTable,
      realtimeCutoffHours: state.config.realtimeCutoffHours,
    });
  });

  router.post('/config', async (req: Request, res: Response) => {
    try {
      const {
        mode = 'live',
        gcpProjectId = '',
        bqDataset = '',
        bqTable = '',
        bqLocation = 'US',
        bqRealtimeDataset = 'realtime_llm_telemetry',
        bqRealtimeTable = 'token_usage_logs',
        realtimeCutoffHours = 24,
        verify = true,
      } = req.body ?? {};

      if (mode === 'demo') {
        state.config = {
          ...state.config,
          demoMode: true,
          needsSetup: false,
        };
        state.client = new MockAnalyticsClient();
        res.json({
          mode: 'demo',
          needsSetup: false,
          gcpProjectId: state.config.gcpProjectId,
          bqDataset: state.config.bqDataset,
          bqTable: state.config.bqTable,
          bqLocation: state.config.bqLocation,
          bqRealtimeDataset: state.config.bqRealtimeDataset,
          bqRealtimeTable: state.config.bqRealtimeTable,
          realtimeCutoffHours: state.config.realtimeCutoffHours,
        });
        return;
      }

      if (!gcpProjectId || !bqDataset || !bqTable) {
        throw new HttpError(
          400,
          'GCP Project ID, BigQuery Dataset, and Billing Export Table are required.'
        );
      }

      let nextConfig: AppConfig;
      try {
        nextConfig = buildLiveConfig(state.config.port, {
          gcpProjectId: String(gcpProjectId),
          bqDataset: String(bqDataset),
          bqTable: String(bqTable),
          bqLocation: String(bqLocation || 'US'),
          bqRealtimeDataset: String(bqRealtimeDataset ?? ''),
          bqRealtimeTable: String(bqRealtimeTable ?? ''),
          realtimeCutoffHours: Number(realtimeCutoffHours),
        });
      } catch (validationErr) {
        throw new HttpError(
          400,
          validationErr instanceof Error
            ? validationErr.message
            : 'Invalid BigQuery identifier'
        );
      }

      const nextClient = new BigQueryAnalyticsClient(nextConfig);
      let tableInfo: { numRows?: string; location?: string } | undefined;
      if (verify) {
        tableInfo = await nextClient.verifyTableAccess();
      }

      // Auto-provision the real-time telemetry dataset & partitioned table if missing
      let realtimeProvisioned:
        | { createdDataset: boolean; createdTable: boolean }
        | undefined;
      let realtimeProvisionWarning: string | undefined;
      if (nextConfig.fullyQualifiedRealtimeTable) {
        try {
          realtimeProvisioned = await nextClient.ensureRealtimeTelemetryTable();
        } catch (provErr) {
          realtimeProvisionWarning =
            provErr instanceof Error
              ? provErr.message
              : 'Could not auto-create real-time telemetry table.';
          console.warn(
            '[TokenMonitor] Real-time table auto-setup skipped:',
            realtimeProvisionWarning
          );
        }
      }

      state.config = nextConfig;
      state.client = nextClient;

      res.json({
        mode: 'live',
        needsSetup: false,
        gcpProjectId: nextConfig.gcpProjectId,
        bqDataset: nextConfig.bqDataset,
        bqTable: nextConfig.bqTable,
        bqLocation: nextConfig.bqLocation,
        bqRealtimeDataset: nextConfig.bqRealtimeDataset,
        bqRealtimeTable: nextConfig.bqRealtimeTable,
        realtimeCutoffHours: nextConfig.realtimeCutoffHours,
        tableInfo,
        realtimeProvisioned,
        realtimeProvisionWarning,
      });
    } catch (err) {
      handleApiError(err, res);
    }
  });

  router.get('/filters', async (req: Request, res: Response) => {
    try {
      if (state.config.needsSetup || !state.client) {
        res.status(412).json({
          error: 'BigQuery billing export location is not configured yet.',
          needsSetup: true,
        });
        return;
      }
      const { startTime, endTime } = parseDateRange(req);
      const filters = await state.client.getFilterOptions(startTime, endTime);
      res.json(filters);
    } catch (err) {
      handleApiError(err, res);
    }
  });

  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      if (state.config.needsSetup || !state.client) {
        res.status(412).json({
          error: 'BigQuery billing export location is not configured yet.',
          needsSetup: true,
        });
        return;
      }
      const { startTime, endTime, granularity } = parseDateRange(req);
      const params: DashboardQueryParams = {
        startTime,
        endTime,
        granularity,
        projects: parseCsvParam(req.query.projects),
        users: parseCsvParam(req.query.users),
        agents: parseCsvParam(req.query.agents),
      };
      const data = await state.client.getDashboardData(params);
      res.json(data);
    } catch (err) {
      handleApiError(err, res);
    }
  });

  return router;
}

function handleApiError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const message =
    err instanceof Error ? err.message : 'Unexpected BigQuery server error';
  console.error('[Analytics API Error]', err);

  const isAuthError =
    message.includes('Could not load the default credentials') ||
    message.includes('Permission denied') ||
    message.includes('Access Denied');

  res.status(isAuthError ? 403 : 500).json({
    error: message,
    hint: isAuthError
      ? 'Verify Application Default Credentials (gcloud auth application-default login) and IAM roles (roles/bigquery.dataViewer, roles/bigquery.jobUser).'
      : undefined,
  });
}
