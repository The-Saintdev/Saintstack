import { DatabaseClient } from './db';
import { Decision, DecisionStatus } from './types';

export async function saveDecision(
  db: DatabaseClient,
  decision: {
    id?: string;
    project_id: string;
    title: string;
    status?: DecisionStatus;
    context: string;
    decision: string;
    rationale?: string | null;
    consequences?: string | null;
    alternatives?: string | null;
  }
): Promise<Decision> {
  const status = decision.status || 'accepted';

  if (decision.id) {
    const updated = await db.queryRow<Decision>(
      `UPDATE decisions
       SET title = $1, status = $2, context = $3, decision = $4, rationale = $5, consequences = $6, alternatives = $7, updated_at = NOW()
       WHERE id = $8 AND project_id = $9
       RETURNING id, project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at`,
      [
        decision.title,
        status,
        decision.context,
        decision.decision,
        decision.rationale || null,
        decision.consequences || null,
        decision.alternatives || null,
        decision.id,
        decision.project_id,
      ]
    );
    if (updated) return updated;
  }

  const created = await db.queryRow<Decision>(
    `INSERT INTO decisions (project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     RETURNING id, project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at`,
    [
      decision.project_id,
      decision.title,
      status,
      decision.context,
      decision.decision,
      decision.rationale || null,
      decision.consequences || null,
      decision.alternatives || null,
    ]
  );

  return created!;
}

export async function getDecisions(
  db: DatabaseClient,
  projectId: string,
  status?: string,
  limit: number = 20
): Promise<Decision[]> {
  if (status) {
    return await db.query<Decision>(
      `SELECT id, project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at
       FROM decisions
       WHERE project_id = $1 AND status = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [projectId, status, limit]
    );
  }

  return await db.query<Decision>(
    `SELECT id, project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at
     FROM decisions
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, limit]
  );
}

export async function getDecisionById(db: DatabaseClient, id: string): Promise<Decision | null> {
  return await db.queryRow<Decision>(
    `SELECT id, project_id, title, status, context, decision, rationale, consequences, alternatives, created_at, updated_at
     FROM decisions
     WHERE id = $1`,
    [id]
  );
}
