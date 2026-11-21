import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { computeS256Challenge } from '../src/oauth';

const TEST_ENV = {
  DATABASE_URL: 'postgres://dummy',
  SAINTSTACK_API_KEY: 'saint_sec_test_oauth_master_key',
};

describe('SaintStack OAuth 2.1 + DCR + PKCE Flow', () => {
  it('serves RFC 8414 authorization server metadata with CIMD & DCR flags', async () => {
    const res = await app.request(
      'https://saintstack.crescoafrica.com/.well-known/oauth-authorization-server',
      { method: 'GET' },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const meta = (await res.json()) as any;
    expect(meta.issuer).toBe('https://saintstack.crescoafrica.com');
    expect(meta.authorization_endpoint).toBe('https://saintstack.crescoafrica.com/oauth/authorize');
    expect(meta.token_endpoint).toBe('https://saintstack.crescoafrica.com/oauth/token');
    expect(meta.registration_endpoint).toBe('https://saintstack.crescoafrica.com/oauth/register');
    expect(meta.code_challenge_methods_supported).toContain('S256');
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.token_endpoint_auth_methods_supported).toContain('none');
  });

  it('completes full DCR -> Authorize -> Token Exchange -> Refresh -> MCP Call flow', async () => {
    // 1. Dynamic Client Registration (RFC 7591)
    const regRes = await app.request(
      'https://saintstack.crescoafrica.com/oauth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Claude Connector',
          redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback'],
        }),
      },
      TEST_ENV
    );
    expect(regRes.status).toBe(201);
    const client = (await regRes.json()) as any;
    expect(client.client_id).toMatch(/^ss_client_/);

    // 2. Render consent screen (also tests port-agnostic loopback match for Claude Code)
    const verifier = 'saintstack-pkce-verifier-string-with-enough-entropy-12345';
    const challenge = await computeS256Challenge(verifier);

    const authGet = await app.request(
      `https://saintstack.crescoafrica.com/oauth/authorize?client_id=${encodeURIComponent(
        client.client_id
      )}&redirect_uri=${encodeURIComponent(
        'http://localhost:43210/callback'
      )}&state=xyz789&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`,
      { method: 'GET' },
      TEST_ENV
    );
    expect(authGet.status).toBe(200);
    const html = await authGet.text();
    expect(html).toContain('Claude Connector');
    expect(html).toContain('localhost:43210');

    // 3. Reject wrong API key on consent submit
    const badSubmit = await app.request(
      'https://saintstack.crescoafrica.com/oauth/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          state: 'state123',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          api_key: 'wrong-key',
        }).toString(),
      },
      TEST_ENV
    );
    expect(badSubmit.status).toBe(401);

    // 4. Approve with valid API key -> 302 redirect with ?code=...
    const goodSubmit = await app.request(
      'https://saintstack.crescoafrica.com/oauth/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          state: 'state123',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          api_key: TEST_ENV.SAINTSTACK_API_KEY,
        }).toString(),
      },
      TEST_ENV
    );
    expect(goodSubmit.status).toBe(302);
    const location = goodSubmit.headers.get('Location')!;
    expect(location).toContain('https://claude.ai/api/mcp/auth_callback');
    const callbackUrl = new URL(location);
    const code = callbackUrl.searchParams.get('code')!;
    expect(code).toMatch(/^ss_code_/);
    expect(callbackUrl.searchParams.get('state')).toBe('state123');

    // 5. Reject wrong PKCE verifier
    const badToken = await app.request(
      'https://saintstack.crescoafrica.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          client_id: client.client_id,
          code_verifier: 'wrong-verifier',
        }).toString(),
      },
      TEST_ENV
    );
    expect(badToken.status).toBe(400);

    // 6. Exchange code with valid PKCE verifier (form-urlencoded per RFC 6749)
    const tokenRes = await app.request(
      'https://saintstack.crescoafrica.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          client_id: client.client_id,
          code_verifier: verifier,
        }).toString(),
      },
      TEST_ENV
    );
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as any;
    expect(tokens.access_token).toMatch(/^ss_at_/);
    expect(tokens.refresh_token).toMatch(/^ss_rt_/);
    expect(tokens.token_type).toBe('Bearer');

    // 7. Call /mcp using OAuth Bearer access token
    const mcpRes = await app.request(
      'https://saintstack.crescoafrica.com/mcp',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      },
      TEST_ENV
    );
    expect(mcpRes.status).toBe(200);
    const mcpJson = (await mcpRes.json()) as any;
    expect(mcpJson.result.tools.length).toBeGreaterThanOrEqual(10);

    // 8. Refresh token rotation
    const refreshRes = await app.request(
      'https://saintstack.crescoafrica.com/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: client.client_id,
        }).toString(),
      },
      TEST_ENV
    );
    expect(refreshRes.status).toBe(200);
    const rotated = (await refreshRes.json()) as any;
    expect(rotated.access_token).toMatch(/^ss_at_/);
    expect(rotated.refresh_token).toMatch(/^ss_rt_/);
  });
});
