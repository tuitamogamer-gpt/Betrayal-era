import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    proxy: { '/api/tabletop': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        tabletop: fileURLToPath(new URL('./tabletop.html', import.meta.url)),
      },
    },
  },
});
