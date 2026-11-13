"""
Vertex AI / Gemini SDK Telemetry Wrapper (Python)

Wraps `google-genai` (`client.models.generate_content` and
`client.models.generate_content_stream`) to extract `usage_metadata`
and emit structured JSON logs to Google Cloud Logging with custom
`project_id`, `user_id`, `agent_id`, and `session_id` attribution.

Prerequisites:
    pip install google-genai google-cloud-logging
"""

from __future__ import annotations

import logging
import time
from typing import Any, Iterator, Optional

try:
    import google.cloud.logging as cloud_logging
    _cloud_client = cloud_logging.Client()
    _cloud_client.setup_logging()
except Exception:
    # Fallback to standard JSON-friendly stdout logging (e.g. Cloud Run / GKE)
    logging.basicConfig(level=logging.INFO)

_logger = logging.getLogger("token_monitor.telemetry")


def _emit_telemetry_log(
    *,
    project_id: str,
    user_id: str,
    agent_id: str,
    session_id: Optional[str],
    model: str,
    duration_ms: float,
    usage_metadata: Any,
    stream: bool,
) -> None:
    if usage_metadata is None:
        return

    prompt_tokens = getattr(usage_metadata, "prompt_token_count", 0) or 0
    candidates_tokens = getattr(usage_metadata, "candidates_token_count", 0) or 0
    cached_tokens = getattr(usage_metadata, "cached_content_token_count", 0) or 0
    total_tokens = getattr(usage_metadata, "total_token_count", 0) or (
        prompt_tokens + candidates_tokens
    )

    payload = {
        "event": "llm_token_usage",
        "project_id": project_id,
        "user_id": user_id or "unassigned",
        "agent_id": agent_id or "unassigned",
        "session_id": session_id or "",
        "model_version": model,
        "prompt_token_count": int(prompt_tokens),
        "candidates_token_count": int(candidates_tokens),
        "cached_content_token_count": int(cached_tokens),
        "total_token_count": int(total_tokens),
        "duration_ms": round(duration_ms, 2),
        "stream": stream,
    }

    # Google Cloud Logging routes `extra={"json_fields": payload}` into `jsonPayload`
    _logger.info(
        "LLM token usage recorded",
        extra={"json_fields": payload},
    )


def generate_content_with_telemetry(
    client: Any,
    *,
    model: str,
    contents: Any,
    project_id: str,
    user_id: str = "unassigned",
    agent_id: str = "unassigned",
    session_id: Optional[str] = None,
    config: Any = None,
) -> Any:
    """Calls `client.models.generate_content` and logs token usage."""
    start = time.perf_counter()
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=config,
    )
    duration_ms = (time.perf_counter() - start) * 1000.0

    _emit_telemetry_log(
        project_id=project_id,
        user_id=user_id,
        agent_id=agent_id,
        session_id=session_id,
        model=getattr(response, "model_version", None) or model,
        duration_ms=duration_ms,
        usage_metadata=getattr(response, "usage_metadata", None),
        stream=False,
    )
    return response


def generate_content_stream_with_telemetry(
    client: Any,
    *,
    model: str,
    contents: Any,
    project_id: str,
    user_id: str = "unassigned",
    agent_id: str = "unassigned",
    session_id: Optional[str] = None,
    config: Any = None,
) -> Iterator[Any]:
    """Calls `client.models.generate_content_stream` and logs final token usage."""
    start = time.perf_counter()
    last_usage = None
    resolved_model = model

    stream = client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=config,
    )
    for chunk in stream:
        if getattr(chunk, "usage_metadata", None) is not None:
            last_usage = chunk.usage_metadata
        if getattr(chunk, "model_version", None):
            resolved_model = chunk.model_version
        yield chunk

    duration_ms = (time.perf_counter() - start) * 1000.0
    _emit_telemetry_log(
        project_id=project_id,
        user_id=user_id,
        agent_id=agent_id,
        session_id=session_id,
        model=resolved_model,
        duration_ms=duration_ms,
        usage_metadata=last_usage,
        stream=True,
    )
