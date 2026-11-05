// 로컬 개발용 API 서버 (vite 가 /api 를 여기로 프록시)
import { serve } from '@hono/node-server'
import { readFileSync, existsSync } from 'node:fs'

// .env.local 간이 로더
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const { app } = await import('./app.js')
serve({ fetch: app.fetch, port: 8787 }, (i) => console.log(`api → http://localhost:${i.port}/api`))
