-- =============================================================================
-- GCP Vertex AI / Gemini Token Usage Monitoring — BigQuery SQL Queries
-- =============================================================================
-- Target Table: `GCP_PROJECT_ID.BQ_DATASET.gcp_billing_export_resource_v1_<BILLING_ACCOUNT_ID>`
--
-- Summary of Optimizations Applied:
-- 1. Partition Pruning: Filters on both `_PARTITIONTIME` (daily partition
--    pseudo-column) and `usage_start_time` to eliminate full-table scans.
-- 2. Column Pruning: Selects only required columns (`usage_start_time`,
--    `project`, `sku`, `service`, `labels`, `usage`, `cost`) in the base CTE.
-- 3. Scalar Subquery Label Extraction: Uses correlated scalar subqueries over
--    `UNNEST(labels)` instead of `CROSS JOIN UNNEST(labels)` to prevent row
--    multiplication (double-counting cost/tokens when multiple labels exist).
-- 4. Predicate Pushdown: Filters `service.description = 'Vertex AI'` and SKU
--    token/character patterns before aggregation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Base Filtered & Attributed CTE (used across KPI, Time-Series, Breakdowns)
-- Parameters:
--   @startTime TIMESTAMP
--   @endTime   TIMESTAMP
--   @projects  ARRAY<STRING> (empty array = all)
--   @users     ARRAY<STRING> (empty array = all)
--   @agents    ARRAY<STRING> (empty array = all)
-- -----------------------------------------------------------------------------
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
  FROM `${GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE}`
  WHERE
    -- Partition pruning on _PARTITIONTIME (+1 day buffer on upper bound for UTC alignment)
    _PARTITIONTIME >= TIMESTAMP_TRUNC(@startTime, DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_TRUNC(@endTime, DAY), INTERVAL 1 DAY)
    -- Exact timestamp window
    AND usage_start_time >= @startTime
    AND usage_start_time < @endTime
    -- Vertex AI / Gemini token & character SKUs
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
)

-- -----------------------------------------------------------------------------
-- 2. KPI Summary Aggregation (Current Period)
-- -----------------------------------------------------------------------------
SELECT
  COALESCE(SUM(CASE WHEN token_direction = 'input' THEN token_amount ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN token_direction = 'output' THEN token_amount ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(token_amount), 0) AS total_tokens,
  COALESCE(SUM(cost_usd), 0) AS total_cost_usd
FROM filtered_usage;
