-- SaintStack Migration 002: Real Agent-Managed Custom Tables
-- Creates initial personal and business tables (`raymond` and `cresco`).
-- Agents can also create, alter, query, and drop additional real tables dynamically via MCP.

CREATE TABLE IF NOT EXISTS "raymond" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "topic" TEXT NOT NULL,
    "key" TEXT,
    "value" TEXT NOT NULL,
    "category" TEXT,
    "source_agent" TEXT,
    "tags" JSONB DEFAULT '[]'::jsonb,
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "raymond" IS 'Personal knowledge base, preferences, goals, profile, and notes about Raymond.';

CREATE TABLE IF NOT EXISTS "cresco" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "area" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT,
    "url" TEXT,
    "source_agent" TEXT,
    "tags" JSONB DEFAULT '[]'::jsonb,
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "cresco" IS 'Cresco Africa projects, products, domains, clients, tasks, links, and operational records.';
