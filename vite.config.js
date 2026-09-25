import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        launcher: resolve(__dirname, 'index.html'),
        verity: resolve(__dirname, 'verity/index.html'),
        verity2: resolve(__dirname, 'verity-ii/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
