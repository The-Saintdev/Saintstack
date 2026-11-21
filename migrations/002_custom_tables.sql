-- SaintStack Migration 002: Agent-defined Custom Tables & Rows
-- Allows AI agents to create structured custom tables and insert/query/update/delete rows dynamically.

CREATE TABLE IF NOT EXISTS custom_tables (
    name TEXT PRIMARY KEY,
    project_id TEXT,
    description TEXT,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL REFERENCES custom_tables(name) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_tables_project_id ON custom_tables(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_rows_table_created ON custom_rows(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_rows_data_gin ON custom_rows USING gin(data);
