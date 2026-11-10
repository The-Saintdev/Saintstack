import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, McpRequest } from './types';
import { getDb } from './db';
import { validateApiKey, extractApiKey } from './auth';
import { handleMcpRequest, SAINTSTACK_TOOLS } from './mcp';
import { saveMemory, searchMemories, getContextBundle, deleteMemory, getMemoryById } from './memory';
import { upsertProject, listProjects, getProject, deleteProject } from './projects';
import { saveDecision, getDecisions } from './decisions';
import { saveSession, getLastSession, listSessions } from './sessions';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for cross-origin tools and web UIs
app.use('*', cors());

// Root / Health check
app.get('/', (c) => {
  return c.json({
    name: 'SaintStack',
    version: '0.1.0',
    description: 'Universal persistent memory and code intelligence infrastructure for coding agents',
    status: 'online',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      api: '/api/v1',
    },
    tools_count: SAINTSTACK_TOOLS.length,
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication middleware for /mcp and /api
app.use('*', async (c, next) => {
  const path = c.req.path;
  // Skip auth for root and health check
  if (path === '/' || path === '/health') {
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
  const bundle = await getContextBundle(db, projectId, query);
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
