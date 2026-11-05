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
        // 차트 라이브러리는 프로 모드에서만 필요해서 따로 청크
        manualChunks: (id) => (id.includes('lightweight-charts') ? 'chart' : undefined),
      },
    },
  },
})
