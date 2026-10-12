import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    host: true,
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
});
