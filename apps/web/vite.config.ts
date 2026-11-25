import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Same origin in development: the browser talks to Vite, Vite forwards /api to the API.
    // This is what lets the SameSite=Strict refresh cookie work without CORS.
    proxy: { '/api': { target: apiTarget } },
  },
  preview: {
    proxy: { '/api': { target: apiTarget } },
  },
});
