import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
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
