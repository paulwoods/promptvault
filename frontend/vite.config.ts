import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // SPA calls same-origin /api/*; the dev server proxies to the backend.
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'node',
  },
})
