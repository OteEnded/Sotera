import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0
    allowedHosts: true, // accept any Host header (e.g. a server domain)
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    // Fastify serves this build from Backend/public/dist (single origin).
    outDir: '../Backend/public/dist',
    emptyOutDir: true,
  },
})
