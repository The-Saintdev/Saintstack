import { DatabaseClient } from './db';
import { McpRequest, McpResponse, McpTool } from './types';
import { saveMemory, searchMemories, getContextBundle, formatContextAsMarkdown } from './memory';
import { saveDecision, getDecisions } from './decisions';
import { saveSession, getLastSession } from './sessions';
import { upsertProject, listProjects } from './projects';

export const SAINTSTACK_TOOLS: McpTool[] = [
  {
    name: 'saintstack_search_memory',
    description:
      'Search persistent memories across global rules and project-specific knowledge. Use this to find conventions, patterns, or architecture facts before writing code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or phrases' },
        project_id: { type: 'string', description: 'Project ID (e.g. "The-Saintdev/Saintstack" or slug). If omitted, searches global knowledge.' },
        category: {
          type: 'string',
          enum: ['architecture', 'convention', 'decision', 'pattern', 'knowledge', 'code_map'],
          description: 'Filter by memory category',
        },
        tag: { type: 'string', description: 'Filter by specific tag' },
        limit: { type: 'number', description: 'Maximum items to return (default 5 for token efficiency)' },
      },
    },
  },
  {
    name: 'saintstack_save_memory',
    description:
      'Save durable knowledge, architectural patterns, conventions, or facts so all AI agents (Claude, Codex, Antigravity) remember them in future sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short descriptive title of the memory' },
        content: { type: 'string', description: 'The exact knowledge, convention, or architectural fact' },
        project_id: { type: 'string', description: 'Project ID if project-specific, or omit/null for global rules that apply to all projects' },
        category: {
          type: 'string',
          enum: ['architecture', 'convention', 'decision', 'pattern', 'knowledge', 'code_map'],
          description: 'Category of memory (default: knowledge)',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags for discovery' },
        importance: { type: 'number', description: 'Importance rating from 1 (minor note) to 10 (critical invariant, default 5)' },
        source: { type: 'string', description: 'Author or agent saving this memory (e.g. "claude", "antigravity", "codex")' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'saintstack_ingest_graph',
    description:
      'Ingest a code dependency graph, AST summary, or GRAPH_REPORT.md (e.g. from Graphify) into persistent project memory.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Title of the map (default: "Codebase Map & Dependency Architecture")' },
        content: { type: 'string', description: 'The dependency overview, call graph, or module relationships' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (e.g. ["graphify", "dependencies"])' },
      },
      required: ['project_id', 'content'],
    },
  },
  {
    name: 'saintstack_get_context',
    description:
      'Fetch a compact context bundle containing active project info, global conventions, architecture summaries, recent decisions, and the last session handover. Formats as high-density Markdown by default for maximum token savings.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID (e.g. "The-Saintdev/Saintstack" or slug)' },
        query: { type: 'string', description: 'Optional topic/task to retrieve extra relevant memories' },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Output format. "markdown" is token-optimized (recommended), "json" provides structured objects.',
        },
      },
    },
  },
  {
    name: 'saintstack_save_decision',
    description:
      'Record an Architectural Decision Record (ADR) including context, rationale, and alternatives considered.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Title of the architectural decision' },
        context: { type: 'string', description: 'Context and problem statement that led to this decision' },
        decision: { type: 'string', description: 'The decision that was made' },
        rationale: { type: 'string', description: 'Why this decision was chosen' },
        alternatives: { type: 'string', description: 'Other options considered and why rejected' },
        consequences: { type: 'string', description: 'Consequences, trade-offs, or follow-ups' },
        status: {
          type: 'string',
          enum: ['proposed', 'accepted', 'superseded', 'deprecated'],
          description: 'Current status (default: accepted)',
        },
      },
      required: ['project_id', 'title', 'context', 'decision'],
    },
  },
  {
    name: 'saintstack_get_decisions',
    description: 'Retrieve previous architectural decisions recorded for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        status: { type: 'string', description: 'Optional status filter (e.g. "accepted")' },
        limit: { type: 'number', description: 'Max decisions to return (default 10)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'saintstack_save_session',
    description:
      'Save session progress and handover summary at the end of a development session so future sessions continue seamlessly.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        agent: { type: 'string', description: 'Name of the agent (e.g. "claude-code", "antigravity", "codex")' },
        summary: { type: 'string', description: 'Summary of what was completed and current state' },
        completed_tasks: { type: 'array', items: { type: 'string' }, description: 'List of completed items' },
        next_tasks: { type: 'array', items: { type: 'string' }, description: 'Recommended next actions' },
        touched_files: { type: 'array', items: { type: 'string' }, description: 'Files modified during the session' },
        open_issues: { type: 'array', items: { type: 'string' }, description: 'Known bugs or pending questions' },
      },
      required: ['project_id', 'agent', 'summary'],
    },
  },
  {
    name: 'saintstack_get_session',
    description: 'Retrieve the most recent session handover summary for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'saintstack_register_project',
    description: 'Register or update project metadata in the SaintStack registry.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique project ID (e.g. "The-Saintdev/Saintstack" or slug)' },
        name: { type: 'string', description: 'Display name' },
        description: { type: 'string', description: 'Brief description of the repository/project' },
        repo_url: { type: 'string', description: 'GitHub / GitLab repository URL' },
        default_branch: { type: 'string', description: 'Default Git branch (default: main)' },
        metadata: { type: 'object', description: 'Arbitrary project metadata' },
      },
      required: ['id'],
    },
  },
  {
    name: 'saintstack_list_projects',
    description: 'List all projects registered in SaintStack.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleMcpRequest(
  request: McpRequest,
  db: DatabaseClient
): Promise<McpResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'saintstack',
              version: '0.1.0',
            },
          },
        };
      }

      case 'notifications/initialized': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: SAINTSTACK_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};

        let textOutput: string;

        switch (toolName) {
          case 'saintstack_search_memory': {
            const memories = await searchMemories(db, {
              projectId: args.project_id,
              query: args.query,
              category: args.category,
              tag: args.tag,
              limit: args.limit || 5,
            });
            textOutput = JSON.stringify({ count: memories.length, memories }, null, 2);
            break;
          }

          case 'saintstack_save_memory': {
            const memory = await saveMemory(db, {
              title: args.title,
              content: args.content,
              project_id: args.project_id,
              category: args.category,
              tags: args.tags,
              importance: args.importance,
              source: args.source,
            });
            textOutput = JSON.stringify({ message: 'Memory saved successfully', memory }, null, 2);
            break;
          }

          case 'saintstack_ingest_graph': {
            const title = args.title || 'Codebase Map & Dependency Architecture';
            const tags = args.tags || ['graphify', 'architecture', 'code_map'];
            const memory = await saveMemory(db, {
              project_id: args.project_id,
              title,
              content: args.content,
              category: 'code_map',
              tags,
              importance: 9,
              source: 'graphify',
            });
            textOutput = JSON.stringify({ message: 'Code graph ingested into project memory', memory }, null, 2);
            break;
          }

          case 'saintstack_get_context': {
            const bundle = await getContextBundle(db, args.project_id, args.query);
            if (args.format === 'json') {
              textOutput = JSON.stringify(bundle, null, 2);
            } else {
              // High-density markdown format (saves ~30-40% tokens)
              textOutput = formatContextAsMarkdown(bundle);
            }
            break;
          }

          case 'saintstack_save_decision': {
            const decision = await saveDecision(db, {
              project_id: args.project_id,
              title: args.title,
              context: args.context,
              decision: args.decision,
              rationale: args.rationale,
              consequences: args.consequences,
              alternatives: args.alternatives,
              status: args.status,
            });
            textOutput = JSON.stringify({ message: 'Decision recorded', decision }, null, 2);
            break;
          }

          case 'saintstack_get_decisions': {
            const decisions = await getDecisions(db, args.project_id, args.status, args.limit || 10);
            textOutput = JSON.stringify({ count: decisions.length, decisions }, null, 2);
            break;
          }

          case 'saintstack_save_session': {
            const session = await saveSession(db, {
              project_id: args.project_id,
              agent: args.agent,
              summary: args.summary,
              completed_tasks: args.completed_tasks,
              next_tasks: args.next_tasks,
              touched_files: args.touched_files,
              open_issues: args.open_issues,
            });
            textOutput = JSON.stringify({ message: 'Session handover saved', session }, null, 2);
            break;
          }

          case 'saintstack_get_session': {
            const session = await getLastSession(db, args.project_id);
            textOutput = JSON.stringify(session || { message: 'No previous session found for this project' }, null, 2);
            break;
          }

          case 'saintstack_register_project': {
            const project = await upsertProject(db, {
              id: args.id,
              name: args.name,
              description: args.description,
              repo_url: args.repo_url,
              default_branch: args.default_branch,
              metadata: args.metadata,
            });
            textOutput = JSON.stringify({ message: 'Project registered successfully', project }, null, 2);
            break;
          }

          case 'saintstack_list_projects': {
            const projects = await listProjects(db);
            textOutput = JSON.stringify({ count: projects.length, projects }, null, 2);
            break;
          }

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
              },
            };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: textOutput,
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: err.message || 'Internal MCP error',
      },
    };
  }
}
