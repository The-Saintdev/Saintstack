# SaintStack: Persistent Memory for Coding Agents

> **Stop paying your AI agent to rediscover your codebase every single session.**

Compatible with: **Claude Code**, **Cursor**, **Codex**, **Copilot**, and **Google Antigravity**.

---

## The Problem This Skill Solves

Every time you open a coding agent or switch devices, it suffers from **context amnesia**:
1. It burns thousands of tokens scanning directory trees you never changed.
2. It forgets architectural decisions you agreed upon yesterday.
3. It loses session handovers as soon as the conversation compacts or you pick up work on your phone.

## How It Works

This skill installs the execution protocol for **SaintStack**, a lightweight, serverless AI memory gateway.

When active, your coding assistant automatically:
- **Retrieves Context First**: Pulls active architectural rules, conventions, and recent progress *before* scanning files.
- **Records Architectural Decision Records (ADRs)**: Permanently logs why decisions were made so future agents don't re-debate them.
- **Logs Session Handovers**: Summarizes completed tasks, touched files, and immediate next steps at the end of each milestone.
- **Reduces Tokens by ~35%**: Receives high-density Markdown context bundles instead of bloated JSON responses.

---

## Quick Setup (1 Minute)

1. Connect your SaintStack MCP server to your agent:
   ```bash
   # Claude Code
   claude mcp add --transport http --scope user saintstack https://<your-saintstack-host>/mcp \
     --header "Authorization: Bearer <YOUR_API_KEY>"
   ```
2. In Cursor or Codex, add the MCP URL and Authorization header under Settings.
3. Load this skill into your agent.

Don't have a SaintStack backend yet? Deploy your own free self-hosted gateway in 5 minutes:  
👉 [GitHub: The-Saintdev/Saintstack](https://github.com/The-Saintdev/Saintstack)
