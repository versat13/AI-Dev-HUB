import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './Extension/ScrapAI/src'),
    },
  },
  test: {
    include: ['Extension/ScrapAI/src/**/*.test.ts'],
  },
});
