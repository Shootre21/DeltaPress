# Agent Operations & API Diagnostics

This document explains the **Journalists** workflow and API diagnostics added to support troubleshooting provider outages.

## API Health Checks in Journalists Modal

In `Admin -> Journalists -> Calibrate Intelligence`, a new **API Health Checks** panel is available.

### Supported provider checks
- Moonshot Kimi (`MOONSHOT`)
- Zhipu AI (`ZAI`)
- Google Gemini (`GEMINI`)
- AI/ML API (`AIMLAPI`)

### What the check does
- Sends a lightweight POST request to the research proxy endpoint:
  - `https://www.sh00tre.xyz/api/proxy-research`
- Includes:
  - `provider`
  - `query`
  - `test: true`
  - `mode: healthcheck`
- Records per-provider status:
  - `online` (HTTP 2xx)
  - `offline` (HTTP non-2xx or network failure)
  - `testing`
  - `idle`

### Buttons
- **Test API**: run diagnostics for one provider.
- **Test All APIs**: run diagnostics sequentially for all providers.

## End-to-End Validation Path

1. Log in as admin.
2. Go to `#/admin/journalists`.
3. Open **New Agent** (or edit an existing one).
4. In **API Health Checks**, click **Test All APIs**.
5. Verify each provider status + response message.

## Common Failure Patterns

- `401 Unauthorized`:
  - Usually invalid provider key/token at proxy or upstream provider.
- `500 Configuration missing`:
  - Proxy provider mapping/key missing in deployment env.
- `429 RESOURCE_EXHAUSTED`:
  - Upstream provider quota/rate-limit exceeded.
- `ERR_HTTP2_PROTOCOL_ERROR` / `TypeError: Failed to fetch`:
  - Transport/network issue, temporary provider instability, or blocked endpoint.

## Recommendation

Use API Health Checks before running manual deploy to confirm provider readiness and avoid long failing runs.
