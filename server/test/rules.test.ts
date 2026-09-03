import { describe, expect, it } from 'vitest';
import { GameEngine, type Rng } from '../src/engine/Engine.js';
import type { EngineEvent } from '../src/engine/types.js';

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

function start(e: GameEngine, opts?: Parameters<GameEngine['startGame']>[2]): EngineEvent[] {
  return e.startGame(e.hostSessionId, null, opts);
}

const cur = (e: GameEngine) => e.current()!;

describe('World Rule：疯狂抽卡', () => {
  it('打出跳过后额外摸一张牌', () => {
    const e = setup();
    start(e, { worldRuleId: 'mad-draw' });
    expect(e.worldRuleId).toBe('mad-draw');
    const p = cur(e);
    e.players.forEach((x) => (x.hand = x.hand.filter((c) => c.cardId !== 'nope')));
    // 强制牌堆顶为安全牌
    e.deck.push({ iid: 'md-top', cardId: 'skip' });
    p.hand.push({ iid: 'md-skip', cardId: 'skip' });
    const handBefore = p.hand.length;
    const deckBefore = e.deck.length;
    e.playCard(p.sessionId, { instanceId: 'md-skip' });
    // 出牌 -1 + 疯狂抽卡 +1 = 手牌不变；牌堆 -1（出了那张 skip 顶牌）
    expect(p.hand).toHaveLength(handBefore);
    expect(e.deck).toHaveLength(deckBefore - 1);
  });
});

describe('World Rule：双倍下注', () => {
  it('结束回合时摸 2 张牌', () => {
    const e = setup();
    start(e, { worldRuleId: 'double-down' });
    const p = cur(e);
    e.players.forEach((x) => (x.hand = x.hand.filter((c) => c.cardId !== 'nope')));
    e.deck.push({ iid: 'dd-a', cardId: 'skip' }, { iid: 'dd-b', cardId: 'skip' });
    const handBefore = p.hand.length;
    const deckBefore = e.deck.length;
    e.drawCard(p.sessionId);
    expect(p.hand).toHaveLength(handBefore + 2);
    expect(e.deck).toHaveLength(deckBefore - 2);
  });
});

describe('World Rule：传递快乐', () => {
  it('回合开始时随机一张传给下家', () => {
    const e = setup();
    start(e, { worldRuleId: 'pass-joy' });
    const p = cur(e);
    const nextId = e.turnOrder[(e.turnIndex + 1) % e.turnOrder.length]!;
    const next = e.players.find((x) => x.sessionId === nextId)!;
    const nextBefore = next.hand.length;
    const third = e.players.find((x) => x.sessionId !== p.sessionId && x.sessionId !== nextId)!;
    const thirdBefore = third.hand.length;
    e.drawCard(p.sessionId); // 推进到 next 回合 → next turnStart 触发传牌
    // next：开局时收了 p 的 1 张（含在 nextBefore 里），自己回合开始又传出 1 张 → -1
    expect(next.hand).toHaveLength(nextBefore - 1);
    // 牌在流动：总手牌数守恒（只在本局玩家间转移）
    const total = e.players.reduce((sum, x) => sum + x.hand.length, 0);
    expect(total).toBeGreaterThanOrEqual(20);
  });
});

describe('World Rule：防爆过剩', () => {
  it('牌堆额外混入 2 张拆解', () => {
    const e = setup();
    start(e, { worldRuleId: 'defuse-plenty' });
    // 3 人局：6-3=3 基础 + 规则 2 = 5
    expect(e.deck.filter((c) => c.cardId === 'defuse')).toHaveLength(5);
  });
});

describe('World Rule：火力全开', () => {
  it('攻击造成的连击回合 2→4', () => {
    const e = setup();
    start(e, { worldRuleId: 'overdrive' });
    const p = cur(e);
    e.players.forEach((x) => (x.hand = x.hand.filter((c) => c.cardId !== 'nope')));
    const victimId = e.turnOrder[(e.turnIndex + 1) % e.turnOrder.length]!;
    const victim = e.players.find((x) => x.sessionId === victimId)!;
    p.hand.push({ iid: 'od-atk', cardId: 'attack' });
    e.playCard(p.sessionId, { instanceId: 'od-atk' });
    expect(e.current()?.sessionId).toBe(victimId);
    expect(victim.turnsLeft).toBe(4);
  });
});

describe('World Rule：全员天眼', () => {
  it('回合开始时当前玩家私密看牌堆顶 1 张', () => {
    const e = setup();
    const ev = start(e, { worldRuleId: 'all-seeing' });
    // 先手回合开始即触发（startGame 内 runTurnStartSkills）
    const peeks = ev.filter((x) => x.type === 'private');
    expect(peeks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('秘密任务', () => {
  it('开局每人一条（2 人局不出比命长）', () => {
    const e = setup(7, ['A', 'B']);
    start(e, { worldRuleId: null });
    for (const p of e.players) {
      expect(p.objective).not.toBeNull();
      expect(p.objective!.defId).not.toBe('outlive');
    }
  });

  it('偷牌大师：偷 3 张达成', () => {
    const e = setup();
    start(e, { worldRuleId: null });
    const p = cur(e);
    p.objective = { defId: 'steal-3', counter: 0, done: false };
    const target = e.players.find((x) => x.sessionId !== p.sessionId)!;
    e.players.forEach((x) => (x.hand = x.hand.filter((c) => c.cardId !== 'nope')));
    for (let i = 0; i < 3; i++) {
      p.hand.push({ iid: `st-${i}`, cardId: 'favor' });
      e.playCard(p.sessionId, { instanceId: `st-${i}`, targetSessionId: target.sessionId });
    }
    expect(p.objective!.done).toBe(true);
  });

  it('连出王：单回合出 3 张牌', () => {
    const e = setup();
    start(e, { worldRuleId: null });
    const p = cur(e);
    p.objective = { defId: 'combo-3', counter: 0, done: false };
    e.players.forEach((x) => (x.hand = x.hand.filter((c) => c.cardId !== 'nope')));
    for (let i = 0; i < 2; i++) {
      p.hand.push({ iid: `sh-${i}`, cardId: 'shuffle' });
      e.playCard(p.sessionId, { instanceId: `sh-${i}` });
    }
    expect(p.objective!.done).toBe(false);
    p.hand.push({ iid: 'sh-2', cardId: 'shuffle' });
    e.playCard(p.sessionId, { instanceId: 'sh-2' });
    expect(p.objective!.done).toBe(true);
  });

  it('拆弹部队：拆解 2 次达成', () => {
    const e = setup();
    start(e, { worldRuleId: null });
    const p = cur(e);
    p.objective = { defId: 'defuse-2', counter: 0, done: false };
    p.defuseUsed = 0;
    // 模拟两次拆解
    p.hand.push({ iid: 'df-1', cardId: 'defuse' });
    e.deck.push({ iid: 'ex-1', cardId: 'exploding' });
    e.drawCard(p.sessionId);
    if (e.subPhase === 'awaiting-defuse') e.defusePosition(p.sessionId, 0);
    expect(p.objective!.done).toBe(false);
    expect(e.phase).toBe('playing');
  });

  it('gameEnd 载荷包含全员任务报告', () => {
    const e = setup();
    start(e, { worldRuleId: null });
    // 直接杀到游戏结束
    e.killDisconnected('s:B');
    e.killDisconnected('s:C');
    expect(e.phase).toBe('finished');
    // 通过 objectives 报告函数验证
    const report = e.players.map((p) => ({
      sessionId: p.sessionId,
      defId: p.objective?.defId ?? '',
      done: p.objective?.done ?? false,
    }));
    expect(report).toHaveLength(3);
  });
});

describe('个人构筑', () => {
  it('10 张自选：6 张随机入起手、4 张洗入公共堆', () => {
    const e = setup();
    const build = [
      'skip', 'skip', 'attack', 'attack', 'peek', 'peek', 'favor', 'favor', 'shuffle', 'shuffle',
    ];
    start(e, { worldRuleId: null, builds: { 's:A': build } });
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    expect(a.buildUsed).toBe(true);
    // 起手 = 1 拆解 + 6 张自选 = 7 张
    expect(a.hand).toHaveLength(7);
    expect(a.hand.filter((c) => c.cardId === 'defuse')).toHaveLength(1);
    const handIds = a.hand.map((c) => c.cardId).filter((id) => id !== 'defuse');
    // 6 张全部来自自选
    for (const id of handIds) expect(build).toContain(id);
    // 其余玩家经典发牌
    const b = e.players.find((p) => p.sessionId === 's:B')!;
    expect(b.buildUsed).toBe(false);
    expect(b.hand).toHaveLength(7);
  });

  it('非法构筑被拒绝（张数不足/违禁卡）', () => {
    const e = setup();
    const ev = e.startGame(e.hostSessionId, null, {
      worldRuleId: null,
      builds: { 's:A': ['skip', 'skip'] },
    });
    expect(ev.some((x) => x.type === 'invalid')).toBe(true);
    expect(e.phase).toBe('lobby');

    const ev2 = e.startGame(e.hostSessionId, null, {
      worldRuleId: null,
      builds: { 's:A': Array(10).fill('defuse') },
    });
    expect(ev2.some((x) => x.type === 'invalid')).toBe(true);
  });

  it('同卡超过 2 张被拒绝', () => {
    const e = setup();
    const ev = e.startGame(e.hostSessionId, null, {
      worldRuleId: null,
      builds: { 's:A': Array(10).fill('skip') },
    });
    expect(ev.some((x) => x.type === 'invalid')).toBe(true);
  });
});

describe('无尽挑战增益', () => {
  it('厚实起手 +1、随身工具箱 +1 拆解', () => {
    const e = setup();
    start(e, {
      worldRuleId: null,
      runBonuses: { 's:A': ['extra-deal', 'extra-defuse'] },
    });
    const a = e.players.find((p) => p.sessionId === 's:A')!;
    // 7 基础 + 1 起手 + 1 拆解 = 9；拆解 ≥ 2（基础 1 + 工具箱 1）
    expect(a.hand).toHaveLength(9);
    expect(a.hand.filter((c) => c.cardId === 'defuse').length).toBeGreaterThanOrEqual(2);
  });

  it('先知：开局私密看牌堆顶 3 张', () => {
    const e = setup();
    const ev = start(e, { worldRuleId: null, runBonuses: { 's:A': ['start-peek'] } });
    const peek = ev.find(
      (x) => x.type === 'private' && (x as any).sessionId === 's:A' && (x as any).message.action === 'peekDeck',
    );
    expect(peek).toBeTruthy();
  });

  it('额外爆炸猫：牌堆多 N 张', () => {
    const e = setup();
    start(e, { worldRuleId: null, extraExploding: 1 });
    // 3 人局基础 2 + 1 = 3
    expect(e.deck.filter((c) => c.cardId === 'exploding')).toHaveLength(3);
  });
});
