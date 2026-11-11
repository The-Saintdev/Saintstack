# Production Readiness & Security Gate for AI-Generated Code

> **Zero-flaw deployment auditor. Never ship vulnerable or broken AI code to production.**

Compatible with: **Claude Code**, **Cursor**, **OpenAI Codex**, **Copilot**, and **Google Antigravity**.

---

## The Problem

AI coding assistants write fast code, but they frequently make dangerous rookie mistakes:
- Forgetting to parameterize SQL queries (SQL injection).
- Missing ownership checks on API routes (allowing User A to delete User B's records via IDOR).
- Committing `.env` files or hardcoded API keys.
- Leaving unhandled promise rejections that crash production servers.

## What This Skill Does

This skill forces your AI agent to run a strict **7-Gate Verification Protocol** before recommending any pull request or deployment:

1. **Gate 1**: Leaked Secrets & Token Scanner.
2. **Gate 2**: SQL Injection & ORM Query Parameterization Audit.
3. **Gate 3**: Authorization & IDOR/BOLA Protection on every route.
4. **Gate 4**: Rate-Limiting & CORS Sanitization.
5. **Gate 5**: Graceful Error Boundaries (no raw database errors exposed).
6. **Gate 6**: Health Check Endpoint Verification.
7. **Gate 7**: Build & Typecheck Zero-Error Guarantee.

Includes a ready-to-run automated auditor (`node scripts/audit-gate.js`) to scan your codebase in 3 seconds.

---

## Setup (30 Seconds)

1. Drop `SKILL.md` into your agent's skill directory.
2. Ask your agent: `"Run the production deployment gate on our changes."`
3. Receive a structured pass/fail readiness audit report with exact fixes for any flagged gate.
