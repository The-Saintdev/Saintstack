import { DatabaseClient } from '../src/db';
import { Project, Memory, Decision, Session } from '../src/types';

export function createMockDb(): DatabaseClient {
  const projects = new Map<string, Project>();
  const memories = new Map<string, Memory>();
  const decisions = new Map<string, Decision>();
  const sessions: Session[] = [];

  let idCounter = 1;

  const mockClient: DatabaseClient = {
    sql: (() => {}) as any,
    async query<T = any>(queryString: string, params: any[] = []): Promise<T[]> {
      const q = queryString.toLowerCase().trim();

      // Projects
      if (q.includes('select') && q.includes('from projects')) {
        return Array.from(projects.values()) as unknown as T[];
      }

      // Decisions
      if (q.includes('select') && q.includes('from decisions')) {
        const projectId = params[0];
        const res = Array.from(decisions.values()).filter(d => d.project_id === projectId);
        return res as unknown as T[];
      }

      // Sessions
      if (q.includes('select') && q.includes('from sessions')) {
        const projectId = params[0];
        const res = sessions.filter(s => s.project_id === projectId);
        return res as unknown as T[];
      }

      // Memories
      if (q.includes('select') && q.includes('from memories')) {
        let res = Array.from(memories.values());
        // Simple mock filtering
        if (params.length > 0) {
          const p = params[params.length - 2];
          if (typeof p === 'string' && !p.startsWith('%')) {
            res = res.filter(m => m.project_id === p || m.project_id === null);
          }
        }
        return res as unknown as T[];
      }

      return [] as T[];
    },

    async queryRow<T = any>(queryString: string, params: any[] = []): Promise<T | null> {
      const q = queryString.toLowerCase().trim();

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
      if (q.includes('select id from memories where') && q.includes('lower(title) = lower($3)')) {
        const projId = params[0];
        const cat = params[1];
        const title = (params[2] || '').toLowerCase();
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
        const sess = sessions.find(s => s.project_id === projectId);
        return (sess || null) as unknown as T;
      }

      return null;
    },
  };

  return mockClient;
}
