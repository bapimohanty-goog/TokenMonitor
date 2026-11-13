import type { Granularity } from '../types.js';

function baseRealtimeCte(fullyQualifiedRealtimeTable: string): string {
  return `
WITH model_pricing AS (
  SELECT 'gemini-2.5-pro' AS model_prefix, 1.25 AS input_per_1m, 10.00 AS output_per_1m, 0.3125 AS cached_per_1m UNION ALL
  SELECT 'gemini-2.5-flash',                0.15,                  0.60,                   0.0375                   UNION ALL
  SELECT 'gemini-2.0-flash',                0.10,                  0.40,                   0.0250                   UNION ALL
  SELECT 'gemini-1.5-pro',                  1.25,                  5.00,                   0.3125                   UNION ALL
  SELECT 'gemini-1.5-flash',                0.075,                 0.30,                   0.01875
),
raw_telemetry AS (
  SELECT
    timestamp,
    COALESCE(NULLIF(jsonPayload.project_id, ''), 'unassigned') AS project_id,
    COALESCE(NULLIF(jsonPayload.project_id, ''), 'unassigned') AS project_name,
    COALESCE(NULLIF(jsonPayload.user_id, ''), 'unassigned') AS user_id,
    COALESCE(NULLIF(jsonPayload.agent_id, ''), 'unassigned') AS agent_id,
    COALESCE(NULLIF(jsonPayload.model_version, ''), 'gemini-2.5-flash') AS model_version,
    COALESCE(SAFE_CAST(jsonPayload.prompt_token_count AS FLOAT64), 0) AS input_tokens,
    COALESCE(SAFE_CAST(jsonPayload.candidates_token_count AS FLOAT64), 0) AS output_tokens,
    COALESCE(SAFE_CAST(jsonPayload.cached_content_token_count AS FLOAT64), 0) AS cached_tokens,
    COALESCE(
      SAFE_CAST(jsonPayload.total_token_count AS FLOAT64),
      COALESCE(SAFE_CAST(jsonPayload.prompt_token_count AS FLOAT64), 0) +
      COALESCE(SAFE_CAST(jsonPayload.candidates_token_count AS FLOAT64), 0)
    ) AS total_tokens
  FROM ${fullyQualifiedRealtimeTable}
  WHERE
    timestamp >= @startTime
    AND timestamp < @endTime
    AND jsonPayload.event = 'llm_token_usage'
),
filtered_telemetry AS (
  SELECT
    r.timestamp,
    r.project_id,
    r.project_name,
    r.user_id,
    r.agent_id,
    r.model_version,
    r.input_tokens,
    r.output_tokens,
    r.total_tokens,
    (
      (GREATEST(r.input_tokens - r.cached_tokens, 0) / 1000000.0) * COALESCE(p.input_per_1m, 0.15) +
      (r.cached_tokens / 1000000.0) * COALESCE(p.cached_per_1m, 0.0375) +
      (r.output_tokens / 1000000.0) * COALESCE(p.output_per_1m, 0.60)
    ) AS cost_usd
  FROM raw_telemetry AS r
  LEFT JOIN model_pricing AS p
    ON STARTS_WITH(LOWER(r.model_version), p.model_prefix)
  WHERE
    (ARRAY_LENGTH(@projects) = 0 OR r.project_id IN UNNEST(@projects))
    AND (ARRAY_LENGTH(@users) = 0 OR r.user_id IN UNNEST(@users))
    AND (ARRAY_LENGTH(@agents) = 0 OR r.agent_id IN UNNEST(@agents))
)
`;
}

export function buildRealtimeKpiQuery(fullyQualifiedRealtimeTable: string): string {
  return `
${baseRealtimeCte(fullyQualifiedRealtimeTable)}
SELECT
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(total_tokens), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS total_cost_usd
FROM filtered_telemetry
`;
}

export function buildRealtimeTimeSeriesQuery(
  fullyQualifiedRealtimeTable: string,
  granularity: Granularity
): string {
  const truncUnit =
    granularity === 'minute' ? 'MINUTE' : granularity === 'hour' ? 'HOUR' : 'DAY';
  return `
${baseRealtimeCte(fullyQualifiedRealtimeTable)}
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_TRUNC(timestamp, ${truncUnit})) AS bucket,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(total_tokens), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_telemetry
GROUP BY bucket
ORDER BY bucket ASC
`;
}

export function buildRealtimeBreakdownQuery(
  fullyQualifiedRealtimeTable: string,
  dimension: 'project' | 'user' | 'agent'
): string {
  const idExpr =
    dimension === 'project'
      ? 'project_id'
      : dimension === 'user'
        ? 'user_id'
        : 'agent_id';
  return `
${baseRealtimeCte(fullyQualifiedRealtimeTable)}
SELECT
  ${idExpr} AS id,
  ${idExpr} AS name,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(total_tokens), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_telemetry
GROUP BY id
ORDER BY total_tokens DESC
LIMIT 20
`;
}

export function buildRealtimeUsageTableQuery(
  fullyQualifiedRealtimeTable: string,
  granularity: Granularity
): string {
  const truncUnit =
    granularity === 'minute' ? 'MINUTE' : granularity === 'hour' ? 'HOUR' : 'DAY';
  return `
${baseRealtimeCte(fullyQualifiedRealtimeTable)}
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_TRUNC(timestamp, ${truncUnit})) AS timestamp,
  project_id,
  project_name,
  user_id,
  agent_id,
  model_version AS sku_description,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(total_tokens), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_telemetry
GROUP BY timestamp, project_id, project_name, user_id, agent_id, sku_description
ORDER BY timestamp DESC, total_tokens DESC
LIMIT 250
`;
}
