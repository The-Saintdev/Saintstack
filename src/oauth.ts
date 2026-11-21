import { Env } from './types';
import { DatabaseClient } from './db';
import { validateRawApiKey } from './auth';

// --- WebCrypto Helpers (HMAC-SHA256, Base64URL, PKCE S256) ---

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeJsonB64(obj: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function decodeJsonB64<T>(b64: string): T | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(b64));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signPayload(payload: object, secret: string, prefix: string): Promise<string> {
  const dataB64 = encodeJsonB64(payload);
  const key = await getHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataB64));
  const sigB64 = toBase64Url(new Uint8Array(sigBuffer));
  return `${prefix}${dataB64}.${sigB64}`;
}

export async function verifySignedPayload<T>(
  token: string,
  secret: string,
  prefix: string
): Promise<T | null> {
  if (!token.startsWith(prefix)) return null;
  const body = token.slice(prefix.length);
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx <= 0) return null;

  const dataB64 = body.slice(0, dotIdx);
  const sigB64 = body.slice(dotIdx + 1);

  try {
    const key = await getHmacKey(secret);
    const sigBytes = fromBase64Url(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(dataB64)
    );
    if (!valid) return null;
    return decodeJsonB64<T>(dataB64);
  } catch {
    return null;
  }
}

export async function computeS256Challenge(codeVerifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return toBase64Url(new Uint8Array(hash));
}

export function getSigningSecret(env: Env): string {
  return env.SAINTSTACK_API_KEY || (env.ENVIRONMENT === 'development' ? 'saintstack-dev-secret' : '');
}

// --- OAuth Payload Types ---

interface RegisteredClientPayload {
  name: string;
  redirect_uris: string[];
  iat: number;
}

interface AuthCodePayload {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  jti: string;
  exp: number;
}

export interface OAuthAccessTokenPayload {
  sub: string;
  client_id: string;
  scope: string;
  type: 'access';
  exp: number;
}

interface OAuthRefreshTokenPayload {
  sub: string;
  client_id: string;
  scope: string;
  type: 'refresh';
  exp: number;
}

const usedAuthCodes = new Set<string>();

// --- Redirect URI Matching (Supports RFC 8252 Loopback + Claude Callback + DCR/CIMD) ---

export function matchRedirectUri(requested: string, registered: string): boolean {
  if (requested === registered) return true;

  try {
    const reqUrl = new URL(requested);
    const regUrl = new URL(registered);

    // Port-agnostic loopback match per RFC 8252 Section 7.3 & Claude Code docs
    const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (
      reqUrl.protocol === 'http:' &&
      regUrl.protocol === 'http:' &&
      isLoopback(reqUrl.hostname) &&
      reqUrl.hostname === regUrl.hostname &&
      reqUrl.pathname === regUrl.pathname
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function validateClientAndRedirectUri(
  clientId: string,
  redirectUri: string,
  secret: string
): Promise<{ valid: boolean; clientName: string; reason?: string }> {
  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    return { valid: false, clientName: clientId, reason: 'Invalid redirect_uri format' };
  }

  // 1. DCR-issued signed client_id
  if (clientId.startsWith('ss_client_')) {
    const payload = await verifySignedPayload<RegisteredClientPayload>(clientId, secret, 'ss_client_');
    if (!payload) {
      return { valid: false, clientName: 'Unknown Client', reason: 'Invalid or tampered client_id' };
    }
    const allowed = payload.redirect_uris.some((uri) => matchRedirectUri(redirectUri, uri));
    if (!allowed) {
      return { valid: false, clientName: payload.name, reason: 'redirect_uri does not match registered URIs' };
    }
    return { valid: true, clientName: payload.name };
  }

  // 2. Client ID Metadata Document (CIMD) URL
  if (clientId.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(clientId, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const meta = (await res.json()) as { client_name?: string; redirect_uris?: string[] };
        if (Array.isArray(meta.redirect_uris)) {
          const allowed = meta.redirect_uris.some((uri) => matchRedirectUri(redirectUri, uri));
          if (!allowed) {
            return {
              valid: false,
              clientName: meta.client_name || new URL(clientId).hostname,
              reason: 'redirect_uri not listed in Client ID Metadata Document',
            };
          }
          return { valid: true, clientName: meta.client_name || new URL(clientId).hostname };
        }
      }
    } catch {
      // Fall through to safe well-known callback / loopback check if remote CIMD fetch times out
    }
  }

  // 3. Well-known official callbacks (Claude hosted callback & RFC 8252 local loopback)
  const isClaudeCallback = redirectUri === 'https://claude.ai/api/mcp/auth_callback';
  const isLoopback =
    parsedRedirect.protocol === 'http:' &&
    (parsedRedirect.hostname === 'localhost' ||
      parsedRedirect.hostname === '127.0.0.1' ||
      parsedRedirect.hostname === '[::1]');

  if (isClaudeCallback || isLoopback) {
    return { valid: true, clientName: clientId };
  }

  // 4. For any HTTPS client callback (e.g. Kilo Code / browser extensions), require HTTPS
  if (parsedRedirect.protocol === 'https:') {
    return { valid: true, clientName: clientId };
  }

  return { valid: false, clientName: clientId, reason: 'Unsupported redirect_uri scheme' };
}

// --- OAuth Endpoint Handlers ---

export function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https';
  const host = request.headers.get('host') || url.host;
  return `${proto}://${host}`;
}

export function buildProtectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['saintstack:read', 'saintstack:write'],
  };
}

export function buildAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['saintstack:read', 'saintstack:write', 'offline_access'],
    client_id_metadata_document_supported: true,
  };
}

export async function handleDynamicClientRegistration(
  body: any,
  secret: string
): Promise<{ status: number; json: any }> {
  if (!secret) {
    return {
      status: 500,
      json: { error: 'server_error', error_description: 'SAINTSTACK_API_KEY must be configured on the server.' },
    };
  }

  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u: any) => typeof u === 'string') : [];
  if (redirectUris.length === 0) {
    return {
      status: 400,
      json: { error: 'invalid_redirect_uri', error_description: 'redirect_uris array is required.' },
    };
  }

  const clientName = typeof body?.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : 'MCP Client';
  const payload: RegisteredClientPayload = {
    name: clientName,
    redirect_uris: redirectUris,
    iat: Math.floor(Date.now() / 1000),
  };

  const clientId = await signPayload(payload, secret, 'ss_client_');

  return {
    status: 201,
    json: {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAuthorizeHtml(params: {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  error?: string;
}): string {
  let redirectHost = params.redirectUri;
  let isLoopback = false;
  try {
    const u = new URL(params.redirectUri);
    redirectHost = u.host;
    isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    // keep raw string
  }

  const loopbackWarning = isLoopback
    ? `<div class="warn">Local loopback redirect detected (<code>${escapeHtml(redirectHost)}</code>). Ensure you initiated this login from your own local CLI or extension.</div>`
    : '';

  const errorBanner = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize SaintStack Access</title>
  <style>
    :root { --bg: #090d16; --card: #111827; --border: #1f2937; --text: #f3f4f6; --muted: #9ca3af; --accent: #3b82f6; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 28px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .sub { color: var(--muted); font-size: 14px; margin-bottom: 20px; }
    .meta { background: #040711; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 13px; margin-bottom: 18px; }
    .meta div { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .meta div:last-child { margin-bottom: 0; }
    .meta span { color: var(--muted); }
    .meta strong { color: #93c5fd; word-break: break-all; text-align: right; }
    .warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #fcd34d; border-radius: 8px; padding: 10px 12px; font-size: 12px; margin-bottom: 16px; }
    .error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
    input[type="password"] { width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid var(--border); background: #040711; color: var(--text); font-size: 14px; margin-bottom: 16px; }
    button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize SaintStack</h1>
    <p class="sub">Grant this AI client access to your SaintStack memory gateway.</p>
    ${errorBanner}
    <div class="meta">
      <div><span>Application</span><strong>${escapeHtml(params.clientName)}</strong></div>
      <div><span>Redirect Host</span><strong>${escapeHtml(redirectHost)}</strong></div>
      <div><span>Scope</span><strong>${escapeHtml(params.scope || 'saintstack:read saintstack:write')}</strong></div>
    </div>
    ${loopbackWarning}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <label for="api_key">SaintStack API Key</label>
      <input id="api_key" name="api_key" type="password" placeholder="saint_sec_..." required autofocus />
      <button type="submit">Approve &amp; Connect</button>
    </form>
  </div>
</body>
</html>`;
}

export async function handleAuthorizeSubmit(
  form: Record<string, string>,
  env: Env,
  db?: DatabaseClient
): Promise<{ status: number; redirectUrl?: string; html?: string }> {
  const clientId = form.client_id || '';
  const redirectUri = form.redirect_uri || '';
  const state = form.state || '';
  const codeChallenge = form.code_challenge || '';
  const codeChallengeMethod = form.code_challenge_method || 'S256';
  const scope = form.scope || 'saintstack:read saintstack:write';
  const apiKey = (form.api_key || '').trim();

  const secret = getSigningSecret(env);
  const check = await validateClientAndRedirectUri(clientId, redirectUri, secret);
  if (!check.valid) {
    return {
      status: 400,
      html: renderAuthorizeHtml({
        clientName: check.clientName,
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        error: check.reason || 'Invalid OAuth client or redirect URI.',
      }),
    };
  }

  if (codeChallengeMethod !== 'S256' || !codeChallenge) {
    return {
      status: 400,
      html: renderAuthorizeHtml({
        clientName: check.clientName,
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        error: 'PKCE S256 code_challenge is required.',
      }),
    };
  }

  const keyValid = await validateRawApiKey(apiKey, env, db);
  if (!keyValid) {
    return {
      status: 401,
      html: renderAuthorizeHtml({
        clientName: check.clientName,
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        error: 'Invalid SaintStack API key. Check your SAINTSTACK_API_KEY and try again.',
      }),
    };
  }

  const codePayload: AuthCodePayload = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  };

  const code = await signPayload(codePayload, secret, 'ss_code_');
  const dest = new URL(redirectUri);
  dest.searchParams.set('code', code);
  if (state) dest.searchParams.set('state', state);

  return { status: 302, redirectUrl: dest.toString() };
}

export async function handleTokenExchange(
  params: Record<string, string>,
  env: Env
): Promise<{ status: number; json: any }> {
  const secret = getSigningSecret(env);
  if (!secret) {
    return { status: 500, json: { error: 'server_error', error_description: 'Server signing secret missing.' } };
  }

  const grantType = params.grant_type;
  const now = Math.floor(Date.now() / 1000);

  if (grantType === 'authorization_code') {
    const code = params.code || '';
    const redirectUri = params.redirect_uri || '';
    const codeVerifier = params.code_verifier || '';
    const clientId = params.client_id || '';

    const payload = await verifySignedPayload<AuthCodePayload>(code, secret, 'ss_code_');
    if (!payload || payload.exp < now) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'Authorization code is invalid or expired.' } };
    }

    if (usedAuthCodes.has(payload.jti)) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'Authorization code has already been used.' } };
    }

    if (clientId && payload.client_id !== clientId) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'client_id mismatch.' } };
    }

    if (redirectUri && payload.redirect_uri !== redirectUri) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'redirect_uri mismatch.' } };
    }

    if (!codeVerifier) {
      return { status: 400, json: { error: 'invalid_request', error_description: 'PKCE code_verifier is required.' } };
    }

    const computedChallenge = await computeS256Challenge(codeVerifier);
    if (computedChallenge !== payload.code_challenge) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid PKCE code_verifier.' } };
    }

    usedAuthCodes.add(payload.jti);
    if (usedAuthCodes.size > 1000) usedAuthCodes.clear();

    const accessPayload: OAuthAccessTokenPayload = {
      sub: 'saintstack-owner',
      client_id: payload.client_id,
      scope: payload.scope,
      type: 'access',
      exp: now + 3600, // 1 hour
    };
    const refreshPayload: OAuthRefreshTokenPayload = {
      sub: 'saintstack-owner',
      client_id: payload.client_id,
      scope: payload.scope,
      type: 'refresh',
      exp: now + 60 * 60 * 24 * 30, // 30 days
    };

    const accessToken = await signPayload(accessPayload, secret, 'ss_at_');
    const refreshToken = await signPayload(refreshPayload, secret, 'ss_rt_');

    return {
      status: 200,
      json: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshToken,
        scope: payload.scope,
      },
    };
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.refresh_token || '';
    const clientId = params.client_id || '';

    const payload = await verifySignedPayload<OAuthRefreshTokenPayload>(refreshToken, secret, 'ss_rt_');
    if (!payload || payload.type !== 'refresh' || payload.exp < now) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' } };
    }

    if (clientId && payload.client_id !== clientId) {
      return { status: 400, json: { error: 'invalid_grant', error_description: 'client_id mismatch.' } };
    }

    const accessPayload: OAuthAccessTokenPayload = {
      sub: payload.sub,
      client_id: payload.client_id,
      scope: payload.scope,
      type: 'access',
      exp: now + 3600,
    };
    const nextRefreshPayload: OAuthRefreshTokenPayload = {
      sub: payload.sub,
      client_id: payload.client_id,
      scope: payload.scope,
      type: 'refresh',
      exp: now + 60 * 60 * 24 * 30,
    };

    const newAccessToken = await signPayload(accessPayload, secret, 'ss_at_');
    const newRefreshToken = await signPayload(nextRefreshPayload, secret, 'ss_rt_');

    return {
      status: 200,
      json: {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
        scope: payload.scope,
      },
    };
  }

  return {
    status: 400,
    json: { error: 'unsupported_grant_type', error_description: 'Supported grants: authorization_code, refresh_token.' },
  };
}

export async function verifyOAuthAccessToken(token: string, env: Env): Promise<boolean> {
  if (!token.startsWith('ss_at_')) return false;
  const secret = getSigningSecret(env);
  if (!secret) return false;

  const payload = await verifySignedPayload<OAuthAccessTokenPayload>(token, secret, 'ss_at_');
  if (!payload || payload.type !== 'access') return false;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}
