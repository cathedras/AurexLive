import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
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
