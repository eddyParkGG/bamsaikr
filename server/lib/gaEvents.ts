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

/** Stable, non-reversible id per caller (IP + User-Agent, salted with the GA secret). GA counts users by it */
export function callerId(ip: string, ua: string, salt = process.env.GA_API_SECRET ?? '') {
  return `api.${createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 16)}`
}

const HANDSHAKE = new Set(['initialize', 'ping'])
/** True when the call actually reads data: a REST /v1 read, or an MCP tools/call (the x-mcp-call header holds tool names) */
export function isDataCall(path: string, status: number, mcp?: string | null) {
  if (status >= 400) return false
  if (path.startsWith('/api/v1/')) return true
  return !!mcp && mcp.split(',').some((m) => m && !m.includes('/') && !HANDSHAKE.has(m))
}

export function sendApiCall(p: { path: string; status: number; ua?: string; mcp?: string | null; ip?: string }) {
  const secret = process.env.GA_API_SECRET
  if (!secret) return
  const ua = p.ua ?? ''
  const params = { api_path: p.path, api_status: p.status, caller: callerKind(ua), mcp_call: p.mcp ?? undefined, engagement_time_msec: 1 }
  // api_data_call: only calls that read data (not handshakes, discovery probes or errors) — users of this event = data callers
  const events = [{ name: 'api_call', params }, ...(isDataCall(p.path, p.status, p.mcp) ? [{ name: 'api_data_call', params }] : [])]
  const body = { client_id: callerId(p.ip ?? '', ua), non_personalized_ads: true, events }
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${secret}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {})
}
