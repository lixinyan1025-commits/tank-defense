import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/tank-defense/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1300,
  },
  server: {
    watch: {
      ignored: ['**/artifacts/**'],
    },
  },
  test: {
    environment: 'node',
  },
});
