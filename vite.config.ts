import { defineConfig } from 'vite';

// Relative base so the build works both locally and under the GitHub Pages
// project path (https://protocsillag.github.io/bottle-up-at-lonyay/).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
