import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, McpRequest } from './types';
import { getDb } from './db';
import { validateApiKey, extractApiKey } from './auth';
import { handleMcpRequest, SAINTSTACK_TOOLS } from './mcp';
import { saveMemory, searchMemories, getContextBundle, deleteMemory, getMemoryById, formatContextAsMarkdown } from './memory';
import { upsertProject, listProjects, getProject, deleteProject } from './projects';
import { saveDecision, getDecisions } from './decisions';
import { saveSession, getLastSession, listSessions } from './sessions';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for cross-origin tools and web UIs
app.use('*', cors());

// Helper to render the web dashboard HTML
function renderDashboardHtml(host: string): string {
  const mcpUrl = `https://${host}/mcp`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SaintStack — AI Memory Gateway</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #3b82f6;
      --green: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 24px 16px;
    }
    .container { max-width: 860px; margin: 0 auto; }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--green);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 500;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
    h1 { font-size: 26px; font-weight: 700; }
    p.lead { color: var(--muted); font-size: 15px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 28px; }
    @media (min-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 { font-size: 17px; margin-bottom: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .code-box {
      background: #040711;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: #93c5fd;
      overflow-x: auto;
      margin-top: 8px;
    }
    ul.tools { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    ul.tools li {
      font-size: 13px;
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding-bottom: 6px;
    }
    ul.tools code { font-weight: 600; color: #60a5fa; font-size: 13px; }
    ul.tools span { color: var(--muted); font-size: 12px; }
    footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>SaintStack Gateway</h1>
        <p class="lead">Universal Persistent AI Development Memory</p>
      </div>
      <div class="badge"><div class="dot"></div> Online</div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>⚡ Gateway Endpoint</h2>
        <p style="font-size: 14px; color: var(--muted);">Streamable HTTP MCP endpoint for Claude Code, Codex, and Antigravity:</p>
        <div class="code-box">${mcpUrl}</div>
      </div>

      <div class="card">
        <h2>📱 Mobile & Cloud Integration</h2>
        <p style="font-size: 14px; color: var(--muted);">In Claude Settings &rarr; Connectors or Antigravity config, add this MCP server URL with your Bearer API key.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <h2>🛠 Available MCP Tools (${SAINTSTACK_TOOLS.length})</h2>
      <ul class="tools">
        ${SAINTSTACK_TOOLS.map(t => `<li><code>${t.name}</code><span>${t.description}</span></li>`).join('')}
      </ul>
    </div>

    <footer>
      SaintStack v0.1.0 &bull; Running on Cloudflare Workers &bull; Neon Serverless Postgres
    </footer>
  </div>
</body>
</html>`;
}

// Root / Health check & Web Dashboard
app.get('/', (c) => {
  const accept = c.req.header('Accept') || '';
  if (accept.includes('text/html')) {
    const host = c.req.header('Host') || 'saintstack.crescoafrica.com';
    return c.html(renderDashboardHtml(host));
  }

  return c.json({
    name: 'SaintStack',
    version: '0.1.0',
    description: 'Universal persistent memory and code intelligence infrastructure for coding agents',
    status: 'online',
    domain: c.req.header('Host') || 'saintstack.crescoafrica.com',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      dashboard: '/dashboard',
      api: '/api/v1',
    },
    tools_count: SAINTSTACK_TOOLS.length,
  });
});

app.get('/dashboard', (c) => {
  const host = c.req.header('Host') || 'saintstack.crescoafrica.com';
  return c.html(renderDashboardHtml(host));
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication middleware for /mcp and /api
app.use('*', async (c, next) => {
  const path = c.req.path;
  // Skip auth for root, dashboard, and health check
  if (path === '/' || path === '/health' || path === '/dashboard') {
    return next();
  }

  const apiKey = extractApiKey(c.req.raw);
  const db = c.env.DATABASE_URL ? getDb(c.env.DATABASE_URL) : undefined;
  const isValid = await validateApiKey(apiKey, c.env, db);

  if (!isValid) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Valid Bearer token or x-api-key header required. Configure SAINTSTACK_API_KEY.',
      },
      401
    );
  }

  return next();
});

// MCP Endpoint (Supports JSON-RPC 2.0 POST)
app.post('/mcp', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  try {
    const body = await c.req.json<McpRequest>();
    const response = await handleMcpRequest(body, db);
    return c.json(response);
  } catch (err: any) {
    return c.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`,
        },
      },
      400
    );
  }
});

// MCP Discovery GET
app.get('/mcp', (c) => {
  return c.json({
    status: 'SaintStack MCP Server Ready',
    protocol: 'JSON-RPC 2.0 / Streamable HTTP',
    tools: SAINTSTACK_TOOLS,
  });
});

// --- REST API Fallback Endpoints ---

// Context Bundle
app.get('/api/v1/context', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projectId = c.req.query('project_id');
  const query = c.req.query('query');
  const format = c.req.query('format');
  const bundle = await getContextBundle(db, projectId, query);

  if (format === 'markdown') {
    return c.text(formatContextAsMarkdown(bundle));
  }

  return c.json(bundle);
});

// Projects
app.get('/api/v1/projects', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projects = await listProjects(db);
  return c.json({ count: projects.length, projects });
});

app.get('/api/v1/projects/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const project = await getProject(db, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

app.post('/api/v1/projects', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const project = await upsertProject(db, body);
  return c.json({ message: 'Project saved', project });
});

app.delete('/api/v1/projects/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  await deleteProject(db, c.req.param('id'));
  return c.json({ message: 'Project deleted' });
});

// Memories
app.get('/api/v1/memories', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projectId = c.req.query('project_id');
  const query = c.req.query('query');
  const category = c.req.query('category') as any;
  const tag = c.req.query('tag');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 10;
  const minImportance = c.req.query('min_importance') ? parseInt(c.req.query('min_importance')!, 10) : undefined;

  const memories = await searchMemories(db, {
    projectId,
    query,
    category,
    tag,
    limit,
    minImportance,
  });

  return c.json({ count: memories.length, memories });
});

app.get('/api/v1/memories/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const memory = await getMemoryById(db, c.req.param('id'));
  if (!memory) return c.json({ error: 'Memory not found' }, 404);
  return c.json(memory);
});

app.post('/api/v1/memories', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const memory = await saveMemory(db, body);
  return c.json({ message: 'Memory saved', memory });
});

app.delete('/api/v1/memories/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  await deleteMemory(db, c.req.param('id'));
  return c.json({ message: 'Memory deleted' });
});

// Decisions
app.get('/api/v1/decisions', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projectId = c.req.query('project_id');
  if (!projectId) return c.json({ error: 'project_id query param is required' }, 400);
  const status = c.req.query('status');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 20;

  const decisions = await getDecisions(db, projectId, status, limit);
  return c.json({ count: decisions.length, decisions });
});

app.post('/api/v1/decisions', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const decision = await saveDecision(db, body);
  return c.json({ message: 'Decision recorded', decision });
});

// Sessions
app.get('/api/v1/sessions', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projectId = c.req.query('project_id');
  if (!projectId) return c.json({ error: 'project_id query param is required' }, 400);
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 10;

  const sessions = await listSessions(db, projectId, limit);
  return c.json({ count: sessions.length, sessions });
});

app.get('/api/v1/sessions/last', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const projectId = c.req.query('project_id');
  if (!projectId) return c.json({ error: 'project_id query param is required' }, 400);

  const session = await getLastSession(db, projectId);
  if (!session) return c.json({ message: 'No sessions found for this project' }, 404);
  return c.json(session);
});

app.post('/api/v1/sessions', async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const session = await saveSession(db, body);
  return c.json({ message: 'Session saved', session });
});

export default app;
