import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'colyseus';
import { Client, type Room } from '@colyseus/sdk';
import { GameRoom } from '../src/rooms/GameRoom.js';
import type { DeckDef, HandCard, ServerMessage } from '@bombcat/shared';

const PORT = 3567;
const URL = `ws://localhost:${PORT}`;

let server: Server;

function client(): Client {
  return new Client(URL);
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** MapSchema 客户端代理不能用 Object.keys 枚举，统一用 forEach 计数 */
function playerCount(state: any): number {
  let n = 0;
  state?.players?.forEach?.(() => {
    n++;
  });
  return n;
}

interface Player {
  room: Room<any>;
  name: string;
  hand: HandCard[];
  errors: string[];
}

async function join(name: string, code?: string): Promise<Player> {
  const c = client();
  const room = code
    ? await c.joinById(code, { mode: 'guest', name })
    : await c.create('game', { mode: 'guest', name });
  const p: Player = { room, name, hand: [], errors: [] };
  room.onMessage('hand', (msg: ServerMessage & { cards: HandCard[] }) => {
    if (msg.action === 'hand') p.hand = msg.cards;
  });
  room.onMessage('error', (msg: ServerMessage) => {
    if (msg.action === 'error') p.errors.push(msg.message);
  });
  // 自动处理拆解提示：放回牌堆顶
  room.onMessage('promptDefuse', () => {
    room.send('act', { action: 'defusePosition', position: 0 });
  });
  return p;
}

function act(p: Player, message: any): void {
  p.room.send('act', message);
}

async function waitFor(predicate: () => boolean, timeoutMs = 6000, hint = ''): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`等待超时：${hint || predicate.toString()}`);
    }
    await wait(80);
  }
}

const NO_NOPE_DECK: DeckDef = {
  id: 'test-no-nope',
  name: '无否认测试卡组',
  customCards: [],
  counts: {
    attack: 4,
    skip: 4,
    favor: 4,
    shuffle: 4,
    peek: 5,
    'plain-melon': 4,
    'plain-potato': 4,
  },
};

beforeAll(async () => {
  server = new Server({});
  server.define('game', GameRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('GameRoom 集成', () => {
  it('创建房间、房间码加入、开始游戏、同步手牌', async () => {
    const host = await join('房主');
    await waitFor(() => host.room.state?.phase === 'lobby', 3000, 'lobby 状态');

    const code = host.room.state.roomCode as string;
    expect(code).toMatch(/^[A-Z2-9]{4}$/);

    const guest = await join('客人', code);
    await waitFor(() => playerCount(host.room.state) === 2, 4000, '两位玩家');

    // 房主设置一个无否认的卡组（出牌立即结算，测试不用等 8 秒窗口）
    act(host, { action: 'setDeck', deck: NO_NOPE_DECK });
    await waitFor(() => host.room.state.deckName === '无否认测试卡组', 3000, '卡组生效');

    act(host, { action: 'startGame' });
    await waitFor(() => host.room.state.phase === 'playing', 4000, '游戏开始');
    await waitFor(() => host.hand.length === 7, 4000, '房主手牌 7 张');
    await waitFor(() => guest.hand.length === 7, 4000, '客人手牌 7 张');

    // 公开状态只含 handCount，不含手牌内容（防作弊）
    host.room.state.players.forEach((ps: any) => {
      expect(ps.handCount).toBe(7);
      expect(ps.hand).toBeUndefined();
    });

    // 确认谁是先手
    const firstId = host.room.state.turnOrder[host.room.state.turnIndex] as string;
    const first = firstId === host.room.sessionId ? host : guest;
    const other = firstId === host.room.sessionId ? guest : host;

    // 先手打出一张牌（找一张可出的：有 effects 的或用组合）
    const playable = first.hand.find((c) =>
      c.def.effects.length > 0 && c.def.effects[0]!.type !== 'targetedAttack',
    );
    expect(playable).toBeTruthy();
    let handBefore = first.hand.length;
    const targetNeeded = playable!.def.effects.some(
      (e) =>
        e.type === 'stealRandom' ||
        e.type === 'stealNamed' ||
        e.type === 'peekHand' ||
        e.type === 'swapHand',
    );
    act(first, {
      action: 'playCard',
      instanceId: playable!.instanceId,
      targetSessionId: targetNeeded ? other.room.sessionId : undefined,
    });
    await waitFor(() => first.hand.length === handBefore - 1, 4000, '出牌后手牌减少');
    await waitFor(() => (host.room.state.discardCount as number) >= 1, 4000, '弃牌堆出现');

    // 非当前玩家摸牌 → 非法（出牌可能已切换回合，重新判定当前玩家）
    const curId2 = host.room.state.turnOrder[host.room.state.turnIndex] as string;
    const notCurrent = curId2 === host.room.sessionId ? guest : host;
    handBefore = notCurrent.hand.length;
    act(notCurrent, { action: 'draw' });
    await waitFor(() => notCurrent.errors.length > 0, 4000, '非当前回合报错');
    expect(notCurrent.errors[0]).toContain('还没轮到你');
    expect(notCurrent.hand).toHaveLength(handBefore);

    // 双方一路摸牌推进对局（promptDefuse 已自动应答）
    const who = () => {
      const id = host.room.state.turnOrder[host.room.state.turnIndex] as string;
      return id === host.room.sessionId ? host : guest;
    };
    for (let i = 0; i < 40 && host.room.state.phase === 'playing'; i++) {
      if (host.room.state.subPhase === 'awaiting-defuse') {
        await wait(120);
        continue;
      }
      act(who(), { action: 'draw' });
      await wait(150);
    }
    await waitFor(
      () => host.room.state.phase === 'finished',
      8000,
      '2 人局必然分出胜负',
    );
    const winnerId = host.room.state.winnerSessionId as string;
    expect([host.room.sessionId, guest.room.sessionId]).toContain(winnerId);

    // 两名玩家都还活着或游戏结束：只要服务器没崩即通过
    expect(host.room.state.phase === 'playing' || host.room.state.phase === 'finished').toBe(true);
  }, 30000);
});
