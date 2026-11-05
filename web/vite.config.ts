import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      // The API only accepts browser requests from the live site, and browsers
      // send Origin on every POST, so local runs present that origin.
      '/api': {
        target: 'http://127.0.0.1:3000',
        headers: { Origin: 'https://trivia.benlamb.net' },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});
