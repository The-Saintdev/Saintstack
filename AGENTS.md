# Agent Instructions: Working with SaintStack

SaintStack provides persistent, cross-project memory and context tracking for coding agents.

## Core Rules for Coding Agents

1. **Check Context Before Exploring Code**:
   - At the beginning of a task, call `saintstack_get_context(project_id)` or `saintstack_search_memory` before scanning the entire codebase.
   - Do not load huge directory trees into conversation history when targeted memory queries suffice.

2. **Save Architectural Decisions**:
   - Whenever an important technical decision, architectural pattern, or refactoring direction is chosen, record it using `saintstack_save_decision`.
   - Include clear rationale and alternatives considered.

3. **Log Session Progress at Completion**:
   - Before ending a major development milestone or session, call `saintstack_save_session`.
   - Provide summary, completed tasks, touched files, and the immediate next task so the next agent (or the user on mobile) can pick up without rediscovery.

4. **Preserve Token Budget**:
   - Retrieve only what is relevant to the active task.
   - Avoid dumping entire source code files into memory records; store concise architectural invariants and conventions.
   - Never store private API credentials, `.env` variables, or secrets.
