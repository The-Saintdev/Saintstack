# SaintStack Architecture

SaintStack is designed to decouple AI memory and project intelligence from individual local environments, making it universally accessible to cloud-hosted coding agents (Claude Code, OpenAI Codex, and Google Antigravity).

## Architecture Overview

```
[ Coding Agent Clients ]
  - Claude Code (Desktop & Mobile)
  - OpenAI Codex
  - Google Antigravity
        │
        │ Streamable HTTP (JSON-RPC 2.0) / REST
        ▼
[ Cloudflare Workers Edge Gateway ]
  - Hono API router
  - Authentication middleware
  - MCP handler (/mcp)
  - REST endpoints (/api/v1)
        │
        │ Low-latency HTTP/Fetch queries
        ▼
[ Neon Serverless PostgreSQL ]
  - `projects`: Registered codebases and repositories
  - `memories`: Global & project-scoped knowledge with FTS indexing
  - `decisions`: Architectural Decision Records (ADRs)
  - `sessions`: Session handovers and progress states
  - `api_keys`: Hashed credential management
```

## Storage Strategy & Token Economy

1. **Lightweight Records**: Memories and decisions average 1-2 KB each. 1 GB on Neon's free tier supports hundreds of thousands of memory records.
2. **Full-Text Search (FTS)**: Native PostgreSQL `tsvector` and `plainto_tsquery` provide fast semantic ranking without heavy external vector infrastructure.
3. **Progressive Disclosure**: Agents retrieve compact bundles containing only the active project's latest architecture notes and recent handovers, preventing context-window exhaustion.
