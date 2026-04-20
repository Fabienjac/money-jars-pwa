import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localAnalyzeFilePlugin } from './vite/local-analyze-file-plugin';

export default defineConfig({
  // analyzeFile en local sans :8888 (voir vite/local-analyze-file-plugin.ts)
  plugins: [localAnalyzeFilePlugin(), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://script.google.com/macros/s/AKfycbw9yQB0as3h8ClMllDr_SE6R-EIF_vyowgLASdvO3uodWcgNAtgifYz8FRNyFxL85Nr/exec',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // analyzeFile est géré par localAnalyzeFilePlugin (sans Netlify sur :8888).
      '/.netlify/functions': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
    },
  },
});
