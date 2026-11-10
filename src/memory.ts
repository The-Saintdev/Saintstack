import { DatabaseClient } from './db';
import { ContextBundle, Memory, MemoryCategory } from './types';
import { getProject } from './projects';
import { getDecisions } from './decisions';
import { getLastSession } from './sessions';

export async function saveMemory(
  db: DatabaseClient,
  memory: {
    id?: string;
    project_id?: string | null;
    category?: MemoryCategory;
    title: string;
    content: string;
    tags?: string[];
    importance?: number;
    source?: string;
  }
): Promise<Memory> {
  const category = memory.category || 'knowledge';
  const importance = Math.min(10, Math.max(1, memory.importance ?? 5));
  const source = memory.source || 'agent';
  const tagsJson = JSON.stringify(memory.tags || []);
  const projectId = memory.project_id ? memory.project_id.trim() : null;

  // If ID provided, update existing
  if (memory.id) {
    const updated = await db.queryRow<Memory>(
      `UPDATE memories
       SET category = $1, title = $2, content = $3, tags = $4::jsonb, importance = $5, source = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, project_id, category, title, content, tags, importance, source, created_at, updated_at`,
      [category, memory.title, memory.content, tagsJson, importance, source, memory.id]
    );
    if (updated) return updated;
  }

  // Deduplication check: if a memory with the exact same title & category exists in this project scope, update it
  let existing: Memory | null = null;
  if (projectId) {
    existing = await db.queryRow<Memory>(
      `SELECT id FROM memories WHERE project_id = $1 AND category = $2 AND LOWER(title) = LOWER($3) LIMIT 1`,
      [projectId, category, memory.title.trim()]
    );
  } else {
    existing = await db.queryRow<Memory>(
      `SELECT id FROM memories WHERE project_id IS NULL AND category = $2 AND LOWER(title) = LOWER($3) LIMIT 1`,
      [category, memory.title.trim()]
    );
  }

  if (existing && existing.id) {
    const updated = await db.queryRow<Memory>(
      `UPDATE memories
       SET content = $1, tags = $2::jsonb, importance = $3, source = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, project_id, category, title, content, tags, importance, source, created_at, updated_at`,
      [memory.content, tagsJson, importance, source, existing.id]
    );
    return updated!;
  }

  // Otherwise, insert fresh memory
  const created = await db.queryRow<Memory>(
    `INSERT INTO memories (project_id, category, title, content, tags, importance, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())
     RETURNING id, project_id, category, title, content, tags, importance, source, created_at, updated_at`,
    [projectId, category, memory.title.trim(), memory.content, tagsJson, importance, source]
  );

  return created!;
}

export interface SearchOptions {
  projectId?: string | null;
  query?: string;
  category?: MemoryCategory;
  tag?: string;
  includeGlobal?: boolean;
  minImportance?: number;
  limit?: number;
}

export async function searchMemories(
  db: DatabaseClient,
  options: SearchOptions = {}
): Promise<Memory[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const minImportance = options.minImportance ?? 1;
  const includeGlobal = options.includeGlobal !== false;

  const conditions: string[] = ['importance >= $1'];
  const params: any[] = [minImportance];

  // Project filtering
  if (options.projectId) {
    if (includeGlobal) {
      params.push(options.projectId);
      conditions.push(`(project_id = $${params.length} OR project_id IS NULL)`);
    } else {
      params.push(options.projectId);
      conditions.push(`project_id = $${params.length}`);
    }
  } else if (!includeGlobal) {
    // Only global
    conditions.push(`project_id IS NULL`);
  }

  // Category filter
  if (options.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }

  // Tag filter
  if (options.tag) {
    params.push(JSON.stringify(options.tag));
    conditions.push(`tags @> $${params.length}::jsonb`);
  }

  // Full-text / substring search
  if (options.query && options.query.trim().length > 0) {
    params.push(`%${options.query.trim()}%`);
    params.push(options.query.trim());
    conditions.push(
      `(title ILIKE $${params.length - 1} OR content ILIKE $${params.length - 1} OR to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $${params.length}))`
    );
  }

  params.push(limit);
  const sqlString = `
    SELECT id, project_id, category, title, content, tags, importance, source, created_at, updated_at
    FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY importance DESC, updated_at DESC
    LIMIT $${params.length}
  `;

  return await db.query<Memory>(sqlString, params);
}

export async function getMemoryById(db: DatabaseClient, id: string): Promise<Memory | null> {
  return await db.queryRow<Memory>(
    `SELECT id, project_id, category, title, content, tags, importance, source, created_at, updated_at
     FROM memories
     WHERE id = $1`,
    [id]
  );
}

export async function deleteMemory(db: DatabaseClient, id: string): Promise<boolean> {
  await db.query(`DELETE FROM memories WHERE id = $1`, [id]);
  return true;
}

export async function getContextBundle(
  db: DatabaseClient,
  projectId?: string | null,
  query?: string
): Promise<ContextBundle> {
  // 1. Fetch project if provided
  const project = projectId ? await getProject(db, projectId) : null;

  // 2. Fetch global high-importance conventions (importance >= 7)
  const globalConventions = await searchMemories(db, {
    projectId: null,
    includeGlobal: false,
    minImportance: 7,
    limit: 5,
  });

  // 3. Fetch project architecture memories if project provided
  let projectArchitecture: Memory[] = [];
  if (projectId) {
    projectArchitecture = await searchMemories(db, {
      projectId,
      includeGlobal: false,
      category: 'architecture',
      limit: 5,
    });
  }

  // 4. Fetch recent decisions
  const recentDecisions = projectId ? await getDecisions(db, projectId, undefined, 5) : [];

  // 5. Fetch last session handover
  const lastSession = projectId ? await getLastSession(db, projectId) : null;

  // 6. If a specific query was provided, search relevant memories
  let relevantMemories: Memory[] = [];
  if (query && query.trim().length > 0) {
    relevantMemories = await searchMemories(db, {
      projectId: projectId || undefined,
      query,
      limit: 5,
    });
  }

  return {
    project,
    global_conventions: globalConventions,
    project_architecture: projectArchitecture,
    recent_decisions: recentDecisions,
    last_session: lastSession,
    relevant_memories: relevantMemories,
  };
}
