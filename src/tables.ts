import { DatabaseClient } from './db';
import { CustomColumnType, CustomRow, CustomTable, CustomTableColumn } from './types';

const RESERVED_TABLES = new Set([
  'api_keys',
  'projects',
  'memories',
  'decisions',
  'sessions',
  'custom_tables',
  'custom_rows',
]);

const VALID_TYPES = new Set<CustomColumnType>(['text', 'number', 'boolean', 'date', 'json']);
const IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,62}$/;

const initialized = new WeakMap<DatabaseClient, Promise<void>>();

/**
 * Ensures the custom_tables and custom_rows tables exist in Postgres without requiring manual migrations.
 */
export async function ensureCustomTablesSchema(db: DatabaseClient): Promise<void> {
  let pending = initialized.get(db);
  if (!pending) {
    pending = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS custom_tables (
          name TEXT PRIMARY KEY,
          project_id TEXT,
          description TEXT,
          columns JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS custom_rows (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          table_name TEXT NOT NULL REFERENCES custom_tables(name) ON DELETE CASCADE,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_custom_tables_project_id ON custom_tables(project_id)`);
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_custom_rows_table_created ON custom_rows(table_name, created_at DESC)`
      );
      await db.query(`CREATE INDEX IF NOT EXISTS idx_custom_rows_data_gin ON custom_rows USING gin(data)`);
    })().catch((err) => {
      initialized.delete(db);
      throw err;
    });
    initialized.set(db, pending);
  }
  await pending;
}

export function normalizeIdentifier(raw: string, label = 'identifier'): string {
  const normalized = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!IDENTIFIER_RE.test(normalized)) {
    throw new Error(
      `Invalid ${label} "${raw}": must start with a letter and contain only lowercase letters, numbers, and underscores (max 63 chars).`
    );
  }
  return normalized;
}

export function normalizeTableName(raw: string): string {
  const name = normalizeIdentifier(raw, 'table name');
  if (RESERVED_TABLES.has(name)) {
    throw new Error(`Table name "${name}" is reserved by SaintStack core storage.`);
  }
  return name;
}

export function normalizeColumns(rawColumns: unknown): CustomTableColumn[] {
  if (!rawColumns) return [];
  if (!Array.isArray(rawColumns)) {
    throw new Error('columns must be an array of { name, type, required?, description? } objects.');
  }
  const seen = new Set<string>();
  const cols: CustomTableColumn[] = [];
  for (const col of rawColumns) {
    if (!col || typeof col !== 'object') {
      throw new Error('Each column definition must be an object.');
    }
    const name = normalizeIdentifier(String((col as any).name || ''), 'column name');
    if (seen.has(name)) {
      throw new Error(`Duplicate column name "${name}".`);
    }
    seen.add(name);
    const rawType = String((col as any).type || 'text').toLowerCase() as CustomColumnType;
    if (!VALID_TYPES.has(rawType)) {
      throw new Error(
        `Invalid type "${rawType}" for column "${name}". Allowed types: text, number, boolean, date, json.`
      );
    }
    cols.push({
      name,
      type: rawType,
      ...((col as any).required === true ? { required: true } : {}),
      ...(typeof (col as any).description === 'string' && (col as any).description.trim()
        ? { description: (col as any).description.trim() }
        : {}),
    });
  }
  return cols;
}

function inferColumnType(value: unknown): CustomColumnType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'text';
}

function validateValue(col: CustomTableColumn, value: unknown): any {
  if (value === undefined || value === null) {
    if (col.required) {
      throw new Error(`Missing required field "${col.name}".`);
    }
    return value ?? null;
  }
  switch (col.type) {
    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`Field "${col.name}" must be text (string).`);
      }
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Field "${col.name}" must be a finite number.`);
      }
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`Field "${col.name}" must be a boolean.`);
      }
      return value;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new Error(`Field "${col.name}" must be a valid ISO/date string.`);
      }
      return value;
    case 'json':
      return value;
  }
}

function validateRowData(
  rawData: Record<string, any>,
  columns: CustomTableColumn[],
  partial = false
): Record<string, any> {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new Error('Row data must be a JSON object.');
  }
  const byName = new Map(columns.map((c) => [c.name, c]));
  const result: Record<string, any> = {};

  if (!partial) {
    for (const col of columns) {
      if (col.required && (rawData[col.name] === undefined || rawData[col.name] === null)) {
        throw new Error(`Missing required field "${col.name}".`);
      }
    }
  }

  for (const [key, val] of Object.entries(rawData)) {
    const col = byName.get(key);
    if (col) {
      result[key] = validateValue(col, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function parseTableRecord(row: any): CustomTable {
  const columns = typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns || [];
  return {
    name: row.name,
    project_id: row.project_id ?? null,
    description: row.description ?? null,
    columns,
    ...(row.row_count !== undefined ? { row_count: Number(row.row_count) } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseRowRecord(row: any): CustomRow {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {};
  return {
    id: row.id,
    table_name: row.table_name,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createOrUpdateTable(
  db: DatabaseClient,
  input: {
    name: string;
    project_id?: string | null;
    description?: string | null;
    columns?: CustomTableColumn[];
  }
): Promise<{ table: CustomTable; created: boolean }> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(input.name);
  const newCols = normalizeColumns(input.columns);
  const projectId = input.project_id ? input.project_id.trim() : null;
  const description = input.description !== undefined ? input.description : null;

  const existingRow = await db.queryRow<any>(
    `SELECT name, project_id, description, columns, created_at, updated_at FROM custom_tables WHERE name = $1`,
    [tableName]
  );

  if (existingRow) {
    const existing = parseTableRecord(existingRow);
    const mergedMap = new Map(existing.columns.map((c) => [c.name, c]));
    for (const c of newCols) {
      mergedMap.set(c.name, c);
    }
    const mergedCols = Array.from(mergedMap.values());
    const updatedRow = await db.queryRow<any>(
      `UPDATE custom_tables
       SET project_id = COALESCE($2, project_id),
           description = COALESCE($3, description),
           columns = $4::jsonb,
           updated_at = NOW()
       WHERE name = $1
       RETURNING name, project_id, description, columns, created_at, updated_at`,
      [tableName, projectId, description, JSON.stringify(mergedCols)]
    );
    return { table: parseTableRecord(updatedRow || { ...existing, columns: mergedCols }), created: false };
  }

  const inserted = await db.queryRow<any>(
    `INSERT INTO custom_tables (name, project_id, description, columns)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING name, project_id, description, columns, created_at, updated_at`,
    [tableName, projectId, description, JSON.stringify(newCols)]
  );
  return { table: parseTableRecord(inserted), created: true };
}

export async function getTable(db: DatabaseClient, rawName: string): Promise<CustomTable | null> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(rawName);
  const row = await db.queryRow<any>(
    `SELECT t.name, t.project_id, t.description, t.columns, t.created_at, t.updated_at,
            COUNT(r.id)::int AS row_count
     FROM custom_tables t
     LEFT JOIN custom_rows r ON r.table_name = t.name
     WHERE t.name = $1
     GROUP BY t.name`,
    [tableName]
  );
  return row ? parseTableRecord(row) : null;
}

export async function listTables(db: DatabaseClient, projectId?: string): Promise<CustomTable[]> {
  await ensureCustomTablesSchema(db);
  const rows = projectId
    ? await db.query<any>(
        `SELECT t.name, t.project_id, t.description, t.columns, t.created_at, t.updated_at,
                COUNT(r.id)::int AS row_count
         FROM custom_tables t
         LEFT JOIN custom_rows r ON r.table_name = t.name
         WHERE t.project_id = $1
         GROUP BY t.name
         ORDER BY t.updated_at DESC`,
        [projectId.trim()]
      )
    : await db.query<any>(
        `SELECT t.name, t.project_id, t.description, t.columns, t.created_at, t.updated_at,
                COUNT(r.id)::int AS row_count
         FROM custom_tables t
         LEFT JOIN custom_rows r ON r.table_name = t.name
         GROUP BY t.name
         ORDER BY t.updated_at DESC`
      );
  return rows.map(parseTableRecord);
}

export async function insertRows(
  db: DatabaseClient,
  rawTableName: string,
  items: Record<string, any>[],
  options: { autoCreate?: boolean; projectId?: string } = {}
): Promise<{ table: CustomTable; rows: CustomRow[] }> {
  await ensureCustomTablesSchema(db);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Provide a non-empty row object or rows array to insert.');
  }

  const tableName = normalizeTableName(rawTableName);
  let table = await getTable(db, tableName);

  if (!table) {
    if (options.autoCreate === false) {
      throw new Error(`Table "${tableName}" does not exist. Create it first with saintstack_create_table.`);
    }
    const inferredCols: CustomTableColumn[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      for (const [key, val] of Object.entries(item)) {
        if (seen.has(key) || !IDENTIFIER_RE.test(key)) continue;
        seen.add(key);
        inferredCols.push({ name: key, type: inferColumnType(val) });
      }
    }
    const created = await createOrUpdateTable(db, {
      name: tableName,
      project_id: options.projectId || null,
      columns: inferredCols,
    });
    table = created.table;
  }

  const inserted: CustomRow[] = [];
  for (const item of items) {
    const cleanData = validateRowData(item, table.columns, false);
    const row = await db.queryRow<any>(
      `INSERT INTO custom_rows (table_name, data)
       VALUES ($1, $2::jsonb)
       RETURNING id, table_name, data, created_at, updated_at`,
      [tableName, JSON.stringify(cleanData)]
    );
    inserted.push(parseRowRecord(row));
  }

  await db.query(`UPDATE custom_tables SET updated_at = NOW() WHERE name = $1`, [tableName]);
  return { table, rows: inserted };
}

export async function queryRows(
  db: DatabaseClient,
  rawTableName: string,
  options: { filter?: Record<string, any>; search?: string; limit?: number; offset?: number } = {}
): Promise<{ table: CustomTable; rows: CustomRow[] }> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(rawTableName);
  const table = await getTable(db, tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" does not exist.`);
  }

  const conditions: string[] = ['table_name = $1'];
  const params: any[] = [tableName];
  let idx = 2;

  if (options.filter && typeof options.filter === 'object' && Object.keys(options.filter).length > 0) {
    conditions.push(`data @> $${idx++}::jsonb`);
    params.push(JSON.stringify(options.filter));
  }
  if (options.search && options.search.trim()) {
    conditions.push(`data::text ILIKE $${idx++}`);
    params.push(`%${options.search.trim()}%`);
  }

  const limit = Math.min(200, Math.max(1, options.limit ?? 25));
  const offset = Math.max(0, options.offset ?? 0);
  params.push(limit, offset);

  const rows = await db.query<any>(
    `SELECT id, table_name, data, created_at, updated_at
     FROM custom_rows
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  return { table, rows: rows.map(parseRowRecord) };
}

export async function updateRow(
  db: DatabaseClient,
  rawTableName: string,
  rowId: string,
  patch: Record<string, any>
): Promise<CustomRow> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(rawTableName);
  const table = await getTable(db, tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" does not exist.`);
  }

  const cleanPatch = validateRowData(patch, table.columns, true);
  const existing = await db.queryRow<any>(
    `SELECT id, table_name, data, created_at, updated_at FROM custom_rows WHERE id = $1 AND table_name = $2`,
    [rowId, tableName]
  );
  if (!existing) {
    throw new Error(`Row "${rowId}" not found in table "${tableName}".`);
  }

  const current = parseRowRecord(existing);
  const mergedData = { ...current.data, ...cleanPatch };
  const updated = await db.queryRow<any>(
    `UPDATE custom_rows
     SET data = $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND table_name = $3
     RETURNING id, table_name, data, created_at, updated_at`,
    [JSON.stringify(mergedData), rowId, tableName]
  );
  await db.query(`UPDATE custom_tables SET updated_at = NOW() WHERE name = $1`, [tableName]);
  return parseRowRecord(updated);
}

export async function deleteRow(db: DatabaseClient, rawTableName: string, rowId: string): Promise<boolean> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(rawTableName);
  const row = await db.queryRow<any>(
    `DELETE FROM custom_rows WHERE id = $1 AND table_name = $2 RETURNING id`,
    [rowId, tableName]
  );
  return !!row;
}

export async function deleteTable(db: DatabaseClient, rawTableName: string): Promise<boolean> {
  await ensureCustomTablesSchema(db);
  const tableName = normalizeTableName(rawTableName);
  const row = await db.queryRow<any>(`DELETE FROM custom_tables WHERE name = $1 RETURNING name`, [tableName]);
  return !!row;
}
