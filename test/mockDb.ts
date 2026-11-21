import { DatabaseClient } from '../src/db';
import { Project, Memory, Decision, Session, CustomTable, CustomRow } from '../src/types';

export function createMockDb(): DatabaseClient {
  const projects = new Map<string, Project>();
  const memories = new Map<string, Memory>();
  const decisions = new Map<string, Decision>();
  const sessions: Session[] = [];
  const customTables = new Map<string, CustomTable>();
  const customRows = new Map<string, CustomRow>();

  let idCounter = 1;

  const assertSqlParams = (queryString: string, params: any[]) => {
    const matches = queryString.match(/\$(\d+)/g) || [];
    const maxParam = matches.reduce((max, m) => Math.max(max, Number(m.slice(1))), 0);
    if (maxParam > params.length) {
      throw new Error(`PostgreSQL parameter error: SQL references $${maxParam}, but only ${params.length} parameters supplied.`);
    }
  };

  const mockClient: DatabaseClient = {
    sql: (() => {}) as any,
    async query<T = any>(queryString: string, params: any[] = []): Promise<T[]> {
      assertSqlParams(queryString, params);
      const q = queryString.toLowerCase().replace(/\s+/g, ' ').trim();

      if (q.startsWith('create table if not exists') || q.startsWith('create index if not exists')) {
        return [] as T[];
      }

      if (q.startsWith('update custom_tables set updated_at = now()')) {
        const t = customTables.get(params[0]);
        if (t) t.updated_at = new Date().toISOString();
        return [] as T[];
      }

      // Custom tables list
      if (q.includes('from custom_tables t') && !q.includes('where t.name = $1')) {
        let list = Array.from(customTables.values());
        if (q.includes('where t.project_id = $1')) {
          list = list.filter((t) => t.project_id === params[0]);
        }
        return list.map((t) => ({
          ...t,
          row_count: Array.from(customRows.values()).filter((r) => r.table_name === t.name).length,
        })) as unknown as T[];
      }

      // Custom rows query
      if (q.includes('from custom_rows') && q.includes('where table_name = $1')) {
        const tableName = params[0];
        let rows = Array.from(customRows.values()).filter((r) => r.table_name === tableName);
        if (q.includes('data @>')) {
          const filterParamIdx = 1;
          const filter = JSON.parse(params[filterParamIdx]);
          rows = rows.filter((r) => Object.entries(filter).every(([k, v]) => r.data[k] === v));
        }
        if (q.includes('data::text ilike')) {
          const searchIdx = q.includes('data @>') ? 2 : 1;
          const needle = String(params[searchIdx] || '')
            .replace(/^%|%$/g, '')
            .toLowerCase();
          rows = rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(needle));
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
      const q = queryString.toLowerCase().replace(/\s+/g, ' ').trim();

      // Custom tables
      if (q.includes('from custom_tables') && q.includes('where t.name = $1')) {
        const t = customTables.get(params[0]);
        if (!t) return null;
        return {
          ...t,
          row_count: Array.from(customRows.values()).filter((r) => r.table_name === t.name).length,
        } as unknown as T;
      }

      if (q.includes('from custom_tables where name = $1')) {
        return (customTables.get(params[0]) || null) as unknown as T;
      }

      if (q.includes('insert into custom_tables')) {
        const now = new Date().toISOString();
        const table: CustomTable = {
          name: params[0],
          project_id: params[1] ?? null,
          description: params[2] ?? null,
          columns: JSON.parse(params[3] || '[]'),
          created_at: now,
          updated_at: now,
        };
        customTables.set(table.name, table);
        return table as unknown as T;
      }

      if (q.includes('update custom_tables set project_id = coalesce')) {
        const table = customTables.get(params[0]);
        if (!table) return null;
        if (params[1] !== null && params[1] !== undefined) table.project_id = params[1];
        if (params[2] !== null && params[2] !== undefined) table.description = params[2];
        table.columns = JSON.parse(params[3] || '[]');
        table.updated_at = new Date().toISOString();
        return table as unknown as T;
      }

      if (q.includes('delete from custom_tables where name = $1')) {
        const table = customTables.get(params[0]);
        if (!table) return null;
        customTables.delete(params[0]);
        for (const [rowId, r] of customRows.entries()) {
          if (r.table_name === params[0]) customRows.delete(rowId);
        }
        return { name: params[0] } as unknown as T;
      }

      // Custom rows
      if (q.includes('insert into custom_rows')) {
        const id = `row-${idCounter++}`;
        const now = new Date().toISOString();
        const row: CustomRow = {
          id,
          table_name: params[0],
          data: JSON.parse(params[1] || '{}'),
          created_at: now,
          updated_at: now,
        };
        customRows.set(id, row);
        return row as unknown as T;
      }

      if (q.includes('from custom_rows where id = $1 and table_name = $2')) {
        const r = customRows.get(params[0]);
        return (r && r.table_name === params[1] ? r : null) as unknown as T;
      }

      if (q.includes('update custom_rows set data = $1::jsonb')) {
        const r = customRows.get(params[1]);
        if (!r || r.table_name !== params[2]) return null;
        r.data = JSON.parse(params[0] || '{}');
        r.updated_at = new Date().toISOString();
        return r as unknown as T;
      }

      if (q.includes('delete from custom_rows where id = $1 and table_name = $2')) {
        const r = customRows.get(params[0]);
        if (!r || r.table_name !== params[1]) return null;
        customRows.delete(params[0]);
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
