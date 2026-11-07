// Server-side usage events to GA4 (Measurement Protocol), so API and MCP use shows up next to web visits.
// Sends nothing unless GA_API_SECRET is set. No IP or request body leaves the server: a caller is a salted hash
// of IP + User-Agent, enough to count distinct callers without being able to recover either
import { createHash } from 'node:crypto'
const MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID ?? 'G-GNFSQHZ91Z'

/** Rough caller type from the User-Agent: enough to tell scripts and agents from browsers */
export function callerKind(ua = '') {
  const u = ua.toLowerCase()
  if (!u) return 'unknown'
  if (/claude|anthropic|openai|chatgpt|cursor|mcp|gpt|gemini|copilot/.test(u)) return 'agent'
  if (/curl|wget|httpie/.test(u)) return 'curl'
  if (/python|requests|aiohttp|httpx/.test(u)) return 'python'
  if (/node|undici|axios|deno|bun/.test(u)) return 'node'
  if (/mozilla/.test(u)) return 'browser'
  return 'other'
}

/** Directory crawlers, uptime monitors and research probes that only handshake with MCP servers (from their User-Agents) */
const BOT_UA = /bot|crawl|spider|probe|indexer|monitor|status|liveness|survey|research|scanner|mcpbeat|mcpwatch|mcptry|mcpgw|talaria|measure-mcp|alalanet|ai-pulse|everymcp|agentrank|verifymcp|proofbench|moonglade|mcp-ficha|aiworkforce|enerlio|coda-agent/i
export const isBotUa = (ua = '') => BOT_UA.test(ua)

/** Stable, non-reversible id per caller (IP + User-Agent, salted with the GA secret). GA counts users by it */
export function callerId(ip: string, ua: string, salt = process.env.GA_API_SECRET ?? '') {
  return `api.${createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 16)}`
}

/** Our MCP tools. Probes call made-up tool names to test auth, so only these count as data reads */
const TOOLS = new Set(['get_arbitrage', 'predict_open', 'get_convergence_history', 'get_news', 'preview_pair_order'])
/** Probes that test auth with made-up tool names (e.g. verifymcp sends __verifymcp_auth_probe_…) */
export const isProbeCall = (mcp?: string | null) => !!mcp && /__\w*probe|server\/discover/.test(mcp)

/** True when the call actually reads data: a REST /v1 read, or an MCP tools/call of one of our tools (x-mcp-call holds tool names) */
export function isDataCall(path: string, status: number, mcp?: string | null) {
  if (status >= 400) return false
  if (path.startsWith('/api/v1/')) return true
  return !!mcp && mcp.split(',').some((m) => TOOLS.has(m))
}

export function sendApiCall(p: { path: string; status: number; ua?: string; mcp?: string | null; ip?: string }) {
  const secret = process.env.GA_API_SECRET
  if (!secret) return
  const ua = p.ua ?? ''
  const id = callerId(p.ip ?? '', ua)
  // caller_id (GA custom dimension) lets the report split new vs returning callers by day
  // is_bot / ua_head (GA custom dimensions) let reports drop crawlers by name; ua_head is the first 40 chars of the User-Agent
  const params = { api_path: p.path, api_status: p.status, caller: callerKind(ua), caller_id: id.slice(4), is_bot: isBotUa(ua) || isProbeCall(p.mcp) ? 'true' : 'false', ua_head: ua.slice(0, 40) || undefined, mcp_call: p.mcp ?? undefined, engagement_time_msec: 1 }
  // api_call = every outside call. Split by meaning: api_data_call = a real tool / REST read, api_check = handshakes, probes and errors
  const events = [{ name: 'api_call', params }, { name: isDataCall(p.path, p.status, p.mcp) ? 'api_data_call' : 'api_check', params }]
  const body = { client_id: id, non_personalized_ads: true, events }
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${secret}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {})
}
