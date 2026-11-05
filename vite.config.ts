import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Toss issues one key, and a new token revokes the previous one: by default use the deployed API so the
    // live server keeps its token. `npm run dev:local` points here to a local API instead (API_TARGET)
    proxy: { '/api': { target: process.env.API_TARGET ?? 'https://bamsai-api.fly.dev', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // The chart library is only needed in pro mode, so split it into its own chunk
        manualChunks: (id) => (id.includes('lightweight-charts') ? 'chart' : undefined),
      },
    },
  },
})
