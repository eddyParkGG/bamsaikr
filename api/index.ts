// Vercel Function 진입점. vercel.json 에서 /api/* 를 여기로 보냄
import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

export default handle(app)
