import { DatabaseClient } from '../src/db';
import { Project, Memory, Decision, Session } from '../src/types';

interface MockColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface MockRealTable {
  name: string;
  description: string | null;
  columns: MockColumn[];
  rows: Record<string, any>[];
}

export function createMockDb(): DatabaseClient {
  const projects = new Map<string, Project>();
  const memories = new Map<string, Memory>();
  const decisions = new Map<string, Decision>();
  const sessions: Session[] = [];
  const realTables = new Map<string, MockRealTable>();

  let idCounter = 1;

  const assertSqlParams = (queryString: string, params: any[]) => {
    const matches = queryString.match(/\$(\d+)/g) || [];
    const maxParam = matches.reduce((max, m) => Math.max(max, Number(m.slice(1))), 0);
    if (maxParam > params.length) {
      throw new Error(`PostgreSQL parameter error: SQL references $${maxParam}, but only ${params.length} parameters supplied.`);
    }
  };

  const mapSqlTypeToInfoSchema = (sqlType: string): string => {
    const u = sqlType.toUpperCase();
    if (u.startsWith('UUID')) return 'uuid';
    if (u.startsWith('BOOLEAN')) return 'boolean';
    if (u.startsWith('BIGINT')) return 'bigint';
    if (u.startsWith('DOUBLE')) return 'double precision';
    if (u.startsWith('TIMESTAMPTZ')) return 'timestamp with time zone';
    if (u.startsWith('JSONB')) return 'jsonb';
    return 'text';
  };

  const mockClient: DatabaseClient = {
    sql: (() => {}) as any,
    async query<T = any>(queryString: string, params: any[] = []): Promise<T[]> {
      assertSqlParams(queryString, params);
      const q = queryString.toLowerCase().replace(/\s+/g, ' ').trim();

      // DDL: CREATE TABLE IF NOT EXISTS "name" (...)
      const createMatch = /^create table if not exists "([a-z0-9_]+)" \((.+)\)$/i.exec(
        queryString.replace(/\s+/g, ' ').trim()
      );
      if (createMatch) {
        const name = createMatch[1];
        if (!realTables.has(name)) {
          const defs = createMatch[2].split(',').map((s) => s.trim());
          const columns: MockColumn[] = defs.map((d) => {
            const parts = /^"([a-z0-9_]+)"\s+(.+)$/.exec(d)!;
            const colName = parts[1];
            const rest = parts[2];
            return {
              column_name: colName,
              data_type: mapSqlTypeToInfoSchema(rest),
              is_nullable: rest.includes('NOT NULL') ? 'NO' : 'YES',
            };
          });
          realTables.set(name, { name, description: null, columns, rows: [] });
        }
        return [] as T[];
      }

      // DDL: ALTER TABLE "name" ADD COLUMN IF NOT EXISTS "col" TYPE
      const alterMatch = /^ALTER TABLE "([a-z0-9_]+)" ADD COLUMN IF NOT EXISTS "([a-z0-9_]+)" (.+)$/i.exec(
        queryString.replace(/\s+/g, ' ').trim()
      );
      if (alterMatch) {
        const [, tableName, colName, sqlType] = alterMatch;
        const tbl = realTables.get(tableName);
        if (tbl && !tbl.columns.some((c) => c.column_name === colName)) {
          tbl.columns.push({
            column_name: colName,
            data_type: mapSqlTypeToInfoSchema(sqlType),
            is_nullable: 'YES',
          });
        }
        return [] as T[];
      }

      // DDL: COMMENT ON TABLE "name" IS '...'
      const commentMatch = /^COMMENT ON TABLE "([a-z0-9_]+)" IS '(.*)'$/i.exec(
        queryString.replace(/\s+/g, ' ').trim()
      );
      if (commentMatch) {
        const tbl = realTables.get(commentMatch[1]);
        if (tbl) tbl.description = commentMatch[2].replace(/''/g, "'");
        return [] as T[];
      }

      // DDL: DROP TABLE IF EXISTS "name"
      const dropMatch = /^DROP TABLE IF EXISTS "([a-z0-9_]+)"$/i.exec(queryString.replace(/\s+/g, ' ').trim());
      if (dropMatch) {
        realTables.delete(dropMatch[1]);
        return [] as T[];
      }

      // information_schema.columns
      if (q.includes('from information_schema.columns')) {
        const tbl = realTables.get(params[0]);
        return (tbl ? tbl.columns : []) as unknown as T[];
      }

      // information_schema.tables (list)
      if (q.includes('from information_schema.tables') && !q.includes('and t.table_name = $1')) {
        return Array.from(realTables.values()).map((t) => ({
          table_name: t.name,
          description: t.description,
        })) as unknown as T[];
      }

      // SELECT * FROM "table"
      const selectMatch = /^SELECT \* FROM "([a-z0-9_]+)"(?:\s+WHERE\s+(.+?))?\s+ORDER BY "created_at" DESC LIMIT \$\d+ OFFSET \$\d+$/i.exec(
        queryString.replace(/\s+/g, ' ').trim()
      );
      if (selectMatch) {
        const tbl = realTables.get(selectMatch[1]);
        if (!tbl) return [] as T[];
        let rows = [...tbl.rows];
        const wherePart = selectMatch[2];
        if (wherePart) {
          const searchMatch = /\(coalesce\(.+ilike \$(\d+)/i.exec(wherePart);
          const filterMatches = [...wherePart.matchAll(/"([a-z0-9_]+)"\s*=\s*\$(\d+)/gi)];
          const nullMatches = [...wherePart.matchAll(/"([a-z0-9_]+)" IS NULL/gi)];
          rows = rows.filter((r) => {
            for (const fm of filterMatches) {
              if (r[fm[1]] !== params[Number(fm[2]) - 1]) return false;
            }
            for (const nm of nullMatches) {
              if (r[nm[1]] !== null && r[nm[1]] !== undefined) return false;
            }
            if (searchMatch) {
              const needle = String(params[Number(searchMatch[1]) - 1] || '')
                .replace(/^%|%$/g, '')
                .toLowerCase();
              const hay = JSON.stringify(r).toLowerCase();
              if (!hay.includes(needle)) return false;
            }
            return true;
          });
        }
        const limit = Number(params[params.length - 2] ?? 25);
        const offset = Number(params[params.length - 1] ?? 0);
        return rows.slice(offset, offset + limit) as unknown as T[];
      }

      // Projects
      if (q.includes('select') && q.includes('from projects')) {
        return Array.from(projects.values()) as unknown as T[];
      }

      // Decisions
      if (q.includes('select') && q.includes('from decisions')) {
        const projectId = params[0];
        const res = Array.from(decisions.values()).filter((d) => d.project_id === projectId);
        return res as unknown as T[];
      }

      // Sessions
      if (q.includes('select') && q.includes('from sessions')) {
        const projectId = params[0];
        const res = sessions.filter((s) => s.project_id === projectId);
        return res as unknown as T[];
      }

      // Memories
      if (q.includes('select') && q.includes('from memories')) {
        let res = Array.from(memories.values());
        if (q.includes("(project_id is null or lower(project_id) = 'global')") && !q.includes('project_id = $')) {
          res = res.filter((m) => m.project_id === null || m.project_id?.toLowerCase() === 'global');
        } else if (q.includes('project_id = $') && !q.includes('or project_id is null')) {
          const p = params[1];
          res = res.filter((m) => m.project_id === p);
        } else if (params.length > 0) {
          const p = params[params.length - 2];
          if (typeof p === 'string' && !p.startsWith('%')) {
            res = res.filter((m) => m.project_id === p || m.project_id === null || m.project_id?.toLowerCase() === 'global');
          }
        }
        return res as unknown as T[];
      }

      return [] as T[];
    },

    async queryRow<T = any>(queryString: string, params: any[] = []): Promise<T | null> {
      assertSqlParams(queryString, params);
      const normalizedSql = queryString.replace(/\s+/g, ' ').trim();
      const q = normalizedSql.toLowerCase();

      // information_schema.tables (single)
      if (q.includes('from information_schema.tables') && q.includes('and t.table_name = $1')) {
        const tbl = realTables.get(params[0]);
        return (tbl ? { table_name: tbl.name, description: tbl.description } : null) as unknown as T;
      }

      // SELECT COUNT(*)::int AS count FROM "table"
      const countMatch = /^SELECT COUNT\(\*\)::int AS count FROM "([a-z0-9_]+)"$/i.exec(normalizedSql);
      if (countMatch) {
        const tbl = realTables.get(countMatch[1]);
        return { count: tbl ? tbl.rows.length : 0 } as unknown as T;
      }

      // INSERT INTO "table"
      const insertMatch = /^INSERT INTO "([a-z0-9_]+)" \(([^)]+)\) VALUES \(([^)]+)\) RETURNING \*$/i.exec(normalizedSql);
      if (insertMatch) {
        const tbl = realTables.get(insertMatch[1]);
        if (!tbl) throw new Error(`relation "${insertMatch[1]}" does not exist`);
        const cols = insertMatch[2].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        const placeholders = insertMatch[3].split(',').map((s) => s.trim());
        const now = new Date().toISOString();
        const row: Record<string, any> = { id: `row-${idCounter++}`, created_at: now, updated_at: now };
        for (const c of tbl.columns) {
          if (!(c.column_name in row)) row[c.column_name] = null;
        }
        cols.forEach((colName, i) => {
          const val = params[i];
          row[colName] = placeholders[i].includes('::jsonb') && typeof val === 'string' ? JSON.parse(val) : val;
        });
        tbl.rows.unshift(row);
        return { ...row } as unknown as T;
      }

      // UPDATE "table" SET ... WHERE "id" = $N RETURNING *
      const updateMatch = /^UPDATE "([a-z0-9_]+)" SET (.+) WHERE "id" = \$(\d+) RETURNING \*$/i.exec(normalizedSql);
      if (updateMatch) {
        const tbl = realTables.get(updateMatch[1]);
        if (!tbl) throw new Error(`relation "${updateMatch[1]}" does not exist`);
        const rowId = params[Number(updateMatch[3]) - 1];
        const row = tbl.rows.find((r) => r.id === rowId);
        if (!row) return null;
        const assigns = updateMatch[2].split(',').map((s) => s.trim());
        for (const a of assigns) {
          const m = /^"([a-z0-9_]+)" = \$(\d+)(::jsonb)?$/i.exec(a);
          if (m) {
            const val = params[Number(m[2]) - 1];
            row[m[1]] = m[3] && typeof val === 'string' ? JSON.parse(val) : val;
          }
        }
        row.updated_at = new Date().toISOString();
        return { ...row } as unknown as T;
      }

      // DELETE FROM "table" WHERE "id" = $1 RETURNING "id"
      const deleteMatch = /^DELETE FROM "([a-z0-9_]+)" WHERE "id" = \$1 RETURNING "id"$/i.exec(normalizedSql);
      if (deleteMatch) {
        const tbl = realTables.get(deleteMatch[1]);
        if (!tbl) return null;
        const idx = tbl.rows.findIndex((r) => r.id === params[0]);
        if (idx === -1) return null;
        tbl.rows.splice(idx, 1);
        return { id: params[0] } as unknown as T;
      }

      // Select single project
      if (q.includes('select') && q.includes('from projects where id = $1')) {
        const proj = projects.get(params[0]);
        return (proj || null) as unknown as T;
      }

      // Upsert project
      if (q.includes('insert into projects')) {
        const proj: Project = {
          id: params[0],
          name: params[1],
          description: params[2],
          repo_url: params[3],
          default_branch: params[4] || 'main',
          metadata: params[5] ? JSON.parse(params[5]) : {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        projects.set(proj.id, proj);
        return proj as unknown as T;
      }

      // Select single memory
      if (q.includes('select id from memories where') && q.includes('lower(title) = lower(')) {
        const isNullScope = q.includes('project_id is null');
        const projId = isNullScope ? null : params[0];
        const cat = isNullScope ? params[0] : params[1];
        const title = (isNullScope ? params[1] : params[2] || '').toLowerCase();
        for (const m of memories.values()) {
          if (
            (m.project_id === projId || (!m.project_id && !projId)) &&
            m.category === cat &&
            m.title.toLowerCase() === title
          ) {
            return m as unknown as T;
          }
        }
        return null;
      }

      if (q.includes('insert into memories')) {
        const id = `mem-${idCounter++}`;
        const mem: Memory = {
          id,
          project_id: params[0] || null,
          category: params[1],
          title: params[2],
          content: params[3],
          tags: params[4] ? JSON.parse(params[4]) : [],
          importance: params[5] || 5,
          source: params[6] || 'agent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        memories.set(id, mem);
        return mem as unknown as T;
      }

      if (q.includes('update memories set content = $1')) {
        const id = params[4];
        const mem = memories.get(id);
        if (mem) {
          mem.content = params[0];
          mem.tags = params[1] ? JSON.parse(params[1]) : [];
          mem.importance = params[2];
          mem.source = params[3];
          mem.updated_at = new Date().toISOString();
          return mem as unknown as T;
        }
      }

      // Decisions
      if (q.includes('insert into decisions')) {
        const id = `dec-${idCounter++}`;
        const dec: Decision = {
          id,
          project_id: params[0],
          title: params[1],
          status: params[2] || 'accepted',
          context: params[3],
          decision: params[4],
          rationale: params[5] || null,
          consequences: params[6] || null,
          alternatives: params[7] || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        decisions.set(id, dec);
        return dec as unknown as T;
      }

      // Sessions
      if (q.includes('insert into sessions')) {
        const id = `sess-${idCounter++}`;
        const sess: Session = {
          id,
          project_id: params[0],
          agent: params[1],
          summary: params[2],
          completed_tasks: params[3] ? JSON.parse(params[3]) : [],
          next_tasks: params[4] ? JSON.parse(params[4]) : [],
          touched_files: params[5] ? JSON.parse(params[5]) : [],
          open_issues: params[6] ? JSON.parse(params[6]) : [],
          created_at: new Date().toISOString(),
        };
        sessions.unshift(sess);
        return sess as unknown as T;
      }

      if (q.includes('select') && q.includes('from sessions') && q.includes('limit 1')) {
        const projectId = params[0];
        const sess = sessions.find((s) => s.project_id === projectId);
        return (sess || null) as unknown as T;
      }

      return null;
    },
  };

  return mockClient;
}
