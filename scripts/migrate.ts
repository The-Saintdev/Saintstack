import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env or .dev.vars if present
dotenv.config();
if (fs.existsSync('.dev.vars')) {
  const devVars = dotenv.parse(fs.readFileSync('.dev.vars'));
  for (const k in devVars) {
    if (!process.env[k]) {
      process.env[k] = devVars[k];
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not set in environment or .dev.vars');
  process.exit(1);
}

function splitSqlStatements(sqlContent: string): string[] {
  const cleanLines = sqlContent
    .split('\n')
    .map(line => (line.trim().startsWith('--') ? '' : line))
    .join('\n');

  return cleanLines
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);
}

async function runMigrations() {
  console.log('Connecting to Neon PostgreSQL...');
  const sql = neon(databaseUrl!);

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    const statements = splitSqlStatements(sqlContent);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await sql.query(stmt);
      } catch (err: any) {
        console.error(`Error in statement ${i + 1} of ${file}:`, err.message);
        console.error(`Failed SQL:`, stmt);
        process.exit(1);
      }
    }

    console.log(`Successfully applied: ${file} (${statements.length} statements)`);
  }

  console.log('All migrations applied successfully to Neon!');
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
