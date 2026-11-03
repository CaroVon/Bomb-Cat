import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

/**
 * 单服务部署（Railway 等）：同一端口同时提供前端静态文件 + Colyseus WebSocket。
 * client/dist 存在时才挂载（本地开发前端走 vite :5173，不受影响）。
 */
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, '../../client/dist');
const serveClient = existsSync(resolve(clientDist, 'index.html'));

const gameServer = new Server({
  express: (app) => {
    app.get('/healthz', (_req, res) => {
      res.json({ ok: true });
    });
    if (!serveClient) return;
    // 带 hash 的静态资源长缓存；index.html / config.json 不缓存，保证更新后立即生效
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders: (res, path) => {
          if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(path)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (path.endsWith('.html') || path.endsWith('config.json')) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      }),
    );
    // SPA 回退：非 Colyseus 路由（/matchmake）且非文件请求 → index.html
    app.get(/^(?!\/matchmake)(?!.*\.[a-z0-9]+$).*/i, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  },
});

gameServer.define('game', GameRoom);

await gameServer.listen(PORT);
console.log(`[bombcat] 游戏服务器已启动: ws://localhost:${PORT}`);
console.log(`[bombcat] 前端静态文件: ${serveClient ? clientDist : '未构建（仅提供游戏服务）'}`);
console.log(
  `[bombcat] 身份验证: ${
    process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWKS_URL
      ? 'Supabase JWT 已启用'
      : '游客模式（未配置 SUPABASE_JWT_SECRET / SUPABASE_JWKS_URL）'
  }`,
);
