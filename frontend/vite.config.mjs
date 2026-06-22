import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(frontendRoot, '..')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env files before using process.env so USE_HTTPS from .env.dev takes effect
  const env = loadEnv(mode, projectRoot, '')
  const useHttps = env.USE_HTTPS !== '0'

  return {
    root: frontendRoot,
    envDir: projectRoot,
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
