import { describe, it, expect } from 'vitest';
import { handleMcpRequest } from '../src/mcp';
import { createMockDb } from './mockDb';

describe('SaintStack Custom Tables & Rows via MCP', () => {
  const db = createMockDb();

  it('creates tables, inserts batch rows, validates required/typed columns, queries, updates, and deletes', async () => {
    // 1. Rejects reserved core table names
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

    // 2. Creates a structured table
    const createRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'saintstack_create_table',
          arguments: {
            name: 'job_applications',
            description: 'Track job outreach and interviews',
            columns: [
              { name: 'company', type: 'text', required: true },
              { name: 'role', type: 'text', required: true },
              { name: 'salary_k', type: 'number' },
              { name: 'status', type: 'text' },
            ],
          },
        },
      },
      db
    );
    expect(createRes.error).toBeUndefined();
    const created = JSON.parse(createRes.result.content[0].text);
    expect(created.created).toBe(true);
    expect(created.table.name).toBe('job_applications');
    expect(created.table.columns).toHaveLength(4);

    // 3. Enforces required fields
    const invalidRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'job_applications',
            row: { company: 'Acme' },
          },
        },
      },
      db
    );
    expect(invalidRes.error?.message).toContain('Missing required field "role"');

    // 4. Inserts multiple rows
    const insertRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'job_applications',
            rows: [
              { company: 'Vercel', role: 'Staff Engineer', salary_k: 220, status: 'applied' },
              { company: 'Cloudflare', role: 'Systems Engineer', salary_k: 210, status: 'interviewing' },
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

    // 5. Lists tables with row counts
    const listRes = await handleMcpRequest(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'saintstack_list_tables', arguments: {} } },
      db
    );
    const listed = JSON.parse(listRes.result.content[0].text);
    expect(listed.count).toBe(1);
    expect(listed.tables[0].row_count).toBe(2);

    // 6. Queries with filter & text search
    const filterRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'saintstack_query_rows',
          arguments: { table_name: 'job_applications', filter: { status: 'interviewing' } },
        },
      },
      db
    );
    const filtered = JSON.parse(filterRes.result.content[0].text);
    expect(filtered.count).toBe(1);
    expect(filtered.rows[0].data.company).toBe('Cloudflare');

    // 7. Updates a row
    const updateRes = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'saintstack_update_row',
          arguments: { table_name: 'job_applications', row_id: firstRowId, data: { status: 'offer' } },
        },
      },
      db
    );
    const updated = JSON.parse(updateRes.result.content[0].text);
    expect(updated.row.data.status).toBe('offer');
    expect(updated.row.data.company).toBe('Vercel');

    // 8. Auto-creates a table when inserting directly without prior create_table
    const autoInsert = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'saintstack_insert_rows',
          arguments: {
            table_name: 'bookmarks',
            row: { title: 'Nanobrowser', url: 'https://nanobrowser.ai', starred: true },
          },
        },
      },
      db
    );
    expect(autoInsert.error).toBeUndefined();
    const autoData = JSON.parse(autoInsert.result.content[0].text);
    expect(autoData.table).toBe('bookmarks');

    // 9. Deletes row and table cleanly
    const delRow = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'saintstack_delete_row', arguments: { table_name: 'job_applications', row_id: firstRowId } },
      },
      db
    );
    expect(JSON.parse(delRow.result.content[0].text).deleted).toBe(true);

    const delTable = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'saintstack_delete_table', arguments: { table_name: 'bookmarks' } },
      },
      db
    );
    expect(JSON.parse(delTable.result.content[0].text).deleted).toBe(true);
  });
});
