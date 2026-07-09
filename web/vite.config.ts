import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: proxy /api to the Express server so the browser talks same-origin. In a
// future desktop shell the client reads VITE_API_URL instead (see App.tsx).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
})
