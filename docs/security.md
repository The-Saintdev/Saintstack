# Security & Privacy

SaintStack ensures strict data separation and credential isolation.

## Security Model

1. **Authentication**:
   - All `/mcp` and `/api/v1` endpoints require an API token.
   - Tokens can be supplied via `Authorization: Bearer <token>` or `x-api-key: <token>`.
   - Master keys configured in Cloudflare Workers secrets bypass database lookup; auxiliary tokens are hashed using SHA-256 before storage.

2. **Project Isolation**:
   - Project memories are namespaced by `project_id` (e.g., `The-Saintdev/Saintstack`).
   - Project-scoped queries only return records belonging to that project and designated global conventions (`project_id = NULL`).

3. **Secret Sanitization**:
   - Coding agents are instructed never to store API keys, tokens, or environment credentials.
   - All communication is encrypted via TLS/HTTPS.
