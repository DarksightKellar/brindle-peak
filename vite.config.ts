import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, host: '127.0.0.1', strictPort: true },
  preview: { port: 4180, host: '127.0.0.1', strictPort: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
});
