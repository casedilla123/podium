import { defineConfig } from 'vite';

// Relative base so the build works from a GitHub Pages project subpath.
export default defineConfig({
  base: './',
  // three.js alone is ~600 kB; one chunk is fine for a static app.
  build: { chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'] },
});
