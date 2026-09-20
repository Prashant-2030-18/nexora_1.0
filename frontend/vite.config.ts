import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // If VITE_API_BASE_URL is set (e.g. pointing to Render), skip the local proxy.
  const useProxy = !env.VITE_API_BASE_URL

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: useProxy
        ? {
            '/api': {
              target: 'http://127.0.0.1:8000',
              changeOrigin: true,
            },
            '/uploads': {
              target: 'http://127.0.0.1:8000',
              changeOrigin: true,
            },
            '/health': {
              target: 'http://127.0.0.1:8000',
              changeOrigin: true,
            },
          }
        : {},
    },
  }
})
