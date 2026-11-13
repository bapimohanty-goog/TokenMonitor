import type { Granularity } from '../types.js';

function baseUsageCte(fullyQualifiedTable: string): string {
  return `
WITH base_usage AS (
  SELECT
    usage_start_time,
    COALESCE(project.id, 'unassigned') AS project_id,
    COALESCE(project.name, project.id, 'unassigned') AS project_name,
    COALESCE(
      (
        SELECT l.value
        FROM UNNEST(labels) AS l
        WHERE LOWER(l.key) IN ('user_id', 'user')
        LIMIT 1
      ),
      'unassigned'
    ) AS user_id,
    COALESCE(
      (
        SELECT l.value
        FROM UNNEST(labels) AS l
        WHERE LOWER(l.key) IN ('agent_id', 'agent')
        LIMIT 1
      ),
      'unassigned'
    ) AS agent_id,
    sku.description AS sku_description,
    TRIM(REGEXP_REPLACE(sku.description, r'(?i)\s*\b(input|output)\b\s*', ' ')) AS model_name,
    CASE
      WHEN LOWER(sku.description) LIKE '%input token%'
        OR LOWER(sku.description) LIKE '%input character%'
        OR LOWER(sku.description) LIKE '%prompt%' THEN 'input'
      WHEN LOWER(sku.description) LIKE '%output token%'
        OR LOWER(sku.description) LIKE '%output character%'
        OR LOWER(sku.description) LIKE '%response%'
        OR LOWER(sku.description) LIKE '%completion%' THEN 'output'
      ELSE 'other'
    END AS token_direction,
    COALESCE(usage.amount, 0) AS token_amount,
    COALESCE(cost, 0) AS cost_usd
  FROM ${fullyQualifiedTable}
  WHERE
    _PARTITIONTIME >= TIMESTAMP_TRUNC(@startTime, DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_TRUNC(@endTime, DAY), INTERVAL 1 DAY)
    AND usage_start_time >= @startTime
    AND usage_start_time < @endTime
    AND service.description = 'Vertex AI'
    AND (
      LOWER(sku.description) LIKE '%input token%'
      OR LOWER(sku.description) LIKE '%output token%'
      OR LOWER(sku.description) LIKE '%characters%'
      OR LOWER(sku.description) LIKE '%tokens%'
    )
),
filtered_usage AS (
  SELECT *
  FROM base_usage
  WHERE
    token_direction IN ('input', 'output')
    AND (ARRAY_LENGTH(@projects) = 0 OR project_id IN UNNEST(@projects))
    AND (ARRAY_LENGTH(@users) = 0 OR user_id IN UNNEST(@users))
    AND (ARRAY_LENGTH(@agents) = 0 OR agent_id IN UNNEST(@agents))
    AND (ARRAY_LENGTH(@models) = 0 OR model_name IN UNNEST(@models))
)
`;
}

export function buildFilterOptionsQuery(fullyQualifiedTable: string): string {
  return `
WITH base_filters AS (
  SELECT
    COALESCE(project.id, 'unassigned') AS project_id,
    COALESCE(project.name, project.id, 'unassigned') AS project_name,
    COALESCE(
      (
        SELECT l.value
        FROM UNNEST(labels) AS l
        WHERE LOWER(l.key) IN ('user_id', 'user')
        LIMIT 1
      ),
      'unassigned'
    ) AS user_id,
    COALESCE(
      (
        SELECT l.value
        FROM UNNEST(labels) AS l
        WHERE LOWER(l.key) IN ('agent_id', 'agent')
        LIMIT 1
      ),
      'unassigned'
    ) AS agent_id,
    TRIM(REGEXP_REPLACE(sku.description, r'(?i)\s*\b(input|output)\b\s*', ' ')) AS model_name
  FROM ${fullyQualifiedTable}
  WHERE
    _PARTITIONTIME >= TIMESTAMP_TRUNC(@startTime, DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_TRUNC(@endTime, DAY), INTERVAL 1 DAY)
    AND usage_start_time >= @startTime
    AND usage_start_time < @endTime
    AND service.description = 'Vertex AI'
    AND (
      LOWER(sku.description) LIKE '%input token%'
      OR LOWER(sku.description) LIKE '%output token%'
      OR LOWER(sku.description) LIKE '%characters%'
      OR LOWER(sku.description) LIKE '%tokens%'
    )
)
SELECT
  ARRAY_AGG(DISTINCT STRUCT(project_id AS id, project_name AS label) ORDER BY project_name) AS projects,
  ARRAY_AGG(DISTINCT user_id ORDER BY user_id) AS users,
  ARRAY_AGG(DISTINCT agent_id ORDER BY agent_id) AS agents,
  ARRAY_AGG(DISTINCT model_name ORDER BY model_name) AS models
FROM base_filters
`;
}

export function buildKpiSummaryQuery(fullyQualifiedTable: string): string {
  return `
${baseUsageCte(fullyQualifiedTable)}
SELECT
  COALESCE(SUM(CASE WHEN token_direction = 'input' THEN token_amount ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN token_direction = 'output' THEN token_amount ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(token_amount), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS total_cost_usd
FROM filtered_usage
`;
}

export function buildTimeSeriesQuery(
  fullyQualifiedTable: string,
  granularity: Granularity
): string {
  const truncUnit =
    granularity === 'minute' ? 'MINUTE' : granularity === 'hour' ? 'HOUR' : 'DAY';
  return `
${baseUsageCte(fullyQualifiedTable)}
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_TRUNC(usage_start_time, ${truncUnit})) AS bucket,
  COALESCE(SUM(CASE WHEN token_direction = 'input' THEN token_amount ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN token_direction = 'output' THEN token_amount ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(token_amount), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_usage
GROUP BY bucket
ORDER BY bucket ASC
`;
}

export function buildBreakdownQuery(
  fullyQualifiedTable: string,
  dimension: 'project' | 'user' | 'agent' | 'model'
): string {
  const idExpr =
    dimension === 'project'
      ? 'project_id'
      : dimension === 'user'
        ? 'user_id'
        : dimension === 'agent'
          ? 'agent_id'
          : 'model_name';
  const nameExpr = dimension === 'project' ? 'ANY_VALUE(project_name)' : idExpr;

  return `
${baseUsageCte(fullyQualifiedTable)}
SELECT
  ${idExpr} AS id,
  ${nameExpr} AS name,
  COALESCE(SUM(CASE WHEN token_direction = 'input' THEN token_amount ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN token_direction = 'output' THEN token_amount ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(token_amount), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_usage
GROUP BY id
ORDER BY total_tokens DESC
LIMIT 10
`;
}

export function buildUsageTableQuery(
  fullyQualifiedTable: string,
  granularity: Granularity
): string {
  const truncUnit =
    granularity === 'minute' ? 'MINUTE' : granularity === 'hour' ? 'HOUR' : 'DAY';
  return `
${baseUsageCte(fullyQualifiedTable)}
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', TIMESTAMP_TRUNC(usage_start_time, ${truncUnit})) AS timestamp,
  project_id,
  ANY_VALUE(project_name) AS project_name,
  user_id,
  agent_id,
  TRIM(REGEXP_REPLACE(sku_description, r'(?i)\\s*\\b(input|output)\\b\\s*', ' ')) AS sku_description,
  COALESCE(SUM(CASE WHEN token_direction = 'input' THEN token_amount ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN token_direction = 'output' THEN token_amount ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(token_amount), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
FROM filtered_usage
GROUP BY timestamp, project_id, user_id, agent_id, sku_description
ORDER BY timestamp DESC, total_tokens DESC
LIMIT 500
`;
}
