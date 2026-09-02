import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'colyseus';
import { Client, type Room } from '@colyseus/sdk';
import type { ServerMessage } from '@bombcat/shared';

const PORT = 3575;
const URL = `ws://localhost:${PORT}`;

let server: Server;
let GameRoomClass: any;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  ({ GameRoom: GameRoomClass } = await import('../src/rooms/GameRoom.js'));
  // 快速模式：bot 思考 ~20ms、回合计时兜底 100ms
  GameRoomClass.turnTimeoutMs = 100;
  GameRoomClass.botDelayMs = 20;
  server = new Server({});
  server.define('game', GameRoomClass);
  await server.listen(PORT);
});

afterAll(async () => {
  GameRoomClass.turnTimeoutMs = 45_000;
  GameRoomClass.botDelayMs = 1500;
  await server.gracefullyShutdown(false);
});

describe('AI 机器人对战', () => {
  it('人机练习：1 真人 + 2 bot 自动开局并打满整局到 gameEnd', async () => {
    const c = new Client(URL);
    const room = await c.create('game', { mode: 'guest', name: '训练员', bots: 2 });

    const ended = new Promise<ServerMessage & { action: 'gameEnd' }>((resolve) => {
      room.onMessage('gameEnd', (msg) => resolve(msg));
    });

    // {bots:2} → 500ms 后补 bot 自动开局
    await wait(1000);
    expect(room.state.phase).toBe('playing');
    // 3 名玩家（1 真人 + 2 bot）
    let count = 0;
    room.state.players.forEach(() => count++);
    expect(count).toBe(3);

    const end = await Promise.race([ended, wait(100_000).then(() => null)]);
    expect(end).not.toBeNull();
    expect(room.state.phase).toBe('finished');
    expect((end as any).ranking).toHaveLength(3);
    room.leave(true);
  }, 110_000);

  it('纯 bot 对战也能完整跑完（无真人干预）', async () => {
    // 用 1 个"挂机真人"开 bot 局但从不行动：bot 之间互相打，
    // 真人回合由 100ms 超时自动摸牌兜底，验证防挂机闭环
    const c = new Client(URL);
    const room = await c.create('game', { mode: 'guest', name: '挂机侠', bots: 2 });

    const ended = new Promise<void>((resolve) => {
      room.onMessage('gameEnd', () => resolve());
    });
    const end = await Promise.race([ended, wait(100_000).then(() => 'timeout')]);
    room.leave(true);
    expect(end).not.toBe('timeout');
    expect(room.state.phase).toBe('finished');
  }, 110_000);
});
