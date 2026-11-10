import { DatabaseClient } from './db';
import { Session } from './types';

export async function saveSession(
  db: DatabaseClient,
  session: {
    project_id: string;
    agent: string;
    summary: string;
    completed_tasks?: string[];
    next_tasks?: string[];
    touched_files?: string[];
    open_issues?: string[];
  }
): Promise<Session> {
  const completed = JSON.stringify(session.completed_tasks || []);
  const next = JSON.stringify(session.next_tasks || []);
  const touched = JSON.stringify(session.touched_files || []);
  const issues = JSON.stringify(session.open_issues || []);

  const row = await db.queryRow<Session>(
    `INSERT INTO sessions (project_id, agent, summary, completed_tasks, next_tasks, touched_files, open_issues, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     RETURNING id, project_id, agent, summary, completed_tasks, next_tasks, touched_files, open_issues, created_at`,
    [session.project_id, session.agent, session.summary, completed, next, touched, issues]
  );

  return row!;
}

export async function getLastSession(db: DatabaseClient, projectId: string): Promise<Session | null> {
  const row = await db.queryRow<Session>(
    `SELECT id, project_id, agent, summary, completed_tasks, next_tasks, touched_files, open_issues, created_at
     FROM sessions
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );

  return row;
}

export async function listSessions(
  db: DatabaseClient,
  projectId: string,
  limit: number = 10
): Promise<Session[]> {
  const rows = await db.query<Session>(
    `SELECT id, project_id, agent, summary, completed_tasks, next_tasks, touched_files, open_issues, created_at
     FROM sessions
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, limit]
  );

  return rows;
}
