import { neon, NeonQueryFunction } from '@neondatabase/serverless';

export interface DatabaseClient {
  sql: NeonQueryFunction<false, false>;
  query<T = any>(queryString: string, params?: any[]): Promise<T[]>;
  queryRow<T = any>(queryString: string, params?: any[]): Promise<T | null>;
}

export function getDb(databaseUrl: string): DatabaseClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sql = neon(databaseUrl);

  return {
    sql,
    async query<T = any>(queryString: string, params: any[] = []): Promise<T[]> {
      const results = (await sql.query(queryString, params)) as unknown as T[];
      return results;
    },
    async queryRow<T = any>(queryString: string, params: any[] = []): Promise<T | null> {
      const results = (await sql.query(queryString, params)) as unknown as T[];
      return results.length > 0 ? results[0] : null;
    },
  };
}
