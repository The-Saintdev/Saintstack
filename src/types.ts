export type MemoryCategory =
  | 'architecture'
  | 'convention'
  | 'decision'
  | 'pattern'
  | 'knowledge'
  | 'code_map';

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'deprecated';

export interface Project {
  id: string; // e.g. "The-Saintdev/Saintstack" or slug
  name: string;
  description?: string | null;
  repo_url?: string | null;
  default_branch?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Memory {
  id?: string;
  project_id?: string | null; // null for global memories
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  importance?: number; // 1 - 10
  source?: string; // 'claude', 'antigravity', 'codex', 'manual', etc.
  created_at?: string;
  updated_at?: string;
}

export interface Decision {
  id?: string;
  project_id: string;
  title: string;
  status: DecisionStatus;
  context: string;
  decision: string;
  rationale?: string | null;
  consequences?: string | null;
  alternatives?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id?: string;
  project_id: string;
  agent: string;
  summary: string;
  completed_tasks?: string[];
  next_tasks?: string[];
  touched_files?: string[];
  open_issues?: string[];
  created_at?: string;
}

export interface ContextBundle {
  project?: Project | null;
  global_conventions: Memory[];
  project_architecture: Memory[];
  recent_decisions: Decision[];
  last_session: Session | null;
  relevant_memories: Memory[];
}

export interface Env {
  DATABASE_URL: string;
  SAINTSTACK_API_KEY?: string;
  ENVIRONMENT?: string;
}

// MCP JSON-RPC types
export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
