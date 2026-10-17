import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig({
  plugins: [preact()],
  publicDir: 'Extension/ScrapAI/src/public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './Extension/ScrapAI/src'),
      'wxt/browser': path.resolve(__dirname, './Extension/ScrapAI/src/lib/browser-shim.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
  },
});
