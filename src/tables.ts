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

const PROTECTED_TABLES = new Set(['raymond', 'cresco']);

const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at']);
const VALID_TYPES = new Set<CustomColumnType>(['text', 'number', 'integer', 'boolean', 'date', 'json']);
const IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,62}$/;

export function normalizeIdentifier(raw: string, label = 'identifier'): string {
  const normalized = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!IDENTIFIER_RE.test(normalized) || normalized.startsWith('pg_') || normalized.startsWith('sql_')) {
    throw new Error(
      `Invalid ${label} "${raw}": must start with a letter, avoid pg_/sql_ prefixes, and contain only lowercase letters, numbers, and underscores (max 63 chars).`
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
    if (SYSTEM_COLUMNS.has(name)) continue;
    if (seen.has(name)) {
      throw new Error(`Duplicate column name "${name}".`);
    }
    seen.add(name);
    const rawType = String((col as any).type || 'text').toLowerCase() as CustomColumnType;
    if (!VALID_TYPES.has(rawType)) {
      throw new Error(
        `Invalid type "${rawType}" for column "${name}". Allowed types: text, number, integer, boolean, date, json.`
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

function pgTypeFor(type: CustomColumnType): string {
  switch (type) {
    case 'text':
      return 'TEXT';
    case 'number':
      return 'DOUBLE PRECISION';
    case 'integer':
      return 'BIGINT';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'TIMESTAMPTZ';
    case 'json':
      return 'JSONB';
  }
}

function fromPgDataType(pgType: string): CustomColumnType {
  const t = (pgType || '').toLowerCase();
  if (t.includes('bool')) return 'boolean';
  if (t === 'bigint' || t === 'integer' || t === 'smallint') return 'integer';
  if (t.includes('double') || t.includes('real') || t.includes('numeric') || t.includes('decimal')) return 'number';
  if (t.includes('timestamp') || t === 'date') return 'date';
  if (t.includes('json')) return 'json';
  return 'text';
}

function inferColumnType(value: unknown): CustomColumnType {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'text';
}

function sqlStringLiteral(text: string): string {
  return `'${text.replace(/\0/g, '').replace(/'/g, "''")}'`;
}

function validateAndFormatValue(col: CustomTableColumn, value: unknown): { value: any; isJson: boolean } {
  if (value === undefined || value === null) {
    if (col.required) {
      throw new Error(`Missing required field "${col.name}".`);
    }
    return { value: null, isJson: false };
  }
  switch (col.type) {
    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`Field "${col.name}" must be text (string).`);
      }
      return { value, isJson: false };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Field "${col.name}" must be a finite number.`);
      }
      return { value, isJson: false };
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`Field "${col.name}" must be an integer.`);
      }
      return { value, isJson: false };
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`Field "${col.name}" must be a boolean.`);
      }
      return { value, isJson: false };
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new Error(`Field "${col.name}" must be a valid ISO/date string.`);
      }
      return { value, isJson: false };
    case 'json':
      return { value: JSON.stringify(value), isJson: true };
  }
}

async function fetchTableColumns(db: DatabaseClient, tableName: string): Promise<CustomTableColumn[]> {
  const rows = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return rows.map((r) => ({
    name: r.column_name,
    type: fromPgDataType(r.data_type),
    ...(r.is_nullable === 'NO' && !SYSTEM_COLUMNS.has(r.column_name) ? { required: true } : {}),
  }));
}

async function fetchTableMeta(
  db: DatabaseClient,
  tableName: string
): Promise<{ description: string | null } | null> {
  const row = await db.queryRow<{ table_name: string; description: string | null }>(
    `SELECT t.table_name, obj_description(('public.' || quote_ident(t.table_name))::regclass, 'pg_class') AS description
     FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = $1`,
    [tableName]
  );
  return row ? { description: row.description ?? null } : null;
}

export async function getTable(db: DatabaseClient, rawName: string): Promise<CustomTable | null> {
  const tableName = normalizeTableName(rawName);
  const meta = await fetchTableMeta(db, tableName);
  if (!meta) return null;

  const columns = await fetchTableColumns(db, tableName);
  const countRow = await db.queryRow<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);

  return {
    name: tableName,
    description: meta.description,
    columns,
    row_count: Number(countRow?.count ?? 0),
  };
}

export async function listTables(db: DatabaseClient): Promise<CustomTable[]> {
  const excluded = Array.from(RESERVED_TABLES).map(sqlStringLiteral).join(', ');
  const tableRows = await db.query<{ table_name: string; description: string | null }>(
    `SELECT t.table_name, obj_description(('public.' || quote_ident(t.table_name))::regclass, 'pg_class') AS description
     FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND t.table_name NOT IN (${excluded})
     ORDER BY t.table_name ASC`
  );

  const tables: CustomTable[] = [];
  for (const row of tableRows) {
    const columns = await fetchTableColumns(db, row.table_name);
    const countRow = await db.queryRow<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "${row.table_name}"`);
    tables.push({
      name: row.table_name,
      description: row.description ?? null,
      columns,
      row_count: Number(countRow?.count ?? 0),
    });
  }
  return tables;
}

export async function createOrUpdateTable(
  db: DatabaseClient,
  input: {
    name: string;
    description?: string | null;
    columns?: CustomTableColumn[];
  }
): Promise<{ table: CustomTable; created: boolean }> {
  const tableName = normalizeTableName(input.name);
  const cols = normalizeColumns(input.columns);
  const existing = await getTable(db, tableName);

  if (!existing) {
    const colDefs = [
      `"id" UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
      ...cols.map((c) => `"${c.name}" ${pgTypeFor(c.type)}${c.required ? ' NOT NULL' : ''}`),
      `"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
      `"updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    ];
    await db.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')})`);
    if (typeof input.description === 'string' && input.description.trim()) {
      await db.query(`COMMENT ON TABLE "${tableName}" IS ${sqlStringLiteral(input.description.trim())}`);
    }
    const table = (await getTable(db, tableName))!;
    return { table, created: true };
  }

  for (const col of cols) {
    await db.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${pgTypeFor(col.type)}`);
  }
  if (typeof input.description === 'string' && input.description.trim()) {
    await db.query(`COMMENT ON TABLE "${tableName}" IS ${sqlStringLiteral(input.description.trim())}`);
  }
  const table = (await getTable(db, tableName))!;
  return { table, created: false };
}

export async function insertRows(
  db: DatabaseClient,
  rawTableName: string,
  items: Record<string, any>[],
  options: { autoCreate?: boolean; autoAddColumns?: boolean } = {}
): Promise<{ table: CustomTable; rows: CustomRow[] }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Provide a non-empty row object or rows array to insert.');
  }

  const tableName = normalizeTableName(rawTableName);
  let table = await getTable(db, tableName);

  const inferFromItems = (): CustomTableColumn[] => {
    const inferred: CustomTableColumn[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error('Each row must be a JSON object.');
      }
      for (const [rawKey, val] of Object.entries(item)) {
        const key = normalizeIdentifier(rawKey, 'column name');
        if (SYSTEM_COLUMNS.has(key) || seen.has(key)) continue;
        seen.add(key);
        inferred.push({ name: key, type: inferColumnType(val) });
      }
    }
    return inferred;
  };

  if (!table) {
    if (options.autoCreate === false) {
      throw new Error(`Table "${tableName}" does not exist. Create it first with saintstack_create_table.`);
    }
    const created = await createOrUpdateTable(db, { name: tableName, columns: inferFromItems() });
    table = created.table;
  } else if (options.autoAddColumns !== false) {
    const existingNames = new Set(table.columns.map((c) => c.name));
    const missing = inferFromItems().filter((c) => !existingNames.has(c.name));
    if (missing.length > 0) {
      for (const col of missing) {
        await db.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${pgTypeFor(col.type)}`);
      }
      table = (await getTable(db, tableName))!;
    }
  }

  const colMap = new Map(table.columns.map((c) => [c.name, c]));
  const inserted: CustomRow[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Each row must be a JSON object.');
    }

    // Check required user columns
    for (const col of table.columns) {
      if (col.required && (item[col.name] === undefined || item[col.name] === null)) {
        // Also check normalized key match
        const matchKey = Object.keys(item).find((k) => normalizeIdentifier(k, 'column name') === col.name);
        if (!matchKey || item[matchKey] === undefined || item[matchKey] === null) {
          throw new Error(`Missing required field "${col.name}".`);
        }
      }
    }

    const colNames: string[] = [];
    const placeholders: string[] = [];
    const params: any[] = [];

    for (const [rawKey, rawVal] of Object.entries(item)) {
      const key = normalizeIdentifier(rawKey, 'column name');
      if (SYSTEM_COLUMNS.has(key)) continue;
      const col = colMap.get(key);
      if (!col) {
        throw new Error(`Unknown column "${key}" on table "${tableName}".`);
      }
      const formatted = validateAndFormatValue(col, rawVal);
      params.push(formatted.value);
      colNames.push(`"${col.name}"`);
      placeholders.push(formatted.isJson ? `$${params.length}::jsonb` : `$${params.length}`);
    }

    const sql =
      colNames.length > 0
        ? `INSERT INTO "${tableName}" (${colNames.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`
        : `INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *`;

    const row = await db.queryRow<CustomRow>(sql, params);
    if (row) inserted.push(row);
  }

  table = (await getTable(db, tableName))!;
  return { table, rows: inserted };
}

export async function queryRows(
  db: DatabaseClient,
  rawTableName: string,
  options: { filter?: Record<string, any>; search?: string; limit?: number; offset?: number } = {}
): Promise<{ table: CustomTable; rows: CustomRow[] }> {
  const tableName = normalizeTableName(rawTableName);
  const table = await getTable(db, tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" does not exist.`);
  }

  const colMap = new Map(table.columns.map((c) => [c.name, c]));
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.filter && typeof options.filter === 'object' && !Array.isArray(options.filter)) {
    for (const [rawKey, val] of Object.entries(options.filter)) {
      const key = normalizeIdentifier(rawKey, 'column name');
      const col = colMap.get(key);
      if (!col) {
        throw new Error(`Unknown filter column "${key}" on table "${tableName}".`);
      }
      if (val === null) {
        conditions.push(`"${key}" IS NULL`);
      } else if (col.type === 'json' && typeof val === 'object') {
        params.push(JSON.stringify(val));
        conditions.push(`"${key}" @> $${params.length}::jsonb`);
      } else {
        params.push(val);
        conditions.push(`"${key}" = $${params.length}`);
      }
    }
  }

  if (options.search && options.search.trim()) {
    const searchable = table.columns.filter((c) => !SYSTEM_COLUMNS.has(c.name));
    if (searchable.length > 0) {
      params.push(`%${options.search.trim()}%`);
      const pIdx = params.length;
      const ors = searchable.map((c) => `COALESCE("${c.name}"::text, '') ILIKE $${pIdx}`);
      conditions.push(`(${ors.join(' OR ')})`);
    }
  }

  const limit = Math.min(200, Math.max(1, options.limit ?? 25));
  const offset = Math.max(0, options.offset ?? 0);
  params.push(limit, offset);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await db.query<CustomRow>(
    `SELECT * FROM "${tableName}" ${whereClause} ORDER BY "created_at" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { table, rows };
}

export async function updateRow(
  db: DatabaseClient,
  rawTableName: string,
  rowId: string,
  patch: Record<string, any>,
  options: { autoAddColumns?: boolean } = {}
): Promise<CustomRow> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Update data must be a non-empty JSON object.');
  }
  const tableName = normalizeTableName(rawTableName);
  let table = await getTable(db, tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" does not exist.`);
  }

  if (options.autoAddColumns !== false) {
    const existingNames = new Set(table.columns.map((c) => c.name));
    for (const [rawKey, val] of Object.entries(patch)) {
      const key = normalizeIdentifier(rawKey, 'column name');
      if (SYSTEM_COLUMNS.has(key) || existingNames.has(key)) continue;
      await db.query(
        `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${key}" ${pgTypeFor(inferColumnType(val))}`
      );
      existingNames.add(key);
    }
    table = (await getTable(db, tableName))!;
  }

  const colMap = new Map(table.columns.map((c) => [c.name, c]));
  const assignments: string[] = [];
  const params: any[] = [];

  for (const [rawKey, rawVal] of Object.entries(patch)) {
    const key = normalizeIdentifier(rawKey, 'column name');
    if (SYSTEM_COLUMNS.has(key)) continue;
    const col = colMap.get(key);
    if (!col) {
      throw new Error(`Unknown column "${key}" on table "${tableName}".`);
    }
    const formatted = validateAndFormatValue(col, rawVal);
    params.push(formatted.value);
    assignments.push(`"${key}" = $${params.length}${formatted.isJson ? '::jsonb' : ''}`);
  }

  if (assignments.length === 0) {
    throw new Error('Provide at least one editable column to update.');
  }
  assignments.push(`"updated_at" = NOW()`);
  params.push(rowId);

  const updated = await db.queryRow<CustomRow>(
    `UPDATE "${tableName}" SET ${assignments.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
    params
  );
  if (!updated) {
    throw new Error(`Row "${rowId}" not found in table "${tableName}".`);
  }
  return updated;
}

export async function deleteRow(db: DatabaseClient, rawTableName: string, rowId: string): Promise<boolean> {
  const tableName = normalizeTableName(rawTableName);
  const table = await getTable(db, tableName);
  if (!table) {
    throw new Error(`Table "${tableName}" does not exist.`);
  }
  const row = await db.queryRow<{ id: string }>(`DELETE FROM "${tableName}" WHERE "id" = $1 RETURNING "id"`, [rowId]);
  return !!row;
}

export async function deleteTable(db: DatabaseClient, rawTableName: string): Promise<boolean> {
  const tableName = normalizeTableName(rawTableName);
  if (PROTECTED_TABLES.has(tableName)) {
    throw new Error(`Table "${tableName}" is protected and cannot be deleted.`);
  }
  const existing = await getTable(db, tableName);
  if (!existing) return false;
  await db.query(`DROP TABLE IF EXISTS "${tableName}"`);
  return true;
}
