import { DatabaseClient } from './db';
import { Project } from './types';

export async function getProject(db: DatabaseClient, id: string): Promise<Project | null> {
  const row = await db.queryRow<Project>(
    `SELECT id, name, description, repo_url, default_branch, metadata, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [id]
  );
  return row;
}

export async function listProjects(db: DatabaseClient): Promise<Project[]> {
  const rows = await db.query<Project>(
    `SELECT id, name, description, repo_url, default_branch, metadata, created_at, updated_at
     FROM projects
     ORDER BY updated_at DESC`
  );
  return rows;
}

export async function upsertProject(
  db: DatabaseClient,
  project: {
    id: string;
    name?: string;
    description?: string | null;
    repo_url?: string | null;
    default_branch?: string;
    metadata?: Record<string, any>;
  }
): Promise<Project> {
  const existing = await getProject(db, project.id);
  const name = project.name || existing?.name || project.id;
  const description = project.description !== undefined ? project.description : existing?.description;
  const repo_url = project.repo_url !== undefined ? project.repo_url : existing?.repo_url;
  const default_branch = project.default_branch || existing?.default_branch || 'main';
  const metadata = JSON.stringify(project.metadata || existing?.metadata || {});

  const row = await db.queryRow<Project>(
    `INSERT INTO projects (id, name, description, repo_url, default_branch, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       repo_url = EXCLUDED.repo_url,
       default_branch = EXCLUDED.default_branch,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, name, description, repo_url, default_branch, metadata, created_at, updated_at`,
    [project.id, name, description, repo_url, default_branch, metadata]
  );

  return row!;
}

export async function deleteProject(db: DatabaseClient, id: string): Promise<boolean> {
  await db.query(`DELETE FROM projects WHERE id = $1`, [id]);
  return true;
}
