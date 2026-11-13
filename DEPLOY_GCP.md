# Deploying GCP Token Monitor to Google Cloud (Cloud Run)

This guide walks through deploying **GCP Token Monitor** to **Cloud Run** in your Google Cloud project using a dedicated least-privilege Service Account, Application Default Credentials (ADC), and an optional Cloud Logging Sink for real-time telemetry.

---

## Prerequisites

- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login`).
- An active GCP Project with **Cloud Billing** enabled.
- A **Cloud Billing Detailed Usage Cost** export table in BigQuery (`gcp_billing_export_resource_v1_<BILLING_ACCOUNT_ID>`). *(If you don't have the table ID handy at deploy time, you can still deploy and enter it later in the UI's **GCP Billing Export Location** dialog, or use **Simulated Demo Data**.)*

---

## Step 1: Set Environment Variables

Set your target project, region, and (optionally) your BigQuery billing export details:

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

Enable Cloud Run, Cloud Build, Artifact Registry, BigQuery, and Cloud Logging APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  logging.googleapis.com
```

---

## Step 3: Create Service Account & Grant IAM Roles

### A. Runtime Service Account (Cloud Run)
Create a dedicated service account for Cloud Run and grant the required BigQuery roles (`roles/bigquery.jobUser` to run queries, `roles/bigquery.dataViewer` to read the billing export table, and `roles/bigquery.dataEditor` if you want the app to auto-create the real-time telemetry dataset/table):

```bash
export SA_NAME="token-monitor-sa"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="GCP Token Monitor Service Account"

# Allow running BigQuery query jobs in the target project
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser"

# Allow auto-provisioning the real-time telemetry dataset/table in $PROJECT_ID
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataEditor"

# Allow reading BigQuery billing export tables (if in a separate project, use $BQ_PROJECT_ID)
gcloud projects add-iam-policy-binding "${BQ_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataViewer"
```

### B. Cloud Build Default Compute Service Account
Newer GCP projects require explicit Cloud Build permissions on the default compute service account (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) for `gcloud run deploy --source .`:

```bash
export PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for ROLE in roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/storage.objectViewer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="${ROLE}"
done
```

---

## Step 4: Deploy to Cloud Run

From the repository root, deploy directly from source using the included [Dockerfile](./Dockerfile):

### Option A: Deploy with Pre-Configured Billing Export
```bash
gcloud run deploy token-monitor \
  --source . \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --set-env-vars "DEMO_MODE=false,GCP_PROJECT_ID=${BQ_PROJECT_ID},BQ_DATASET=${BQ_DATASET},BQ_TABLE=${BQ_TABLE},BQ_LOCATION=${BQ_LOCATION},BQ_REALTIME_DATASET=realtime_llm_telemetry,BQ_REALTIME_TABLE=token_usage_logs,REALTIME_CUTOFF_HOURS=24" \
  --no-allow-unauthenticated
```

### Option B: Deploy & Configure Billing Export in the UI
Omit `GCP_PROJECT_ID`, `BQ_DATASET`, and `BQ_TABLE` at deploy time; the app will boot in `awaiting-setup` mode and prompt you for the BigQuery billing export location on first load:

```bash
gcloud run deploy token-monitor \
  --source . \
  --region "${REGION}" \
  --service-account "${SA_EMAIL}" \
  --set-env-vars "BQ_REALTIME_DATASET=realtime_llm_telemetry,BQ_REALTIME_TABLE=token_usage_logs,REALTIME_CUTOFF_HOURS=24" \
  --no-allow-unauthenticated
```

> **Authenticated Access:**
> - `--no-allow-unauthenticated` (recommended for internal cost dashboards) requires IAM authentication or Identity-Aware Proxy (IAP).
> - Grant access to yourself or teammates:
>   ```bash
>   gcloud run services add-iam-policy-binding token-monitor \
>     --region "${REGION}" \
>     --member="user:you@yourdomain.com" \
>     --role="roles/run.invoker"
>   ```
> - Open the dashboard locally via an authenticated proxy:
>   ```bash
>   gcloud run services proxy token-monitor --region "${REGION}" --port 8080
>   ```
>   Then open `http://localhost:8080` in your browser.

---

## Step 5: Set Up Real-Time Telemetry (Cloud Logging Sink → BigQuery)

To eliminate the 12–24 hour Cloud Billing export delay, configure a Cloud Logging Sink that streams structured SDK logs (`event = "llm_token_usage"`) into a partitioned BigQuery dataset (`realtime_llm_telemetry`):

> **Auto-Provisioning:** On startup (and whenever you save **Data Source** settings in the UI), the application automatically creates the `realtime_llm_telemetry` dataset and day-partitioned `token_usage_logs` table if they do not exist yet (requires `roles/bigquery.dataEditor` on `${PROJECT_ID}` for the Cloud Run service account).

1. **Create the BigQuery dataset** *(optional if auto-provisioned)*:
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

   Use the SDK wrappers in [instrumentation/python/gemini_telemetry.py](./instrumentation/python/gemini_telemetry.py) or [instrumentation/node/geminiTelemetry.ts](./instrumentation/node/geminiTelemetry.ts) in your AI services so `usageMetadata` is streamed to BigQuery within seconds.

---

## Step 6: Verify Deployment

1. Check the health and config endpoints using an authenticated identity token:
   ```bash
   SERVICE_URL=$(gcloud run services describe token-monitor --region "${REGION}" --format='value(status.url)')
   TOKEN=$(gcloud auth print-identity-token)

   curl -H "Authorization: Bearer ${TOKEN}" "${SERVICE_URL}/api/health"
   curl -H "Authorization: Bearer ${TOKEN}" "${SERVICE_URL}/api/config"
   ```
   Expected `/api/health` response:
   ```json
   {"status":"ok","mode":"live","needsSetup":false,"timestamp":"..."}
   ```
   *(If deployed with Option B, `"needsSetup":true` is expected until you configure the billing export in the UI.)*

2. Run `gcloud run services proxy token-monitor --region "${REGION}" --port 8080` and open `http://localhost:8080` in your browser.

---

## Troubleshooting

- **Cloud Build `PERMISSION_DENIED` for `...-compute@developer.gserviceaccount.com`**:
  Run Step 3B to grant `roles/cloudbuild.builds.builder`, `roles/artifactregistry.writer`, `roles/storage.objectViewer`, and `roles/logging.logWriter` to the compute service account.
- **Cloud Build fails on `npm ci` (restricted VPC / outbound `registry.npmjs.org` timeout)**:
  If your Cloud Build environment cannot reach `registry.npmjs.org`, build locally (`npm install && npm run install:all && npm run build`) and deploy with a temporary `.gcloudignore` and `Dockerfile` that copy `server/dist`, `client/dist`, and `server/node_modules` directly into `node:22-slim`.
- **`Could not load the default credentials` / `Permission denied` (HTTP 403)**:
  Verify that `--service-account "${SA_EMAIL}"` is attached to the Cloud Run revision and has `roles/bigquery.jobUser` and `roles/bigquery.dataViewer`.
- **`Not found: Dataset ... was not found in location ...`**:
  Ensure `BQ_LOCATION` matches the multi-region or region of your BigQuery billing export dataset (typically `US` or `EU`).
- **All users/agents show as `unassigned`**:
  Ensure your Vertex AI / Gemini API calls include `labels: { user_id: "...", agent_id: "..." }` as documented in [README.md](./README.md).
