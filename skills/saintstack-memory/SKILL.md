---
name: saintstack-memory
description: Persistent cross-session memory and context tracking for AI coding agents. Eliminates repeated codebase scanning, tracks architectural decisions (ADRs), and preserves session handovers via the SaintStack MCP gateway.
version: 1.0.0
author: The-Saintdev
tags:
  - memory
  - context
  - mcp
  - token-reduction
  - claude-code
  - cursor
  - codex
  - antigravity
---

# SaintStack Persistent Memory & Context Skill

SaintStack provides persistent, multi-device, cross-project memory for AI coding agents.
When connected via MCP, this skill governs how you retrieve past context, record architectural decisions, and hand over sessions so that no tokens or progress are lost.

---

## Core Rules & Execution Contract

### 1. Check Context Before Scanning Code (Zero-Waste Exploration)
- **Do not** immediately dump file trees, run broad greps, or re-read unchanged files.
- **At the start of every session or task**, identify the active project (`owner/repo` or directory name) and invoke:
  ```json
  saintstack_get_context({
    "project_id": "<project_id>",
    "format": "markdown"
  })
  ```
- Use the returned context bundle (architecture, invariants, key decisions, last session summary) to formulate your plan.
- If looking for a specific rule, pattern, or convention, query:
  ```json
  saintstack_search_memory({
    "project_id": "<project_id>",
    "query": "<topic_or_keyword>",
    "limit": 5
  })
  ```

### 2. Preserve Architectural Decisions (ADR)
Whenever an important technical choice, dependency addition, or refactoring direction is agreed upon:
- Do not let it vanish into chat history.
- Record it immediately via:
  ```json
  saintstack_save_decision({
    "project_id": "<project_id>",
    "title": "<Concise Decision Title>",
    "context": "<Why this decision was needed>",
    "decision": "<What was decided>",
    "rationale": "<Why this option was chosen over alternatives>",
    "alternatives": "<Options considered and rejected>",
    "status": "accepted"
  })
  ```

### 3. Log Session Handover at Milestone Completion
Before finishing a major task, reaching the user's prompt goal, or ending your turn:
- Capture the current progress state for the next agent session (or mobile user) via:
  ```json
  saintstack_save_session({
    "project_id": "<project_id>",
    "agent": "<your-agent-identifier>",
    "summary": "<2-3 sentence overview of what was achieved>",
    "completed_tasks": ["<task 1>", "<task 2>"],
    "next_tasks": ["<immediate next action>"],
    "touched_files": ["<path/to/modified_file>"],
    "open_issues": ["<any known bug or pending decision>"]
  })
  ```

### 4. Ingest Code Graphs (Graphify Integration)
If a code graph summary or `GRAPH_REPORT.md` (e.g., from Graphify) is generated or updated:
- Ingest it into persistent project memory:
  ```json
  saintstack_ingest_graph({
    "project_id": "<project_id>",
    "content": "<High-level module map and dependency relations>"
  })
  ```

---

## Token Conservation Protocol
- Always prefer `format: "markdown"` when calling `saintstack_get_context`.
- Limit query results to what is relevant (`limit: 5`).
- Never write API secrets, `.env` values, or private credentials into memory records.
