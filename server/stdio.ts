// MCP over stdio, for clients that launch a local process (Claude Desktop, Glama checks):
//   npx tsx server/stdio.ts
// Reads one JSON-RPC message per line from stdin and answers with the same handler as POST /api/mcp.
// No keys needed for the read tools; Toss quotes stay off unless TOSS_CLIENT_ID/SECRET are set.
import { createInterface } from 'node:readline'

// stdout carries protocol messages only, so route the server's own logs to stderr
console.log = (...a: unknown[]) => console.error(...a)

const { app } = await import('./app.js')

const rl = createInterface({ input: process.stdin })
for await (const line of rl) {
  if (!line.trim()) continue
  const res = await app.request('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: line })
  if (res.status === 202) continue // notification: no reply
  process.stdout.write((await res.text()) + '\n')
}
