import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('SaintStack REST & Hono Router', () => {
  it('serves root status with metadata', async () => {
    const res = await app.request('http://localhost/', {
      method: 'GET',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.name).toBe('SaintStack');
    expect(body.status).toBe('online');
    expect(body.endpoints.mcp).toBe('/mcp');
  });

  it('serves HTML dashboard when requested with text/html Accept header', async () => {
    const res = await app.request('http://localhost/', {
      method: 'GET',
      headers: {
        Accept: 'text/html',
      },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('SaintStack Gateway');
    expect(html).toContain('Online');
  });

  it('serves health check', async () => {
    const res = await app.request('http://localhost/health', {
      method: 'GET',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('rejects unauthenticated requests to protected endpoints when API key configured', async () => {
    const res = await app.request(
      'http://localhost/api/v1/projects',
      { method: 'GET' },
      {
        DATABASE_URL: 'postgres://dummy',
        SAINTSTACK_API_KEY: 'test-secret-key-123',
      }
    );
    expect(res.status).toBe(401);
  });

  it('authorizes requests with correct Bearer token', async () => {
    const res = await app.request(
      'http://localhost/mcp',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-secret-key-123',
        },
      },
      {
        DATABASE_URL: 'postgres://dummy',
        SAINTSTACK_API_KEY: 'test-secret-key-123',
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toContain('SaintStack MCP Server Ready');
  });
});
