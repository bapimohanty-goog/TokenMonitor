/**
 * Vertex AI / Gemini SDK Telemetry Wrapper (Node.js / TypeScript)
 *
 * Wraps `@google/genai` (`ai.models.generateContent` and
 * `ai.models.generateContentStream`) to extract `usageMetadata`
 * and emit structured JSON logs to Google Cloud Logging with custom
 * `project_id`, `user_id`, `agent_id`, and `session_id` attribution.
 *
 * Prerequisites:
 *   npm install @google/genai @google-cloud/logging
 */

import { Logging } from '@google-cloud/logging';

export interface TelemetryContext {
  projectId: string;
  userId?: string;
  agentId?: string;
  sessionId?: string;
}

export interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

const logging = new Logging();
const telemetryLog = logging.log('token-monitor-telemetry');

async function emitTelemetryLog(params: {
  ctx: TelemetryContext;
  model: string;
  durationMs: number;
  usageMetadata?: UsageMetadataLike;
  stream: boolean;
}): Promise<void> {
  const { ctx, model, durationMs, usageMetadata, stream } = params;
  if (!usageMetadata) return;

  const promptTokens = usageMetadata.promptTokenCount ?? 0;
  const candidatesTokens = usageMetadata.candidatesTokenCount ?? 0;
  const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
  const totalTokens =
    usageMetadata.totalTokenCount ?? promptTokens + candidatesTokens;

  const jsonPayload = {
    event: 'llm_token_usage',
    project_id: ctx.projectId,
    user_id: ctx.userId || 'unassigned',
    agent_id: ctx.agentId || 'unassigned',
    session_id: ctx.sessionId || '',
    model_version: model,
    prompt_token_count: promptTokens,
    candidates_token_count: candidatesTokens,
    cached_content_token_count: cachedTokens,
    total_token_count: totalTokens,
    duration_ms: Number(durationMs.toFixed(2)),
    stream,
  };

  try {
    const entry = telemetryLog.entry(
      { severity: 'INFO', resource: { type: 'global' } },
      jsonPayload
    );
    await telemetryLog.write(entry);
  } catch {
    // Fallback to structured stdout (automatically ingested on Cloud Run / GKE)
    console.log(JSON.stringify({ severity: 'INFO', ...jsonPayload }));
  }
}

export async function generateContentWithTelemetry<TResponse extends {
  usageMetadata?: UsageMetadataLike;
  modelVersion?: string;
}>(
  ai: { models: { generateContent: (args: Record<string, unknown>) => Promise<TResponse> } },
  request: { model: string; contents: unknown; config?: Record<string, unknown> },
  ctx: TelemetryContext
): Promise<TResponse> {
  const start = performance.now();
  const response = await ai.models.generateContent(request);
  const durationMs = performance.now() - start;

  await emitTelemetryLog({
    ctx,
    model: response.modelVersion || request.model,
    durationMs,
    usageMetadata: response.usageMetadata,
    stream: false,
  });

  return response;
}

export async function* generateContentStreamWithTelemetry<TChunk extends {
  usageMetadata?: UsageMetadataLike;
  modelVersion?: string;
}>(
  ai: {
    models: {
      generateContentStream: (args: Record<string, unknown>) => Promise<AsyncIterable<TChunk>>;
    };
  },
  request: { model: string; contents: unknown; config?: Record<string, unknown> },
  ctx: TelemetryContext
): AsyncGenerator<TChunk> {
  const start = performance.now();
  let lastUsage: UsageMetadataLike | undefined;
  let resolvedModel = request.model;

  const stream = await ai.models.generateContentStream(request);
  for await (const chunk of stream) {
    if (chunk.usageMetadata) {
      lastUsage = chunk.usageMetadata;
    }
    if (chunk.modelVersion) {
      resolvedModel = chunk.modelVersion;
    }
    yield chunk;
  }

  const durationMs = performance.now() - start;
  await emitTelemetryLog({
    ctx,
    model: resolvedModel,
    durationMs,
    usageMetadata: lastUsage,
    stream: true,
  });
}
