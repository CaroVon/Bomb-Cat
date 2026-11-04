import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'colyseus';
import { Client, type Room } from '@colyseus/sdk';
import { GameRoom } from '../src/rooms/GameRoom.js';
import { formatMsg, type DeckDef, type HandCard, type ServerMessage } from '@bombcat/shared';

const PORT = 3571;
const URL = `ws://localhost:${PORT}`;

let server: Server;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Player {
  room: Room<any>;
  hand: HandCard[];
  logs: string[];
}

async function join(name: string, code?: string): Promise<Player> {
  const c = new Client(URL);
  const room = code
    ? await c.joinById(code, { mode: 'guest', name })
    : await c.create('game', { mode: 'guest', name });
  const p: Player = { room, hand: [], logs: [] };
  room.onMessage('hand', (msg: ServerMessage & { cards: HandCard[] }) => {
    if (msg.action === 'hand') p.hand = msg.cards;
  });
  room.onMessage('promptDefuse', () => {
    room.send('act', { action: 'defusePosition', position: 0 });
  });
  return p;
}

const DECK: DeckDef = {
  id: 'log-test',
  name: '日志测试卡组（无否认）',
  customCards: [],
  counts: { attack: 4, skip: 4, favor: 4, shuffle: 4, peek: 5, 'plain-melon': 4, 'plain-potato': 4 },
};

function readLogs(p: Player): string[] {
  const log = p.room.state?.log;
  // state.log 同步的是编码后的 LocMsg，按中文渲染后再断言
  const raw: string[] = log ? (log.toArray?.() ?? log) : [];
  return raw.map((l) => formatMsg('zh', l));
}

beforeAll(async () => {
  server = new Server({});
  server.define('game', GameRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('日志同步', () => {
  it('出牌日志应同步到所有客户端', async () => {
    const host = await join('房主');
    await wait(300);
    const code = host.room.state.roomCode as string;
    const guest = await join('客人', code);
    await wait(400);

    host.room.send('act', { action: 'setDeck', deck: DECK });
    await wait(400);
    host.room.send('act', { action: 'startGame' });
    await wait(800);

    const firstId = host.room.state.turnOrder[host.room.state.turnIndex] as string;
    const first = firstId === host.room.sessionId ? host : guest;

    // 打一张不需要目标的牌（skip/attack/shuffle/peek）
    const noTargetTypes = ['skip', 'attack', 'shuffle', 'peek'];
    const playable = first.hand.find(
      (c) => c.def.effects.length > 0 && noTargetTypes.includes(c.def.effects[0]!.type),
    );
    expect(playable).toBeTruthy();
    first.room.send('act', { action: 'playCard', instanceId: playable!.instanceId });
    await wait(600);

    const hostLogs = readLogs(host);
    const guestLogs = readLogs(guest);
    console.log('房主日志:', JSON.stringify(hostLogs, null, 0));
    console.log('客人日志:', JSON.stringify(guestLogs, null, 0));
    expect(hostLogs.some((l) => l.includes('打出'))).toBe(true);
    expect(guestLogs.some((l) => l.includes('打出'))).toBe(true);
    expect(hostLogs.length).toBe(guestLogs.length);
  }, 15000);
});
