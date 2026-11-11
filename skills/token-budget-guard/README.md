# Token Budget & Context Guard for Coding Agents

> **Stop burning your daily API limits. Eliminate 40%+ of wasted tokens on every agent turn.**

Compatible with: **Claude Code**, **Cursor**, **OpenAI Codex**, **Copilot**, and **Google Antigravity**.

---

## The Problem

Have you ever hit your $20/day or $200/month limit in Cursor or Claude Code within 2 hours? 

It's almost never because your code is too complex. It's because your agent repeatedly reads:
1. Massive `package-lock.json` or `pnpm-lock.yaml` files (5,000+ useless tokens).
2. Minified bundles in `dist/` or `build/`.
3. Giant 800-line full files when it only needs to edit a 5-line function.

## What This Skill Does

This skill installs a strict **context-discipline harness** inside your AI agent:

- **Banished Files Rule**: Prevents agents from ever ingesting package lockfiles, binaries, coverage reports, or minified assets.
- **Surgical Diff Compaction**: Compresses multi-file code reviews into concise 15-line unified patches rather than file dumps.
- **Progressive Disclosure**: Forces agents to inspect function signatures first before reading 500-line source files.
- **Bundled Prune Utility**: Includes a lightweight Node script (`node scripts/prune-context.js`) to estimate token savings on uncommitted diffs.

---

## Setup (30 Seconds)

1. Drop `SKILL.md` into your agent's skill directory (e.g. `~/.claude/skills/token-budget-guard` or Cursor project rules).
2. Your agent immediately follows strict context-pruning rules on every turn.

**Result:** Longer, uninterrupted coding sessions with zero wasted tokens.
