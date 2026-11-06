import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // review/ holds the critics' screenshots and the director's pages, written while a critic plays:
  // watched, they reloaded the game under critic round 59 every few minutes.
  server: { port: 5180, host: '127.0.0.1', strictPort: true, watch: { ignored: ['**/review/**'] } },
  preview: { port: 4180, host: '127.0.0.1', strictPort: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
});
