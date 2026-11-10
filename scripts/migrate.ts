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

async function runMigrations() {
  console.log('Connecting to database...');
  const sql = neon(databaseUrl!);

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');

    try {
      await sql.query(sqlContent);
      console.log(`Successfully applied: ${file}`);
    } catch (err: any) {
      console.error(`Migration ${file} failed:`, err.message);
      process.exit(1);
    }
  }

  console.log('All migrations applied successfully!');
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
