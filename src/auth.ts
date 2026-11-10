import { DatabaseClient } from './db';
import { Env } from './types';

async function sha256(str: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateApiKey(
  apiKey: string | undefined | null,
  env: Env,
  db?: DatabaseClient
): Promise<boolean> {
  if (!apiKey) {
    return false;
  }

  // 1. Direct match with master key in environment variable
  if (env.SAINTSTACK_API_KEY && apiKey === env.SAINTSTACK_API_KEY) {
    return true;
  }

  // 2. Database verification if DB client provided
  if (db) {
    try {
      const hashed = await sha256(apiKey);
      const row = await db.queryRow<{ id: string; is_active: boolean }>(
        'SELECT id, is_active FROM api_keys WHERE key_hash = $1 AND is_active = TRUE',
        [hashed]
      );

      if (row) {
        // Update last_used_at asynchronously
        db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
        return true;
      }
    } catch {
      // In case api_keys table is not yet initialized or query fails
    }
  }

  // 3. Fallback for unconfigured dev environment only
  if (!env.SAINTSTACK_API_KEY && env.ENVIRONMENT === 'development') {
    return true;
  }

  return false;
}

export function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const customHeader = request.headers.get('x-api-key');
  if (customHeader) {
    return customHeader.trim();
  }

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('api_key') || url.searchParams.get('key');
  if (queryKey) {
    return queryKey.trim();
  }

  return null;
}
