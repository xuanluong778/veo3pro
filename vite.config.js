import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /** Listen on all interfaces (0.0.0.0) so http://127.0.0.1:5173 works on Windows, not only [::1]. */
    host: true,
    port: 5173,
    strictPort: false,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        cookieDomainRewrite: '',
        cookiePathRewrite: '/',
      },
    },
  },
});
