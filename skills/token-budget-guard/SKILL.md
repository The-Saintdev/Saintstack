---
name: token-budget-guard
description: Stop burning daily API limits. Enforces pre-flight context pruning, diff compaction, and token budget rules so AI coding agents (Claude Code, Cursor, Codex) stop wasting tokens on bloated context.
version: 1.0.0
author: The-Saintdev
tags:
  - token-reduction
  - context-optimization
  - claude-code
  - cursor
  - codex
  - cost-saving
---

# Token Budget & Context Guard Skill

This skill stops AI coding agents from burning context windows and API budgets on redundant file scanning, massive dependency locks, and bloated diffs.

---

## The Golden Rules for Context Discipline

### 1. The Banished Files (Never Ingest Full Content)
When reading project files or answering questions, **NEVER** read or dump into conversation context:
- Package lock files: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `poetry.lock`.
- Minified or compiled bundles: `dist/`, `build/`, `out/`, `*.min.js`, `*.min.css`, `*.map`.
- Generated coverage and test dumps: `coverage/`, `.nyc_output/`, test snapshots.
- Asset binaries: images, videos, large SVGs, fonts, zip archives.
- If you need dependency versions, read **ONLY** `package.json` (`dependencies` block) or `pyproject.toml`.

### 2. Multi-File Diff Compaction
When summarizing changes, reviewing commits, or reporting work:
- **Do not** replay entire modified source files.
- Use **Compacted Patch format**:
  - State the file path.
  - State the 1-line reason for change.
  - Show only the specific function signature or modified block (max 15 lines).
- Never output full files unless explicitly ordered by the user with the exact keyword `"SHOW FULL FILE"`.

### 3. Progressive Disclosure (The 3-Step Reading Rule)
Before reading a 500+ line file:
1. **Step 1 (Outline)**: Inspect imports, exported functions, and type definitions first.
2. **Step 2 (Target)**: Read only the target function/method that needs modification.
3. **Step 3 (Edit)**: Perform surgical replacement rather than rewriting the whole file.

### 4. Search Query Economy
When using search tools (`grep`, `find`, `code_search`):
- Limit searches to code extensions only (`.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rs`).
- Exclude `node_modules`, `vendor`, `.git`, and build folders from every scan.
- Set search limits to 5 results max per turn.

---

## Token Budget Limits

| Operation | Max Token Target | Enforcement Action |
|---|---|---|
| Initial Task Plan | < 300 tokens | High-density bullet list |
| File Inspection | < 500 tokens | Read specific line slices only |
| Commit / PR Summary | < 250 tokens | Conventional Commit + key touched items |
| Code Diff Output | < 800 tokens | Unified diff or surgical replacements |

---

## Automated Prune Utility
When operating in terminal/CLI environments, you can run the bundled pruner to inspect git diff size before answering:
```bash
node scripts/prune-context.js
```
