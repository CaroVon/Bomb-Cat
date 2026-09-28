import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 允许隧道域名（trycloudflare.com 等）访问 dev server
    allowedHosts: true,
  },
  preview: {
    port: 5173,
    host: true,
    // 生产预览同样允许隧道域名（npm run preview / scripts/cloudflare-dev.ps1 -Mode prod）
    allowedHosts: true,
  },
});
