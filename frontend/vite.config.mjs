import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: frontendRoot,
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',
    https: true,
    proxy: {
      '/v1': {
        target: 'https://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'https://localhost:3000',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
})
