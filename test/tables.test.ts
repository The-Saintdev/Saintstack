import { describe, it, expect } from 'vitest';
import { handleMcpRequest } from '../src/mcp';
import { createMockDb } from './mockDb';

describe('SaintStack Real Postgres Tables & Rows via MCP', () => {
  const db = createMockDb();

  it('creates real SQL tables, inserts typed rows, auto-adds columns, queries, updates, and drops tables', async () => {
    // 1. Rejects reserved core table names and invalid identifiers
    const reservedRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'saintstack_create_table', arguments: { name: 'memories' } },
      },
      db
    );
    expect(reservedRes.error?.message).toContain('reserved');

    const badIdentRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'saintstack_create_table', arguments: { name: 'pg_evil' } },
      },
      db
    );
    expect(badIdentRes.error?.message).toContain('pg_/sql_');

    // 2. Creates a real PostgreSQL table with typed columns
    const createRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'saintstack_create_table',
          arguments: {
            name: 'raymond',
            description: 'Everything agents know about Raymond.',
            columns: [
              { name: 'topic', type: 'text', required: true },
              { name: 'value', type: 'text', required: true },
              { name: 'priority', type: 'integer' },
            ],
          },
        },
      },
      db
    );
    expect(createRes.error).toBeUndefined();
    const created = JSON.parse(createRes.result.content[0].text);
    expect(created.created).toBe(true);
    expect(created.table.name).toBe('raymond');
    expect(created.table.description).toBe('Everything agents know about Raymond.');
    expect(created.table.columns.map((c: any) => c.name)).toContain('topic');

    // 3. Enforces required NOT NULL columns
    const invalidRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'raymond',
            row: { topic: 'bio' },
          },
        },
      },
      db
    );
    expect(invalidRes.error?.message).toContain('Missing required field "value"');

    // 4. Inserts batch rows and auto-evolves new columns via ALTER TABLE ADD COLUMN
    const insertRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'raymond',
            rows: [
              { topic: 'os', value: 'Windows 11', priority: 1, category: 'environment' },
              { topic: 'brand', value: 'Cresco Africa', priority: 2, category: 'business' },
            ],
          },
        },
      },
      db
    );
    expect(insertRes.error).toBeUndefined();
    const inserted = JSON.parse(insertRes.result.content[0].text);
    expect(inserted.inserted_count).toBe(2);
    const firstRowId = inserted.rows[0].id;
    expect(inserted.rows[0].category).toBe('environment');

    // 5. Lists real tables with columns and exact row counts
    const listRes = await handleMcpRequest(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'saintstack_list_tables', arguments: {} } },
      db
    );
    const listed = JSON.parse(listRes.result.content[0].text);
    expect(listed.count).toBe(1);
    expect(listed.tables[0].name).toBe('raymond');
    expect(listed.tables[0].row_count).toBe(2);

    // 6. Queries directly against real columns with filter & search
    const filterRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'saintstack_query_rows',
          arguments: { table_name: 'raymond', filter: { category: 'business' } },
        },
      },
      db
    );
    const filtered = JSON.parse(filterRes.result.content[0].text);
    expect(filtered.count).toBe(1);
    expect(filtered.rows[0].value).toBe('Cresco Africa');

    // 7. Updates a row
    const updateRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'saintstack_update_row',
          arguments: { table_name: 'raymond', row_id: firstRowId, data: { value: 'Windows 11 + PowerShell' } },
        },
      },
      db
    );
    const updated = JSON.parse(updateRes.result.content[0].text);
    expect(updated.row.value).toBe('Windows 11 + PowerShell');

    // 8. Auto-creates a real SQL table when inserting directly without prior create_table
    const autoInsert = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'cresco',
            row: { area: 'product', title: 'SaintStack', active: true },
          },
        },
      },
      db
    );
    expect(autoInsert.error).toBeUndefined();
    const autoData = JSON.parse(autoInsert.result.content[0].text);
    expect(autoData.table).toBe('cresco');
    expect(autoData.rows[0].title).toBe('SaintStack');

    // 9. Protects raymond and cresco from table deletion while allowing temporary tables to be dropped
    const delRaymond = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 90,
        method: 'tools/call',
        params: { name: 'saintstack_delete_table', arguments: { table_name: 'raymond' } },
      },
      db
    );
    expect(delRaymond.error?.message).toContain('protected');

    const delCresco = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 91,
        method: 'tools/call',
        params: { name: 'saintstack_delete_table', arguments: { table_name: 'cresco' } },
      },
      db
    );
    expect(delCresco.error?.message).toContain('protected');

    // 10. Deletes row and drops non-protected table cleanly
    const delRow = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'saintstack_delete_row', arguments: { table_name: 'raymond', row_id: firstRowId } },
      },
      db
    );
    expect(JSON.parse(delRow.result.content[0].text).deleted).toBe(true);

    await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 92,
        method: 'tools/call',
        params: { name: 'saintstack_insert_rows', arguments: { table_name: 'scratch_tmp', row: { note: 'temp' } } },
      },
      db
    );
    const delTable = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'saintstack_delete_table', arguments: { table_name: 'scratch_tmp' } },
      },
      db
    );
    expect(JSON.parse(delTable.result.content[0].text).deleted).toBe(true);
  });
});
