// API server (shared by local dev and Fly.io production). Locally, vite proxies /api here
import { serve } from '@hono/node-server'
import { existsSync, readFileSync } from 'node:fs'

// Minimal .env.local loader (in production, Fly secrets arrive as env vars)
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const { app } = await import('./app.js')
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (i) => console.log(`api → http://localhost:${i.port}/api`))
