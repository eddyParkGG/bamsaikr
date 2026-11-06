// Server-side usage events to GA4 (Measurement Protocol), so API and MCP use shows up next to web visits.
// Sends nothing unless GA_API_SECRET is set. No IP or request body leaves the server.
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

/** Stable, non-identifying client id per caller type + User-Agent (GA needs one to count callers) */
function clientId(ua: string) {
  let h = 2166136261
  for (let i = 0; i < ua.length; i++) h = Math.imul(h ^ ua.charCodeAt(i), 16777619)
  return `api.${(h >>> 0).toString(36)}`
}

export function sendApiCall(p: { path: string; status: number; ua?: string; mcp?: string | null }) {
  const secret = process.env.GA_API_SECRET
  if (!secret) return
  const ua = p.ua ?? ''
  const body = {
    client_id: clientId(ua),
    non_personalized_ads: true,
    events: [{ name: 'api_call', params: { api_path: p.path, api_status: p.status, caller: callerKind(ua), mcp_call: p.mcp ?? undefined, engagement_time_msec: 1 } }],
  }
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${secret}`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {})
}
