# Deploying GCP Token Monitor to Google Cloud (Cloud Run)

This guide walks through deploying **GCP Token Monitor** to **Cloud Run** in your Google Cloud project using a dedicated least-privilege Service Account and Application Default Credentials (ADC).

---

## Prerequisites

- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login`).
- An active GCP Project with **Cloud Billing** enabled.
- A **Cloud Billing Detailed Usage Cost** export table in BigQuery (`gcp_billing_export_resource_v1_<BILLING_ACCOUNT_ID>`).

---

## Step 1: Set Environment Variables

Set your target project, region, and BigQuery billing export details in your shell:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export BQ_PROJECT_ID="your-billing-bq-project-id"   # Often same as PROJECT_ID
export BQ_DATASET="billing_export"
export BQ_TABLE="gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX"
export BQ_LOCATION="US"

gcloud config set project "${PROJECT_ID}"
```

---

## Step 2: Enable Required GCP APIs

Enable Cloud Run, Cloud Build, Artifact Registry, and BigQuery APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com
```

---

## Step 3: Create a Dedicated Service Account & Grant IAM Roles

Create a service account for Cloud Run and grant only the required BigQuery roles (`roles/bigquery.jobUser` to run queries and `roles/bigquery.dataViewer` to read the billing export table):

```bash
export SA_NAME="token-monitor-sa"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="GCP Token Monitor Service Account"

# Allow running BigQuery query jobs in the target project
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser"

# Allow reading BigQuery tables (if billing export lives in a separate project, use $BQ_PROJECT_ID)
gcloud projects add-iam-policy-binding "${BQ_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataViewer"
```

> **Tip (Least Privilege):** Instead of granting `roles/bigquery.dataViewer` at the project level, you can grant it specifically on the `${BQ_DATASET}` dataset using `bq update --source` or the GCP Console **BigQuery → Dataset → Sharing → Permissions**.

---

## Step 4: Deploy to Cloud Run

From the repository root (`/Users/bapimohanty/TokenMonitor`), deploy directly from source using the included [Dockerfile](file:///Users/bapimohanty/TokenMonitor/Dockerfile):

```bash
gcloud run deploy token-monitor \
  --source . \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --set-env-vars "DEMO_MODE=false,GCP_PROJECT_ID=${BQ_PROJECT_ID},BQ_DATASET=${BQ_DATASET},BQ_TABLE=${BQ_TABLE},BQ_LOCATION=${BQ_LOCATION}" \
  --no-allow-unauthenticated
```

> **Public vs. Authenticated Access:**
> - `--no-allow-unauthenticated` (recommended for internal cost dashboards) requires IAM authentication or Identity-Aware Proxy (IAP) to access the dashboard.
> - To grant a team member access, run:
>   ```bash
>   gcloud run services add-iam-policy-binding token-monitor \
>     --region "${REGION}" \
>     --member="user:teammate@yourdomain.com" \
>     --role="roles/run.invoker"
>   ```
> - If you want to test quickly behind a local authenticated proxy:
>   ```bash
>   gcloud run services proxy token-monitor --region "${REGION}" --port 8080
>   ```
>   Then open `http://localhost:8080` in your browser.

---

## Step 5: Set Up Real-Time Telemetry (Cloud Logging Sink → BigQuery)

To eliminate the 12–24 hour Cloud Billing export delay, configure a Cloud Logging Sink that streams structured SDK logs (`event = "llm_token_usage"`) into a partitioned BigQuery dataset (`realtime_llm_telemetry`):

> **Auto-Provisioning:** On startup (and whenever you save **Data Source** settings in the UI), the application automatically creates the `realtime_llm_telemetry` dataset and day-partitioned `token_usage_logs` table if they do not exist yet (requires `roles/bigquery.dataEditor` on `${PROJECT_ID}` for the Cloud Run service account, or you can create the dataset/sink below).

1. **Create the BigQuery dataset** (optional if auto-provisioned):
   ```bash
   bq --location="${BQ_LOCATION}" mk --dataset "${PROJECT_ID}:realtime_llm_telemetry"
   ```

2. **Create the Cloud Logging Sink with partitioned tables**:
   ```bash
   gcloud logging sinks create token-monitor-realtime-sink \
     "bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/realtime_llm_telemetry" \
     --log-filter='jsonPayload.event="llm_token_usage"' \
     --use-partitioned-tables
   ```

3. **Grant `roles/bigquery.dataEditor` to the Sink's Writer Identity**:
   ```bash
   export SINK_WRITER=$(gcloud logging sinks describe token-monitor-realtime-sink \
     --format='value(writerIdentity)')

   gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
     --member="${SINK_WRITER}" \
     --role="roles/bigquery.dataEditor"
   ```

4. **Pass the Real-Time Table Env Vars to Cloud Run** (optional—defaults to `realtime_llm_telemetry.token_usage_logs` with a 24h cutoff):
   ```bash
   gcloud run services update token-monitor \
     --region "${REGION}" \
     --update-env-vars "BQ_REALTIME_DATASET=realtime_llm_telemetry,BQ_REALTIME_TABLE=token_usage_logs,REALTIME_CUTOFF_HOURS=24"
   ```

   Use the SDK wrappers in [instrumentation/python/gemini_telemetry.py](./instrumentation/python/gemini_telemetry.py) or [instrumentation/node/geminiTelemetry.ts](./instrumentation/node/geminiTelemetry.ts) in your AI services so `usageMetadata` is streamed to BigQuery within seconds.

---

## Step 6: Verify Deployment

1. Check the health endpoint (using `gcloud run services proxy` or an authenticated `curl`):
   ```bash
   curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     "$(gcloud run services describe token-monitor --region "${REGION}" --format='value(status.url)')/api/health"
   ```
   Expected response:
   ```json
   {"status":"ok","mode":"live","timestamp":"..."}
   ```
2. Open the Cloud Run service URL (or `http://localhost:8080` via `gcloud run services proxy`) and confirm the top-left badge displays **BigQuery Live**.

---

## Troubleshooting

- **`Could not load the default credentials` / `Permission denied` (HTTP 403)**:
  Verify that `--service-account "${SA_EMAIL}"` is attached to the Cloud Run revision and has both `roles/bigquery.jobUser` (on `PROJECT_ID`) and `roles/bigquery.dataViewer` (on `BQ_PROJECT_ID` / `BQ_DATASET`).
- **`Not found: Dataset ... was not found in location ...`**:
  Ensure `BQ_LOCATION` matches the multi-region or region of your BigQuery billing export dataset (typically `US` or `EU`).
- **All users/agents show as `unassigned`**:
  Ensure your Vertex AI / Gemini API calls include `labels: { user_id: "...", agent_id: "..." }` as documented in [README.md](file:///Users/bapimohanty/TokenMonitor/README.md).
