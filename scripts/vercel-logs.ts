#!/usr/bin/env npx ts-node
/**
 * Fetch recent Vercel runtime logs (documents API, webhook, checkout).
 * Requires VERCEL_TOKEN in env (create at https://vercel.com/account/tokens).
 *
 * Alternative: In Cursor, use the Vercel MCP (Settings → Tools & MCP → vercel).
 * Ask: "Get runtime logs for company-formation-questionnaire, last 24h" or
 * "Show me runtime errors for this project" so the agent can pull logs via MCP.
 *
 * Usage:
 *   VERCEL_TOKEN=xxx npx ts-node scripts/vercel-logs.ts
 *   VERCEL_TOKEN=xxx npx ts-node scripts/vercel-logs.ts --env production
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_ACCESS_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'company-formation-questionnaire';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_RbDFm0nm7M4HFnPyzekw2jlj';

async function main() {
  if (!VERCEL_TOKEN) {
    console.error('Set VERCEL_TOKEN. Create at https://vercel.com/account/tokens');
    console.error('Or use Vercel MCP in Cursor and ask: "Get runtime logs for this project"');
    process.exit(1);
  }

  const env = process.argv.includes('--env') && process.argv[process.argv.indexOf('--env') + 1]
    ? process.argv[process.argv.indexOf('--env') + 1]
    : 'production';

  const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` };

  // Get latest deployment for project
  const listUrl = `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=1`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) {
    console.error('Vercel API (deployments):', listRes.status, await listRes.text());
    process.exit(1);
  }
  const listData = (await listRes.json()) as { deployments?: { uid: string }[] };
  const deployments = listData.deployments || [];
  const deploymentId = deployments[0]?.uid;
  if (!deploymentId) {
    console.error('No deployment found for project', PROJECT_ID);
    process.exit(1);
  }

  const logsUrl = `https://api.vercel.com/v1/projects/${PROJECT_ID}/deployments/${deploymentId}/runtime-logs?teamId=${TEAM_ID}`;
  const logsRes = await fetch(logsUrl, { headers });
  if (!logsRes.ok) {
    console.error('Vercel API (runtime-logs):', logsRes.status, await logsRes.text());
    process.exit(1);
  }

  const text = await logsRes.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const list = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { message: line };
    }
  });

  console.log(`\n--- Runtime logs (deployment ${deploymentId.slice(0, 12)}..., ${list.length} entries) ---\n`);
  for (const entry of list.slice(-80)) {
    const msg = entry.message ?? '';
    const time = entry.timestampInMs ? new Date(entry.timestampInMs).toISOString() : '';
    const path = entry.requestPath || '';
    const status = entry.responseStatusCode != null ? entry.responseStatusCode : '';
    const level = entry.level || 'info';
    console.log(`${time} [${level}] ${status} ${path}`);
    if (typeof msg === 'string') console.log(`  ${msg.slice(0, 400)}`);
    else console.log('  ', JSON.stringify(msg).slice(0, 400));
    console.log('');
  }
  console.log(`--- ${Math.min(80, list.length)} of ${list.length} entries ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
