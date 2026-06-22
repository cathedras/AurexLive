import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env files before using process.env so USE_HTTPS from .env.dev takes effect
  const env = loadEnv(mode, process.cwd(), '')
  const useHttps = env.USE_HTTPS !== '0'

  return {
    plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
    server: {
      host: '0.0.0.0',
      https: useHttps ? true : false,
      proxy: {
        '/v1': {
          target: useHttps ? 'https://localhost:3000' : 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        },
        '/ws': {
          target: useHttps ? 'https://localhost:3000' : 'http://localhost:3000',
          ws: true,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
