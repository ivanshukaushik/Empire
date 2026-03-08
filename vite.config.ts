import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages deployment at /Empire/
  base: process.env.VITE_BASE_URL ?? '/',
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
