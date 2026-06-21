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
    environment: 'jsdom',
    // A concrete origin so jsdom enables localStorage.
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: ['./src/test/setup.ts'],
  },
})
