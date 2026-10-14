import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/ruang-replay-trading/',
  publicDir: 'public',
  plugins: [react()],
  define: { 'import.meta.env.VITE_HOSTING_TARGET': JSON.stringify('github-pages') },
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  build: { outDir: 'pages-dist', emptyOutDir: true, rolldownOptions: { input: 'pages/index.html' } },
});
