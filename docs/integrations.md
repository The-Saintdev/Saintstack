# Client Integrations Guide

Connect your coding assistants to your deployed SaintStack server (`https://saintstack.<your-subdomain>.workers.dev/mcp`).

---

### 1. Claude Code

Run the MCP add command:
```bash
claude mcp add --transport http --scope user saintstack https://saintstack.<your-subdomain>.workers.dev/mcp \
  --header "Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>"
```

For the Claude mobile / web app:
1. Open **Settings** → **Connectors**.
2. Click **Add custom connector**.
3. Set the URL to your SaintStack `/mcp` endpoint and supply your Bearer authorization header.

---

### 2. Google Antigravity

In your global configuration file (`~/.gemini/config/mcp_config.json`):
```json
{
  "mcpServers": {
    "saintstack": {
      "serverUrl": "https://saintstack.<your-subdomain>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_SAINTSTACK_API_KEY>"
      }
    }
  }
}
```

---

### 3. OpenAI Codex / Agents

Add the server via Codex CLI or configuration:
```bash
codex mcp add saintstack --url https://saintstack.<your-subdomain>.workers.dev/mcp
```
Or define in your custom connector settings with your `Authorization: Bearer <YOUR_SAINTSTACK_API_KEY>`.
