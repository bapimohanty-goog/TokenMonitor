-- =============================================================================
-- Real-Time LLM Telemetry — BigQuery Streaming Log Sink Query
-- =============================================================================
-- Target Table: `GCP_PROJECT_ID.realtime_llm_telemetry.token_usage_logs`
-- Created automatically by a Cloud Logging Sink with `--use-partitioned-tables`.
--
-- Summary of Optimizations Applied:
-- 1. Partition Pruning: Filters on `timestamp` (used by Cloud Logging's
--    partitioned BigQuery sink) to restrict scanned partitions to the live window.
-- 2. Column Pruning: Extracts only the required `jsonPayload` fields.
-- 3. Pricing Lookup CTE: Maps `model_version` patterns to per-1M token list
--    prices for real-time cost estimation prior to BQ Billing reconciliation.
-- =============================================================================

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
  FROM `${GCP_PROJECT_ID}.realtime_llm_telemetry.token_usage_logs`
  WHERE
    timestamp >= @startTime
    AND timestamp < @endTime
    AND jsonPayload.event = 'llm_token_usage'
),
priced_telemetry AS (
  SELECT
    r.*,
    COALESCE(p.input_per_1m, 0.15) AS input_per_1m,
    COALESCE(p.output_per_1m, 0.60) AS output_per_1m,
    COALESCE(p.cached_per_1m, 0.0375) AS cached_per_1m
  FROM raw_telemetry AS r
  LEFT JOIN model_pricing AS p
    ON STARTS_WITH(LOWER(r.model_version), p.model_prefix)
)
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_TRUNC(timestamp, MINUTE)) AS bucket,
  project_id,
  user_id,
  agent_id,
  model_version,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(
    (GREATEST(input_tokens - cached_tokens, 0) / 1000000.0) * input_per_1m +
    (cached_tokens / 1000000.0) * cached_per_1m +
    (output_tokens / 1000000.0) * output_per_1m
  ) AS estimated_cost_usd,
  'realtime_estimated' AS data_source
FROM priced_telemetry
WHERE
  (ARRAY_LENGTH(@projects) = 0 OR project_id IN UNNEST(@projects))
  AND (ARRAY_LENGTH(@users) = 0 OR user_id IN UNNEST(@users))
  AND (ARRAY_LENGTH(@agents) = 0 OR agent_id IN UNNEST(@agents))
GROUP BY bucket, project_id, user_id, agent_id, model_version
ORDER BY bucket DESC, total_tokens DESC;
