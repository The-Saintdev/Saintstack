#!/usr/bin/env node

/**
 * SaintStack MCP Server Connection Tester
 * Usage: node test-connection.js <server-url> [api-key]
 * Example: node test-connection.js https://saintstack.crescoafrica.com saint_sec_...
 */

const args = process.argv.slice(2);
const serverUrl = args[0] || process.env.SAINTSTACK_URL || 'https://saintstack.crescoafrica.com';
const apiKey = args[1] || process.env.SAINTSTACK_API_KEY;

if (!serverUrl) {
  console.error('Usage: node test-connection.js <server-url> [api-key]');
  process.exit(1);
}

const baseUrl = serverUrl.replace(/\/+$/, '');
const healthUrl = `${baseUrl}/health`;
const mcpUrl = `${baseUrl}/mcp`;

async function testConnection() {
  console.log(`[1/2] Checking gateway health at: ${healthUrl}`);
  try {
    const healthRes = await fetch(healthUrl);
    if (!healthRes.ok) {
      console.error(`❌ Health check failed with status: ${healthRes.status}`);
      process.exit(1);
    }
    const healthJson = await healthRes.json();
    console.log(`✅ Gateway is online! Server response:`, healthJson);
  } catch (err) {
    console.error(`❌ Could not connect to gateway:`, err.message);
    process.exit(1);
  }

  console.log(`\n[2/2] Testing MCP protocol handshake at: ${mcpUrl}`);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };

    const mcpRes = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (mcpRes.status === 401) {
      console.error('❌ Authentication failed: 401 Unauthorized. Check your API key.');
      process.exit(1);
    }

    if (!mcpRes.ok) {
      console.error(`❌ MCP endpoint returned HTTP status ${mcpRes.status}`);
      process.exit(1);
    }

    const mcpJson = await mcpRes.json();
    if (mcpJson.result && mcpJson.result.tools) {
      console.log(`✅ MCP Handshake succeeded! Available tools (${mcpJson.result.tools.length}):`);
      mcpJson.result.tools.forEach(t => console.log(`   - ${t.name}: ${t.description.slice(0, 70)}...`));
    } else {
      console.log(`Received MCP response:`, mcpJson);
    }

    console.log(`\n🎉 SaintStack is fully configured and ready for your coding agents!`);
  } catch (err) {
    console.error(`❌ MCP test failed:`, err.message);
    process.exit(1);
  }
}

testConnection();
