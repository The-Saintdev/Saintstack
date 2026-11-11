# Client Configuration Reference

Use these configurations to connect your coding assistant to your SaintStack instance.

---

### Claude Code CLI
```bash
claude mcp add --transport http --scope user saintstack https://<your-saintstack-host>/mcp \
  --header "Authorization: Bearer <YOUR_API_KEY>"
```

### Cursor IDE
1. Open **Cursor Settings** → **Features** → **MCP**.
2. Click **+ Add New MCP Server**.
3. Name: `saintstack`
4. Type: `sse` or `http`
5. URL: `https://<your-saintstack-host>/mcp`
6. Headers:
   ```json
   {
     "Authorization": "Bearer <YOUR_API_KEY>"
   }
   ```

### Google Antigravity
In `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "saintstack": {
      "serverUrl": "https://<your-saintstack-host>/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

### Claude Mobile & Web
1. Open **Settings** → **Connectors**.
2. Click **Add custom connector**.
3. Name: `SaintStack`
4. URL: `https://<your-saintstack-host>/mcp`
5. Header Key: `Authorization`
6. Header Value: `Bearer <YOUR_API_KEY>`
