import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine, type Rng } from '../src/engine/Engine.js';
import type { EngineEvent } from '../src/engine/types.js';

/** 可播种的伪随机（mulberry32），保证测试确定性 */
function seededRng(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(seed = 42, players = ['A', 'B', 'C']): GameEngine {
  const e = new GameEngine(seededRng(seed));
  players.forEach((p) => e.addPlayer(`s:${p}`, '', p));
  return e;
}

function start(e: GameEngine, characterIds: Record<string, string> = {}): EngineEvent[] {
  for (const [name, ch] of Object.entries(characterIds)) {
    e.setCharacter(`s:${name}`, ch);
  }
  return e.startGame(e.hostSessionId, null);
}

const hand = (e: GameEngine, name: string) => e.handOf(`s:${name}`);
const find = (e: GameEngine, name: string, cardId: string) =>
  hand(e, name).find((c) => c.cardId === cardId);

function forceTop(e: GameEngine, cardId: string) {
  e.deck.push({ iid: `forced-${cardId}-${Math.random()}`, cardId });
}

describe('开局', () => {
  it('发牌与牌堆构成正确', () => {
    const e = setup();
    const events = start(e);
    expect(e.phase).toBe('playing');
    // 每人 7 张（1 拆解 + 6）
    for (const p of e.players) {
      expect(p.hand).toHaveLength(7);
      expect(p.hand.filter((c) => c.cardId === 'defuse')).toHaveLength(1);
    }
    // 3 人：爆炸猫 2 张 + 剩余拆解 3 张
    expect(e.deck.filter((c) => c.cardId === 'exploding')).toHaveLength(2);
    expect(e.deck.filter((c) => c.cardId === 'defuse')).toHaveLength(3);
    expect(events.some((x) => x.type === 'gameEnd')).toBe(false);
  });

  it('幸运绒球开局多 1 张跳过', () => {
    const e = setup();
    start(e, { A: 'lucky-cat' });
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    expect(a.hand).toHaveLength(8);
    expect(a.hand.filter((c) => c.cardId === 'skip').length).toBeGreaterThanOrEqual(1);
  });

  it('预言家回合开始时收到私密看牌', () => {
    const e = setup();
    const events = start(e, { A: 'oracle', B: 'oracle', C: 'oracle' });
    const peeks = events.filter((x) => x.type === 'private');
    expect(peeks.length).toBe(1); // 只有先手看到
    const first = e.current()!;
    expect((peeks[0] as any).sessionId).toBe(first.sessionId);
  });
});

describe('基础出牌', () => {
  it('没轮到不能出牌；plain 不能单张打', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    const other = e.players.find((p) => p.sessionId !== cur.sessionId)!;
    const ev1 = e.playCard(other.sessionId, { instanceId: other.hand[0]!.iid });
    expect(ev1).toContainEqual(expect.objectContaining({ type: 'invalid' }));

    const plain = find(e, cur.name, 'plain-melon') ?? (cur.hand.push(hand(e, cur.name).length ? { iid: 'x-plain-1', cardId: 'plain-melon' } : { iid: '', cardId: '' }), cur.hand.find((c) => c.cardId === 'plain-melon')!);
    const ev2 = e.playCard(cur.sessionId, { instanceId: plain.iid });
    expect(ev2).toContainEqual(expect.objectContaining({ type: 'invalid', message: expect.stringContaining('组合') }));
  });

  it('跳过：结束回合不摸牌', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const deckBefore = e.deck.length;
    // 确保手里有 skip
    cur.hand.push({ iid: 'test-skip-1', cardId: 'skip' });
    const ev = e.playCard(cur.sessionId, { instanceId: 'test-skip-1' });
    // 没人持有否认 → 立即结算
    expect(e.subPhase).toBe('awaiting-action');
    expect(e.deck).toHaveLength(deckBefore);
    expect(e.current()?.sessionId).not.toBe(cur.sessionId);
    expect(e.discard.some((c) => c.cardId === 'skip')).toBe(true);
    expect(ev.some((x) => x.type === 'nopeWindowClosed')).toBe(true);
  });

  it('洗牌/预知未来正常结算', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    cur.hand.push({ iid: 'test-shuffle-1', cardId: 'shuffle' });
    e.playCard(cur.sessionId, { instanceId: 'test-shuffle-1' });
    expect(e.current()?.sessionId).toBe(cur.sessionId); // 洗牌不结束回合
    expect(e.discard.some((c) => c.iid === 'test-shuffle-1')).toBe(true);
    expect(cur.hand.some((c) => c.iid === 'test-shuffle-1')).toBe(false);

    cur.hand.push({ iid: 'test-peek-1', cardId: 'peek' });
    const ev = e.playCard(cur.sessionId, { instanceId: 'test-peek-1' });
    const peek = ev.find((x) => x.type === 'private') as any;
    expect(peek?.message.action).toBe('peekDeck');
    expect(peek.message.cards).toHaveLength(3);
  });

  it('求赠：从目标偷 1 张随机牌', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const target = e.players.find((p) => p.alive && p.sessionId !== cur.sessionId)!;
    const targetHand = target.hand.length;
    cur.hand.push({ iid: 'test-favor-1', cardId: 'favor' });
    e.playCard(cur.sessionId, {
      instanceId: 'test-favor-1',
      targetSessionId: target.sessionId,
    });
    expect(target.hand).toHaveLength(targetHand - 1);
    expect(cur.hand.length).toBeGreaterThan(0);
  });
});

describe('否认窗口', () => {
  it('无否认牌时窗口立即结算', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    // 移走所有人手中的否认
    e.players.forEach((p) => {
      p.hand = p.hand.filter((c) => c.cardId !== 'nope');
    });
    cur.hand.push({ iid: 'test-favor-2', cardId: 'favor' });
    const target = e.players.find((p) => p.alive && p.sessionId !== cur.sessionId)!;
    const ev = e.playCard(cur.sessionId, { instanceId: 'test-favor-2', targetSessionId: target.sessionId });
    expect(e.subPhase).toBe('awaiting-action');
    expect(ev.some((x) => x.type === 'nopeWindowClosed')).toBe(true);
  });

  it('一次否认使效果无效；两次（反否认）恢复', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    const other = e.players.find((p) => p.alive && p.sessionId !== cur.sessionId)!;
    const third = e.players.find((p) => p.alive && ![cur.sessionId, other.sessionId].includes(p.sessionId))!;

    cur.hand.push({ iid: 'test-favor-3', cardId: 'favor' });
    other.hand.push({ iid: 'test-nope-1', cardId: 'nope' });
    third.hand.push({ iid: 'test-nope-2', cardId: 'nope' });
    const target = other;
    const targetHand = target.hand.length; // 此后 other 会打出 1 张否认 + 被偷 1 张

    e.playCard(cur.sessionId, { instanceId: 'test-favor-3', targetSessionId: target.sessionId });
    expect(e.subPhase).toBe('awaiting-nope');

    // 不能否认自己的牌
    const evSelf = e.playNope(cur.sessionId, 'test-nope-1');
    expect(evSelf.some((x) => x.type === 'invalid')).toBe(true);

    // other 否认
    e.playNope(other.sessionId, 'test-nope-1');
    expect(e.pendingPlay!.nopedBy).toHaveLength(1);

    // 同一人不能连续否认
    const evAgain = e.playNope(other.sessionId, 'test-nope-2');
    expect(evAgain.some((x) => x.type === 'invalid')).toBe(true);

    // third 反否认 → 效果恢复
    e.playNope(third.sessionId, 'test-nope-2');
    e.resolveNopes();
    expect(target.hand).toHaveLength(targetHand - 2); // 1 张否认 + 1 张被偷
    expect(e.discard.filter((c) => c.cardId === 'nope')).toHaveLength(2);
  });

  it('回响法师：被否认的牌回手', () => {
    const e = setup();
    start(e, { A: 'echo-mage', B: 'none', C: 'none' });
    const cur = e.current()!;
    if (cur.sessionId !== 's:A') {
      // 轮到 A 再测
      while (e.current()!.sessionId !== 's:A') {
        e.drawCard(e.current()!.sessionId);
      }
    }
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    const other = e.players.find((p) => p.sessionId !== 's:A')!;
    a.hand.push({ iid: 'test-favor-4', cardId: 'favor' });
    other.hand.push({ iid: 'test-nope-3', cardId: 'nope' });
    e.playCard('s:A', { instanceId: 'test-favor-4', targetSessionId: other.sessionId });
    e.playNope(other.sessionId, 'test-nope-3');
    e.resolveNopes();
    expect(a.hand.some((c) => c.iid === 'test-favor-4')).toBe(true);
    expect(e.discard.some((c) => c.iid === 'test-favor-4')).toBe(false);
  });
});

describe('组合与爆炸', () => {
  it('对子偷随机、三张指名偷', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    const target = e.players.find((p) => p.alive && p.sessionId !== cur.sessionId)!;
    // 移走所有否认避免干扰
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    target.hand.push({ iid: 'victim-shuffle', cardId: 'shuffle' });

    cur.hand.push(
      { iid: 'p1', cardId: 'plain-melon' },
      { iid: 'p2', cardId: 'plain-melon' },
      { iid: 'p3', cardId: 'plain-melon' },
    );
    // 对子
    const evPair = e.playCard(cur.sessionId, { instanceId: 'p1', comboInstanceIds: ['p2'], targetSessionId: target.sessionId });
    expect(evPair.some((x) => x.type === 'invalid')).toBe(false);
    expect(e.discard.filter((c) => c.cardId === 'plain-melon')).toHaveLength(2);

    // 三张（指定偷 shuffle）
    cur.hand.push(
      { iid: 'q1', cardId: 'plain-potato' },
      { iid: 'q2', cardId: 'plain-potato' },
      { iid: 'q3', cardId: 'plain-potato' },
    );
    e.playCard(cur.sessionId, {
      instanceId: 'q1',
      comboInstanceIds: ['q2', 'q3'],
      targetSessionId: target.sessionId,
      wantCardId: 'shuffle',
    });
    expect(cur.hand.some((c) => c.iid === 'victim-shuffle')).toBe(true);
  });

  it('摸到爆炸猫有拆解：等待放回位置', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    forceTop(e, 'exploding');
    const ev = e.drawCard(cur.sessionId);
    expect(e.subPhase).toBe('awaiting-defuse');
    expect(cur.hand.some((c) => c.cardId === 'defuse')).toBe(false);
    expect(ev.some((x) => x.type === 'private')).toBe(true);

    const ev2 = e.defusePosition(cur.sessionId, 3);
    expect(e.subPhase).toBe('awaiting-action');
    expect(e.deck[e.deck.length - 4]?.cardId).toBe('exploding');
    expect(ev2.some((x) => x.type === 'turnAdvanced')).toBe(true);
  });

  it('摸到爆炸猫没拆解：阵亡，手牌洗回，最后一人获胜', () => {
    const e = setup();
    start(e);
    // 依次让玩家爆掉：先给 B、C 各 1 爆炸
    const kill = (name: string) => {
      const p = e.players.find((x) => x.name === name)!;
      p.hand = p.hand.filter((c) => c.cardId !== 'defuse');
      while (e.current()?.sessionId !== p.sessionId) {
        e.drawCard(e.current()!.sessionId);
        // 防止别人先摸到爆炸
        if (e.phase === 'finished') return;
        if (e.subPhase === 'awaiting-defuse') {
          e.defusePosition(e.pendingDefuse!.sessionId, 0);
        }
      }
      const handCount = p.hand.length;
      forceTop(e, 'exploding');
      e.drawCard(p.sessionId);
      expect(p.alive).toBe(false);
      expect(e.deck.length).toBeGreaterThanOrEqual(handCount); // 手牌进牌堆
    };
    kill('B');
    expect(e.phase).toBe('playing');
    kill('C');
    expect(e.phase).toBe('finished');
    expect(e.winnerSessionId).toBe('s:A');
  });
});

describe('攻击与连击', () => {
  it('攻击让下一位连续行动 2 回合', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    const next = e.players[(e.players.indexOf(cur) + e.direction + 3) % 3]!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    cur.hand.push({ iid: 'test-atk-1', cardId: 'attack' });
    e.playCard(cur.sessionId, { instanceId: 'test-atk-1' });
    expect(e.current()?.sessionId).toBe(next.sessionId);
    expect(next.turnsLeft).toBe(2);

    // next 结束一次回合后仍是他
    e.drawCard(next.sessionId);
    expect(e.current()?.sessionId).toBe(next.sessionId);
    expect(next.turnsLeft).toBe(1);
    e.drawCard(next.sessionId);
    expect(e.current()?.sessionId).not.toBe(next.sessionId);
  });

  it('精准攻击指定目标', () => {
    const e = setup();
    start(e);
    const cur = e.current()!;
    const target = e.players.find((p) => p.sessionId !== cur.sessionId)!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    cur.hand.push({ iid: 'test-tatk-1', cardId: 'targetedAttack' });
    e.playCard(cur.sessionId, { instanceId: 'test-tatk-1', targetSessionId: target.sessionId });
    expect(e.current()?.sessionId).toBe(target.sessionId);
    expect(target.turnsLeft).toBe(2);
  });
});

describe('主动技能', () => {
  it('怪盗基德：弃 2 偷指定牌', () => {
    const e = setup();
    start(e, { A: 'phantom-thief', B: 'none', C: 'none' });
    while (e.current()!.sessionId !== 's:A') {
      e.drawCard(e.current()!.sessionId);
      if (e.subPhase === 'awaiting-defuse') {
        e.defusePosition(e.pendingDefuse!.sessionId, 0);
      }
    }
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    const b = e.players.find((p) => p.sessionId === 's:B')!;
    const aPeekBefore = a.hand.filter((c) => c.cardId === 'peek').length;
    const bPeekBefore = b.hand.filter((c) => c.cardId === 'peek').length;
    a.hand.push(
      { iid: 'cost-1', cardId: 'skip' },
      { iid: 'cost-2', cardId: 'shuffle' },
    );
    const ev = e.useSkill('s:A', {
      skillId: 'thief-steal',
      costInstanceIds: ['cost-1', 'cost-2'],
      targetSessionId: 's:B',
      wantCardId: 'peek',
    });
    expect(ev.some((x) => x.type === 'invalid')).toBe(false);
    expect(a.hand.filter((c) => c.cardId === 'peek')).toHaveLength(aPeekBefore + 1);
    expect(b.hand.filter((c) => c.cardId === 'peek')).toHaveLength(bPeekBefore - 1);
    // 次数已耗尽
    const stolen = a.hand.find((c) => c.cardId === 'peek')!;
    const ev2 = e.useSkill('s:A', {
      skillId: 'thief-steal',
      costInstanceIds: [stolen.iid, 'cost-1'],
      targetSessionId: 's:B',
      wantCardId: 'skip',
    });
    expect(ev2.some((x) => x.type === 'invalid')).toBe(true);
  });

  it('炼金术士：弃 1 回收弃牌堆顶', () => {
    const e = setup();
    start(e, { A: 'alchemist', B: 'none', C: 'none' });
    while (e.current()!.sessionId !== 's:A') {
      e.drawCard(e.current()!.sessionId);
      if (e.subPhase === 'awaiting-defuse') {
        e.defusePosition(e.pendingDefuse!.sessionId, 0);
      }
    }
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    e.discard.push({ iid: 'disc-1', cardId: 'favor' });
    a.hand.push({ iid: 'cost-3', cardId: 'skip' });
    e.useSkill('s:A', { skillId: 'alch-recycle', costInstanceIds: ['cost-3'] });
    expect(a.hand.some((c) => c.iid === 'disc-1')).toBe(true);
    expect(e.discard[e.discard.length - 1]?.iid).toBe('cost-3');
  });

  it('铁壁骑士：第一张被偷无效', () => {
    const e = setup();
    start(e, { A: 'knight', B: 'none', C: 'none' });
    while (e.current()!.sessionId !== 's:B') {
      e.drawCard(e.current()!.sessionId);
      if (e.subPhase === 'awaiting-defuse') {
        e.defusePosition(e.pendingDefuse!.sessionId, 0);
      }
    }
    const b = e.players.find((p) => p.sessionId === 's:B')!;
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const aHand = a.hand.length;
    b.hand.push({ iid: 'test-favor-5', cardId: 'favor' });
    e.playCard('s:B', { instanceId: 'test-favor-5', targetSessionId: 's:A' });
    expect(a.hand).toHaveLength(aHand); // 没被偷走

    b.hand.push({ iid: 'test-favor-6', cardId: 'favor' });
    e.playCard('s:B', { instanceId: 'test-favor-6', targetSessionId: 's:A' });
    expect(a.hand).toHaveLength(aHand - 1); // 第二次正常偷
  });
});

describe('自定义卡组', () => {
  it('自定义卡组能开局且自定义卡可打出', () => {
    const e = setup();
    const deck = {
      id: 'custom-test',
      name: '测试卡组',
      customCards: [
        {
          id: 'custom:combo',
          name: '双效卡',
          kind: 'action' as const,
          emoji: '🃏',
          description: '洗牌并偷牌',
          effects: [
            { type: 'shuffle' as const },
            { type: 'stealRandom' as const },
          ],
        },
      ],
      counts: {
        attack: 4,
        skip: 4,
        favor: 4,
        shuffle: 4,
        peek: 5,
        nope: 5,
        'plain-melon': 4,
        'plain-potato': 4,
        'custom:combo': 3,
      },
    };
    const ev = e.startGame(e.hostSessionId, deck as any);
    expect(ev.some((x) => x.type === 'invalid')).toBe(false);

    const cur = e.current()!;
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    cur.hand.push({ iid: 'cc-1', cardId: 'custom:combo' });
    const target = e.players.find((p) => p.alive && p.sessionId !== cur.sessionId)!;
    const ev2 = e.playCard(cur.sessionId, {
      instanceId: 'cc-1',
      targetSessionId: target.sessionId,
    });
    expect(ev2.some((x) => x.type === 'invalid')).toBe(false);
    expect(e.cardMap.has('custom:combo')).toBe(true);
  });

  it('非法卡组被拒绝', () => {
    const e = setup();
    const ev = e.startGame(e.hostSessionId, {
      id: 'bad',
      name: '坏卡组',
      customCards: [],
      counts: { attack: 1 },
    } as any);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'invalid' }));
    expect(e.phase).toBe('lobby');
  });
});
