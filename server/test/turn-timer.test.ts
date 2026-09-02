import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'colyseus';
import { Client, type Room } from '@colyseus/sdk';
import type { DeckDef, HandCard, ServerMessage } from '@bombcat/shared';

const PORT = 3573;
const URL = `ws://localhost:${PORT}`;

let server: Server;
let GameRoomClass: any;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function join(name: string, code?: string): Promise<{ room: Room<any>; hand: HandCard[] }> {
  const c = new Client(URL);
  const room = code
    ? await c.joinById(code, { mode: 'guest', name })
    : await c.create('game', { mode: 'guest', name });
  const hand: HandCard[] = [];
  room.onMessage('hand', (msg: ServerMessage & { cards: HandCard[] }) => {
    if (msg.action === 'hand') hand.splice(0, hand.length, ...msg.cards);
  });
  room.onMessage('promptDefuse', () => {
    room.send('act', { action: 'defusePosition', position: 0 });
  });
  return { room, hand };
}

const DECK: DeckDef = {
  id: 'timer-test',
  name: '计时测试（无否认）',
  customCards: [],
  counts: { attack: 4, skip: 4, favor: 4, shuffle: 4, peek: 5, 'plain-melon': 4, 'plain-potato': 4 },
};

beforeAll(async () => {
  ({ GameRoom: GameRoomClass } = await import('../src/rooms/GameRoom.js'));
  GameRoomClass.turnTimeoutMs = 400; // 测试：400ms 超时
  server = new Server({});
  server.define('game', GameRoomClass);
  await server.listen(PORT);
});

afterAll(async () => {
  GameRoomClass.turnTimeoutMs = 45_000;
  await server.gracefullyShutdown(false);
});

describe('回合计时器', () => {
  it('超时后服务器自动替当前玩家摸牌推进回合（无需任何客户端操作）', async () => {
    const host = await join('房主');
    await wait(300);
    const code = host.room.state.roomCode as string;
    const guest = await join('客人', code);
    await wait(400);

    host.room.send('act', { action: 'setDeck', deck: DECK });
    await wait(300);
    host.room.send('act', { action: 'startGame' });
    await wait(500);

    expect(host.room.state.phase).toBe('playing');
    expect(host.room.state.turnEndsAt).toBeGreaterThan(0);
    const deckBefore = host.room.state.deckCount as number;

    // 什么都不做，等 3 个超时周期（400ms × 3 + 冗余）
    await wait(1600);

    const deckAfter = host.room.state.deckCount as number;
    // 超时自动行动已发生：牌堆净减少（摸到爆炸猫拆解放回时单回合净变化为 0，
    // 但多个周期内必然夹杂普通摸牌 → 总量下降）
    expect(deckAfter).toBeLessThan(deckBefore);

    // 游戏仍在正常状态（没崩、没锁死）
    expect(['playing', 'finished']).toContain(host.room.state.phase);
  }, 15000);

  it('表情白名单外的内容被拒绝，白名单内广播', async () => {
    const host = await join('表情房主');
    await wait(300);
    const code = host.room.state.roomCode as string;
    const guest = await join('表情客人', code);
    await wait(300);

    const received: string[] = [];
    guest.room.onMessage('emote', (msg: { emoji: string }) => received.push(msg.emoji));

    host.room.send('emote', { emoji: '😈' }); // 不在白名单
    host.room.send('emote', { emoji: '😂' }); // 白名单内
    await wait(400);

    expect(received).toEqual(['😂']);
  }, 10000);
});
