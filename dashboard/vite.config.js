import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    // shared/*.json (road network, catalog, params) lives outside the dashboard folder
    fs: { allow: ['..'] },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { maplibre: ['maplibre-gl'], charts: ['recharts'] } },
    },
  },
})
