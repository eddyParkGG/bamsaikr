// API 서버 (로컬 개발과 Fly.io 운영 공용). 로컬에선 vite 가 /api 를 여기로 프록시
import { serve } from '@hono/node-server'
import { existsSync, readFileSync } from 'node:fs'

// .env.local 간이 로더 (운영에선 Fly secrets 가 환경변수로 들어옴)
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const { app } = await import('./app.js')
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (i) => console.log(`api → http://localhost:${i.port}/api`))
