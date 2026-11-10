import { describe, it, expect } from 'vitest';
import { handleMcpRequest, SAINTSTACK_TOOLS } from '../src/mcp';
import { createMockDb } from './mockDb';

describe('SaintStack MCP Server', () => {
  const db = createMockDb();

  it('handles initialize handshake', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      },
      db
    );

    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result.serverInfo.name).toBe('saintstack');
    expect(res.result.capabilities.tools).toBeDefined();
  });

  it('lists all available SaintStack tools', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      db
    );

    expect(res.result.tools).toHaveLength(SAINTSTACK_TOOLS.length);
    const toolNames = res.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('saintstack_search_memory');
    expect(toolNames).toContain('saintstack_save_memory');
    expect(toolNames).toContain('saintstack_get_context');
    expect(toolNames).toContain('saintstack_save_decision');
    expect(toolNames).toContain('saintstack_get_decisions');
    expect(toolNames).toContain('saintstack_save_session');
    expect(toolNames).toContain('saintstack_get_session');
    expect(toolNames).toContain('saintstack_register_project');
    expect(toolNames).toContain('saintstack_list_projects');
  });

  it('registers a project via tools/call', async () => {
    const res = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'saintstack_register_project',
          arguments: {
            id: 'The-Saintdev/Saintstack',
            name: 'SaintStack',
            description: 'AI Memory Infrastructure',
            repo_url: 'https://github.com/The-Saintdev/Saintstack',
          },
        },
      },
      db
    );

    expect(res.error).toBeUndefined();
    const data = JSON.parse(res.result.content[0].text);
    expect(data.project.id).toBe('The-Saintdev/Saintstack');
  });

  it('saves and searches global and project memories', async () => {
    // 1. Save global convention
    const saveRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'saintstack_save_memory',
          arguments: {
            title: 'Always use parameterized SQL queries',
            content: 'Never concatenate SQL strings directly to prevent SQL injection.',
            category: 'convention',
            importance: 9,
            source: 'antigravity',
          },
        },
      },
      db
    );
    expect(saveRes.error).toBeUndefined();

    // 2. Save project memory
    await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'saintstack_save_memory',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
            title: 'Cloudflare Worker MCP Architecture',
            content: 'Exposes Streamable JSON-RPC 2.0 at /mcp with Neon serverless Postgres backend.',
            category: 'architecture',
            importance: 8,
          },
        },
      },
      db
    );

    // 3. Search memories
    const searchRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'saintstack_search_memory',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
          },
        },
      },
      db
    );
    expect(searchRes.error).toBeUndefined();
    const parsed = JSON.parse(searchRes.result.content[0].text);
    expect(parsed.count).toBeGreaterThan(0);
  });

  it('records an ADR decision and retrieves it', async () => {
    const saveDec = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'saintstack_save_decision',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
            title: 'Use Neon PostgreSQL over SQLite',
            context: 'Coding agents run across multiple cloud instances and devices (phone, desktop).',
            decision: 'Adopt Neon serverless PostgreSQL for centralised storage.',
            rationale: 'PostgreSQL provides client-server concurrency and remote accessibility with zero infra overhead.',
          },
        },
      },
      db
    );
    expect(saveDec.error).toBeUndefined();

    const getDec = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'saintstack_get_decisions',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
          },
        },
      },
      db
    );
    const parsed = JSON.parse(getDec.result.content[0].text);
    expect(parsed.count).toBeGreaterThan(0);
    expect(parsed.decisions[0].title).toBe('Use Neon PostgreSQL over SQLite');
  });

  it('records a session handover and retrieves it', async () => {
    const saveSess = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'saintstack_save_session',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
            agent: 'claude-code',
            summary: 'Completed memory and MCP tools implementation.',
            completed_tasks: ['Setup Neon schema', 'Implement MCP tools'],
            next_tasks: ['Deploy to Cloudflare Workers'],
            touched_files: ['src/mcp.ts', 'src/memory.ts'],
          },
        },
      },
      db
    );
    expect(saveSess.error).toBeUndefined();

    const getSess = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'saintstack_get_session',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
          },
        },
      },
      db
    );
    const parsed = JSON.parse(getSess.result.content[0].text);
    expect(parsed.agent).toBe('claude-code');
    expect(parsed.completed_tasks).toContain('Setup Neon schema');
  });

  it('returns compact context bundle', async () => {
    const contextRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'saintstack_get_context',
          arguments: {
            project_id: 'The-Saintdev/Saintstack',
          },
        },
      },
      db
    );
    expect(contextRes.error).toBeUndefined();
    const bundle = JSON.parse(contextRes.result.content[0].text);
    expect(bundle.project).toBeDefined();
    expect(bundle.last_session).toBeDefined();
  });
});
