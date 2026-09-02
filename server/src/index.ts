import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

const gameServer = new Server({});

gameServer.define('game', GameRoom);

await gameServer.listen(PORT);
console.log(`[bombcat] 游戏服务器已启动: ws://localhost:${PORT}`);
console.log(
  `[bombcat] 身份验证: ${
    process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWKS_URL
      ? 'Supabase JWT 已启用'
      : '游客模式（未配置 SUPABASE_JWT_SECRET / SUPABASE_JWKS_URL）'
  }`,
);
