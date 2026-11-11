<p align="center">
  <img src="assets/logo.png" alt="SaintStack Logo" width="160" style="border-radius: 24px; box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);">
</p>

# SaintStack

> **Universal persistent memory and code intelligence infrastructure for coding agents (Claude Code, OpenAI Codex, Google Antigravity).**

[![CI/CD](https://github.com/The-Saintdev/Saintstack/actions/workflows/deploy.yml/badge.svg)](https://github.com/The-Saintdev/Saintstack/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is SaintStack?

When you work with AI coding assistants across multiple devices (phone, laptop) and different tools (Claude Code, Antigravity, Codex), three major issues arise:

1. **Repeated Instructions**: Agents repeatedly re-read your architecture rules, conventions, and style preferences.
2. **Repeated Codebase Exploration**: Agents burn thousands of tokens rediscovering how components connect every single turn.
3. **Lost Session Context**: When a session closes or context is compacted, agents forget what was just completed, what broke, and what should be done next.

**SaintStack** decouples memory and project intelligence from your local laptop and AI providers, running a lightweight serverless MCP and REST gateway backed by Neon PostgreSQL.

---

## Key Features

- **Cross-Agent Continuity**: Works seamlessly across Claude Code, OpenAI Codex, and Google Antigravity.
- **Mobile & Cloud Ready**: Since it lives on Cloudflare Workers and Neon, you can trigger coding agents from your phone without keeping a local server running.
- **$0 Free-Tier Friendly**: Operates entirely within Neon's 1 GB free Postgres storage and Cloudflare Workers' 100,000 requests/day allowance.
- **Dual Protocol Support**: Native Model Context Protocol (MCP) Streamable HTTP endpoint (`/mcp`) plus fallback REST API (`/api/v1`).
- **Structured Micro-Records**: Stores architecture decisions (ADRs), global conventions, code maps, and session handovers in lightweight records (~1-2 KB each).
- **Full-Text Search**: Built-in PostgreSQL full-text search (`tsvector`) for fast memory retrieval without expensive vector embeddings.

---

## MCP Tools Provided

| Tool | Purpose |
|---|---|
| `saintstack_search_memory` | Query global rules and project-specific knowledge by keywords/tags |
| `saintstack_save_memory` | Store durable conventions, patterns, and architectural rules |
| `saintstack_get_context` | Retrieve a compact bundle of project architecture, decisions, and last session |
| `saintstack_save_decision` | Record an Architectural Decision Record (ADR) with rationale and alternatives |
| `saintstack_get_decisions` | Inspect previous architectural decisions for a project |
| `saintstack_save_session` | Save progress, touched files, completed tasks, and next steps at session close |
| `saintstack_get_session` | Fetch the last session handover to resume work instantly |
| `saintstack_register_project` | Register or update repository metadata |
| `saintstack_list_projects` | List all projects tracked in SaintStack |

---

## 5-Minute Quickstart

### 1. Prerequisites
- Node.js 20+
- Free [Neon](https://neon.tech) account (Serverless Postgres)
- Free [Cloudflare](https://cloudflare.com) account (Workers)

### 2. Clone & Install
```bash
git clone https://github.com/The-Saintdev/Saintstack.git
cd Saintstack
npm install
```

### 3. Configure Database
1. Create a free project in [Neon](https://neon.tech).
2. Copy your PostgreSQL connection string.
3. Create `.dev.vars` from the example:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
4. Set your `DATABASE_URL` and choose a secure `SAINTSTACK_API_KEY`.
5. Run the database migration:
   ```bash
   npm run db:migrate
   ```

### 4. Local Development
```bash
npm run dev
```
Visit `http://localhost:8787/health` or `http://localhost:8787/mcp` to verify.

### 5. Deploy to Cloudflare Workers
```bash
# Login to Cloudflare
npx wrangler login

# Set secrets on Cloudflare Workers
npx wrangler secret put DATABASE_URL
npx wrangler secret put SAINTSTACK_API_KEY

# Deploy
npm run deploy
```

---

## Connecting Your Agents

Once deployed, your endpoint will be: `https://saintstack.<your-subdomain>.workers.dev/mcp`

### Claude Code
```bash
claude mcp add --transport http --scope user saintstack https://saintstack.<your-subdomain>.workers.dev/mcp \
  --header "Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>"
```

### Google Antigravity
Add to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "saintstack": {
      "serverUrl": "https://saintstack.<your-subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_SAINTSTACK_API_KEY>"
      }
    }
  }
}
```

### OpenAI Codex
```bash
codex mcp add saintstack --url https://saintstack.<your-subdomain>.workers.dev/mcp
```

---

## Development & Testing

```bash
# Run type check
npm run typecheck

# Run test suite
npm test
```

---

## License

[MIT](LICENSE)
