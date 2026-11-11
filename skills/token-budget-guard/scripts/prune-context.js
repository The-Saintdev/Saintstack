#!/usr/bin/env node

/**
 * Token Budget Guard: Context Pruner & Diff Compactor
 * Checks git status/diff and formats a high-density, token-efficient patch summary.
 */

const { execSync } = require('child_process');

const BANISHED_PATTERNS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /Cargo\.lock$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /dist\//,
  /build\//,
  /coverage\//,
  /\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|zip|tar\.gz)$/i,
];

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function main() {
  const statusRaw = runCommand('git status --porcelain');
  if (!statusRaw) {
    console.log('✅ Working tree clean. 0 uncommitted tokens.');
    return;
  }

  const lines = statusRaw.split('\n');
  const allowedFiles = [];
  const blockedFiles = [];

  for (const line of lines) {
    const file = line.slice(3).trim();
    const isBanished = BANISHED_PATTERNS.some(re => re.test(file));
    if (isBanished) {
      blockedFiles.push(file);
    } else {
      allowedFiles.push(file);
    }
  }

  console.log(`=== 🛡️ Token Budget Guard Audit ===\n`);
  console.log(`📁 Files Ready for Agent Context (${allowedFiles.length}):`);
  allowedFiles.forEach(f => console.log(`   [+] ${f}`));

  if (blockedFiles.length > 0) {
    console.log(`\n🚫 Banished from LLM Context (${blockedFiles.length}):`);
    blockedFiles.forEach(f => console.log(`   [-] ${f} (Lockfile / Minified asset)`));
  }

  // Get diff size
  const fullDiff = runCommand('git diff');
  const rawTokens = estimateTokens(fullDiff);

  // Compact diff (exclude banished)
  let compactDiff = '';
  if (allowedFiles.length > 0) {
    const filesArgs = allowedFiles.map(f => `"${f}"`).join(' ');
    compactDiff = runCommand(`git diff --unified=3 ${filesArgs}`);
  }
  const cleanTokens = estimateTokens(compactDiff);
  const savedTokens = Math.max(0, rawTokens - cleanTokens);

  console.log(`\n📊 Context Economics:`);
  console.log(`   - Raw Diff Tokens:   ~${rawTokens} tokens`);
  console.log(`   - Pruned Diff Tokens: ~${cleanTokens} tokens`);
  if (savedTokens > 0) {
    console.log(`   - Tokens Saved:       ~${savedTokens} tokens (${Math.round((savedTokens / rawTokens) * 100)}% reduction)`);
  }
}

main();
