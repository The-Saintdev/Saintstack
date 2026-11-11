---
name: production-deploy-gate
description: Zero-flaw deployment auditor for AI-generated code. Executes a strict 7-gate security, secret leak, SQL injection, and reliability audit before merging or deploying to production.
version: 1.0.0
author: The-Saintdev
tags:
  - security
  - code-audit
  - production-readiness
  - claude-code
  - cursor
  - vibe-coding
---

# Production Readiness & Security Gate

Deploying AI-generated code to production without deterministic checks is high-risk.
This skill mandates a strict **7-Gate Verification Protocol** before any branch is marked ready for production, pull request, or release.

---

## The 7-Gate Verification Protocol

Before declaring any feature complete or recommending deployment, execute these 7 gates:

### Gate 1: Leaked Secrets & Credentials Scanner
- Verify that **NO** raw API keys, JWT secrets, database passwords, private keys, or `.env` files are tracked in git.
- Check that all secret values are loaded through runtime environment variables (`process.env` or secret vaults).
- Check that `.gitignore` contains `.env`, `.dev.vars`, `*.pem`, and `*.key`.

### Gate 2: SQL Injection & ORM Sanitization
- Inspect every database query across the changeset.
- **Rule**: Never allow raw string concatenation in SQL (e.g. `SELECT * FROM users WHERE id = '` + id).
- Require parameterized queries (`$1`, `?`) or vetted ORM query builders (Prisma, Drizzle, SQLAlchemy).

### Gate 3: Authorization & IDOR/BOLA Protection
- Inspect all newly created API routes (`POST`, `PUT`, `DELETE`, `GET /:id`).
- Ensure every endpoint accessing user-specific data verifies ownership:
  - Does this check `req.user.id === resource.owner_id`?
  - Does the query filter by `WHERE id = $1 AND user_id = $2`?
  - Are unauthenticated routes explicitly marked public with rationale?

### Gate 4: Rate Limiting & CORS Configuration
- Verify CORS isn't blindly set to wildcard (`*`) on credentialed endpoints.
- Check that public APIs have rate limiting or IP-based throttling to prevent abuse/DDoS.

### Gate 5: Resilient Error Handling (No Silent Crashes)
- Verify asynchronous operations (`fetch`, database queries, external APIs) are wrapped in `try/catch` or have rejected promise handlers.
- Ensure error responses return clean JSON with status codes (`400`, `401`, `404`, `500`), never exposing raw stack traces or internal database errors to clients.

### Gate 6: Liveness & Health-Check Endpoints
- Verify the service has a lightweight `GET /health` or `GET /api/health` endpoint returning `{ status: "ok" }`.
- Ensure the health check does not perform heavy computation or un-cached queries.

### Gate 7: Build & Type Safety Proof
- Execute the build command (`npm run build` or `npm run typecheck` or equivalent).
- Zero TypeScript errors, zero lint warnings, and all unit tests must pass with exit code `0`.

---

## Audit Output Format

When performing an audit, output this structured table:

```markdown
### 🛡️ Production Deployment Readiness Report
- **Gate 1 (Secrets & Credentials)**: [PASS / FAIL] — <details>
- **Gate 2 (SQL Injection)**:         [PASS / FAIL] — <details>
- **Gate 3 (Auth & IDOR Guard)**:     [PASS / FAIL] — <details>
- **Gate 4 (CORS & Rate Limiting)**:  [PASS / FAIL] — <details>
- **Gate 5 (Error Handling)**:        [PASS / FAIL] — <details>
- **Gate 6 (Health Endpoint)**:       [PASS / FAIL] — <details>
- **Gate 7 (Typecheck & Build)**:     [PASS / FAIL] — <details>

**Verdict**: [APPROVED FOR DEPLOY / BLOCKED - ACTION REQUIRED]
```

---

## Automated Audit Tool
Run the bundled scanner for an instant local check:
```bash
node scripts/audit-gate.js
```
