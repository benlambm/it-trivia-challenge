import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});
