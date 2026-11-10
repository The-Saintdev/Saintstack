-- SaintStack Migration 001: Initial Schema
-- Dedicated to persistent, lightweight AI memory and project intelligence

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- API Keys table for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Projects registry table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, -- e.g. "The-Saintdev/Saintstack" or slug like "saintstack"
    name TEXT NOT NULL,
    description TEXT,
    repo_url TEXT,
    default_branch TEXT DEFAULT 'main',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memories table (Global memories have project_id = NULL)
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'knowledge', -- 'architecture', 'convention', 'decision', 'pattern', 'knowledge', 'code_map'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    importance INT DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    source TEXT DEFAULT 'agent', -- 'claude', 'codex', 'antigravity', 'graphify', 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Architectural Decision Records (ADR)
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted', -- 'proposed', 'accepted', 'superseded', 'deprecated'
    context TEXT NOT NULL,
    decision TEXT NOT NULL,
    rationale TEXT,
    consequences TEXT,
    alternatives TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session Handover Summaries
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent TEXT NOT NULL, -- e.g. 'claude-code', 'antigravity', 'codex'
    summary TEXT NOT NULL,
    completed_tasks JSONB DEFAULT '[]'::jsonb,
    next_tasks JSONB DEFAULT '[]'::jsonb,
    touched_files JSONB DEFAULT '[]'::jsonb,
    open_issues JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance and Search Indexes
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING gin(to_tsvector('english', title || ' ' || content));

CREATE INDEX IF NOT EXISTS idx_decisions_project_id ON decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

CREATE INDEX IF NOT EXISTS idx_sessions_project_created ON sessions(project_id, created_at DESC);
