import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQueryAnalyticsClient } from './bigquery/client.js';
import { MockAnalyticsClient } from './bigquery/mockData.js';
import { loadConfig } from './config.js';
import { createAnalyticsRouter, type RuntimeState } from './routes/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bootstrap(): void {
  const config = loadConfig();
  const app = express();

  app.use(cors());
  app.use(express.json());

  const state: RuntimeState = {
    config,
    client: config.demoMode
      ? new MockAnalyticsClient()
      : config.needsSetup
        ? null
        : new BigQueryAnalyticsClient(config),
  };

  app.use('/api', createAnalyticsRouter(state));

  // Serve built Vite frontend in production if present
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.listen(config.port, () => {
    const modeLabel = config.demoMode
      ? 'demo'
      : config.needsSetup
        ? 'awaiting-setup'
        : 'live';
    console.log(
      `[TokenMonitor Server] Listening on http://localhost:${config.port} (mode: ${modeLabel})`
    );
    if (!config.demoMode && !config.needsSetup) {
      console.log(
        `[TokenMonitor Server] BigQuery table: ${config.fullyQualifiedTable} (location: ${config.bqLocation})`
      );
      if (state.client instanceof BigQueryAnalyticsClient && config.fullyQualifiedRealtimeTable) {
        state.client
          .ensureRealtimeTelemetryTable()
          .then(({ createdDataset, createdTable }) => {
            if (createdDataset || createdTable) {
              console.log(
                `[TokenMonitor Server] Auto-created real-time telemetry resource(s): dataset=${createdDataset}, table=${createdTable} (${config.fullyQualifiedRealtimeTable})`
              );
            }
          })
          .catch((err) => {
            console.warn(
              '[TokenMonitor Server] Could not auto-create real-time telemetry table:',
              err instanceof Error ? err.message : err
            );
          });
      }
    }
  });
}

bootstrap();
