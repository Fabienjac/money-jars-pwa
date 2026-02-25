import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://script.google.com/macros/s/AKfycbw9yQB0as3h8ClMllDr_SE6R-EIF_vyowgLASdvO3uodWcgNAtgifYz8FRNyFxL85Nr/exec',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // En local avec Vite seul : rediriger les fonctions Netlify vers Netlify Dev (port 8888)
      // Lancer d'abord "npm run dev:netlify" dans un autre terminal pour que l'import de fichiers fonctionne.
      '/.netlify/functions': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
    },
  },
});
