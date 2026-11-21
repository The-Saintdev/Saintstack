# Client Integrations Guide

Connect your coding assistants to your deployed SaintStack server (`https://<your-saintstack-domain>/mcp`).

SaintStack supports **both**:
1. **OAuth 2.1 + PKCE + Dynamic Client Registration (DCR)** — for one-click connections from Claude.ai, Claude Mobile, Claude in Chrome, and OAuth-based extensions (such as Kilo Code Browser Extension).
2. **Static Bearer / API Key Auth** — via `Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>` or `x-api-key: <YOUR_SAINTSTACK_API_KEY>` for CLI and desktop clients.

---

### 1. Claude (Web, Mobile, Claude in Chrome, & Claude Code)

#### Claude.ai / Claude Mobile / Claude in Chrome (Account-Wide)
1. On **claude.ai** (or Claude Desktop), go to **Customize → Connectors → + Add → Add custom connector**.
2. Enter Name: `SaintStack` and URL: `https://<your-saintstack-domain>/mcp` → click **Continue**.
3. If using **OAuth** (recommended): click **Connect**, enter your `SAINTSTACK_API_KEY` on the SaintStack approval screen, and click **Approve & Connect**.
   - Alternatively, if your account has **Request headers** enabled, select **No sign-in** and add `Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>`.
4. Once connected, SaintStack is automatically available across **claude.ai**, **Claude Mobile (iOS/Android)**, and **Claude in Chrome** (Cowork side panel).

#### Claude Code CLI
```bash
claude mcp add --transport http --scope user saintstack https://<your-saintstack-domain>/mcp \
  --header "Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>"
```

---

### 2. OpenCode (Desktop App & CLI) + OpenCode Browse

OpenCode reads MCP config from `~/.config/opencode/opencode.json` (global) or `./opencode.json` (project), and also supports OAuth (`opencode mcp auth`) or static headers:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "saintstack": {
      "type": "remote",
      "url": "https://<your-saintstack-domain>/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer <YOUR_SAINTSTACK_API_KEY>"
      },
      "enabled": true
    }
  }
}
```
If you also pair **OpenCode Browse** (`browse install`), both `saintstack` and `browse` run side by side inside OpenCode.

---

### 3. Kilo Code (Browser Extension, VS Code, & CLI)

- **Kilo Code Browser Extension (Chrome / Firefox)**: Supports remote MCP over **OAuth 2.1**. Add `https://<your-saintstack-domain>/mcp` as a remote MCP server, complete the OAuth sign-in popup, and enter your `SAINTSTACK_API_KEY`.
- **Kilo Code VS Code / CLI** (`~/.config/kilo/kilo.jsonc`):
  ```jsonc
  {
    "mcp": {
      "saintstack": {
        "type": "remote",
        "url": "https://<your-saintstack-domain>/mcp",
        "headers": {
          "Authorization": "Bearer <YOUR_SAINTSTACK_API_KEY>"
        },
        "oauth": false,
        "enabled": true
      }
    }
  }
  ```

---

### 4. Google Antigravity

In `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "saintstack": {
      "serverUrl": "https://<your-saintstack-domain>/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_SAINTSTACK_API_KEY>"
      }
    }
  }
}
```

---

### 5. OpenAI Codex

```bash
codex mcp add saintstack --url https://<your-saintstack-domain>/mcp
```
Or configure the remote MCP URL with `Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>`.
