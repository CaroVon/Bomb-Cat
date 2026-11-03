import { describe, expect, it } from 'vitest';
import { GameEngine, type Rng } from '../src/engine/Engine.js';
import type { EngineEvent } from '../src/engine/types.js';
import { decide } from '../src/ai/BotBrain.js';

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
  return e.startGame(e.hostSessionId, null, { worldRuleId: null });
}

const P = (e: GameEngine, name: string) => e.players.find((p) => p.sessionId === `s:${name}`)!;

/** 推进回合直到指定玩家行动（顺路处理挂起的拆解/重排/否认窗口） */
function advanceTo(e: GameEngine, name: string): void {
  for (let i = 0; i < 24 && e.current()?.sessionId !== `s:${name}`; i++) {
    if (e.subPhase === 'awaiting-nope') {
      e.resolveNopes();
      continue;
    }
    if (e.subPhase === 'awaiting-defuse') {
      e.defusePosition(e.pendingDefuse!.sessionId, 0);
      continue;
    }
    if (e.subPhase === 'awaiting-alter') {
      e.alterFutureOrder(e.pendingAlter!.sessionId, e.pendingAlter!.cards.map((_, i) => i));
      continue;
    }
    if (e.phase !== 'playing') throw new Error('phase=' + e.phase);
    e.drawCard(e.current()!.sessionId);
  }
  if (e.current()?.sessionId !== `s:${name}`) throw new Error('无法推进到 ' + name);
}

/** 移除牌堆中的危险牌，保证摸牌安全 */
function stripDanger(e: GameEngine): void {
  e.deck = e.deck.filter(
    (c) => c.cardId !== 'exploding' && c.cardId !== 'tear' && c.cardId !== 'exploding-apple',
  );
}

/** 去掉所有人手里的否认，避免否认窗口干扰 */
function stripNopes(e: GameEngine): void {
  for (const p of e.players) p.hand = p.hand.filter((c) => c.cardId !== 'nope');
}

const invalid = (evs: EngineEvent[]) =>
  evs.find((x) => x.type === 'invalid') as { message: string } | undefined;

let seq = 0;
/** 塞一张牌进手并打出，结算否认窗口 */
function play(e: GameEngine, name: string, cardId: string, extra: Record<string, unknown> = {}): EngineEvent[] {
  const iid = `t-${cardId}-${++seq}`;
  P(e, name).hand.push({ iid, cardId });
  const ev = e.playCard(`s:${name}`, { instanceId: iid, ...extra });
  if (e.subPhase === 'awaiting-nope') e.resolveNopes();
  return ev;
}

function ready(seed: number, chars: Record<string, string> = { A: 'butcher', B: 'none', C: 'none' }) {
  const e = setup(seed);
  start(e, chars);
  stripDanger(e);
  stripNopes(e);
  return e;
}

const cleave = (e: GameEngine, by: string, target: string) =>
  e.useSkill(`s:${by}`, { skillId: 'butcher-skill', targetSessionId: `s:${target}` });

describe('屠夫', () => {
  it('被动：他人手牌被拿走 → 每张 +1 层；出牌者自己不计；上限 5', () => {
    const e = ready(201);
    advanceTo(e, 'B');
    const a = P(e, 'A');
    expect(a.boneStacks).toBe(0);
    play(e, 'B', 'favor', { targetSessionId: 's:C' });
    expect(a.boneStacks).toBe(1);
    a.boneStacks = 5;
    play(e, 'B', 'favor', { targetSessionId: 's:C' });
    expect(a.boneStacks).toBe(5);
  });

  it('被动：屠夫自己拿走的牌不计层', () => {
    const e = ready(202);
    advanceTo(e, 'A');
    play(e, 'A', 'favor', { targetSessionId: 's:B' });
    expect(P(e, 'A').boneStacks).toBe(0);
  });

  it('主动：层数不足无效；成功后扣 3 层、抽 1 张、封锁目标、对该目标冷却 5', () => {
    const e = ready(203);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    a.boneStacks = 2;
    expect(invalid(cleave(e, 'A', 'B'))?.message).toContain('层数不足');
    a.boneStacks = 5;
    const aHand = a.hand.length;
    const bHand = b.hand.length;
    expect(invalid(cleave(e, 'A', 'B'))).toBeUndefined();
    expect(a.boneStacks).toBe(2); // 剔骨抽牌本身不计层
    expect(a.hand.length).toBe(aHand + 1);
    expect(b.hand.length).toBe(bHand - 1);
    expect(b.lockedBy).toBe('s:A');
    expect(a.butcherTargetCd['s:B']).toBe(5);
    // 同一目标冷却中；换目标可用（自己无全局冷却）
    a.boneStacks = 5;
    expect(invalid(cleave(e, 'A', 'B'))?.message).toContain('冷却');
    expect(invalid(cleave(e, 'A', 'C'))).toBeUndefined();
    expect(P(e, 'C').lockedBy).toBe('s:A');
  });

  it('封锁：不能否认；下一回合不能出功能牌/猫对子/主动技；回合结束后解除', () => {
    const e = ready(204, { A: 'butcher', B: 'phantom-thief', C: 'none' });
    advanceTo(e, 'A');
    const b = P(e, 'B');
    P(e, 'A').boneStacks = 3;
    cleave(e, 'A', 'B');
    // A 出牌时 B 手握否认也不能否认（否认窗口也不会为 B 打开）
    b.hand.push({ iid: 't-nope-b', cardId: 'nope' });
    P(e, 'A').hand.push({ iid: 't-fav-a', cardId: 'favor' });
    e.playCard('s:A', { instanceId: 't-fav-a', targetSessionId: 's:C' });
    expect(e.subPhase).not.toBe('awaiting-nope');
    b.hand = b.hand.filter((c) => c.cardId !== 'nope');

    advanceTo(e, 'B');
    expect(b.lockedBy).toBe('s:A');
    b.hand.push({ iid: 't-skip-b', cardId: 'skip' });
    expect(invalid(e.playCard('s:B', { instanceId: 't-skip-b' }))?.message).toContain('封锁');
    b.hand.push({ iid: 't-m1', cardId: 'plain-melon' }, { iid: 't-m2', cardId: 'plain-melon' });
    expect(
      invalid(e.playCard('s:B', { instanceId: 't-m1', comboInstanceIds: ['t-m2'], targetSessionId: 's:C' }))
        ?.message,
    ).toContain('封锁');
    expect(invalid(e.useSkill('s:B', { skillId: 'thief-steal', targetSessionId: 's:C' }))?.message).toContain(
      '封锁',
    );
    // 摸牌照常；回合结束后解除
    e.drawCard('s:B');
    expect(b.lockedBy).toBe('');
  });

  it('封锁期间拆解照常可用', () => {
    const e = ready(205);
    advanceTo(e, 'A');
    P(e, 'A').boneStacks = 3;
    cleave(e, 'A', 'B');
    e.drawCard('s:A');
    advanceTo(e, 'B');
    const b = P(e, 'B');
    if (!b.hand.some((c) => c.cardId === 'defuse')) b.hand.push({ iid: 't-def', cardId: 'defuse' });
    e.deck.push({ iid: 't-boom', cardId: 'exploding' });
    e.drawCard('s:B');
    expect(e.subPhase).toBe('awaiting-defuse');
    e.defusePosition('s:B', 0);
    expect(b.alive).toBe(true);
  });

  it('压制：对被封锁者求赠偷 2 张；与乘法不叠加；对未封锁者不翻倍', () => {
    const e = ready(206);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    a.boneStacks = 3;
    cleave(e, 'A', 'B');
    const before = b.hand.length;
    play(e, 'A', 'favor', { targetSessionId: 's:B' });
    expect(b.hand.length).toBe(before - 2);
    a.mathMulNext = 1;
    const before2 = b.hand.length;
    play(e, 'A', 'favor', { targetSessionId: 's:B' });
    expect(b.hand.length).toBe(Math.max(0, before2 - 2));
    const c = P(e, 'C');
    const beforeC = c.hand.length;
    play(e, 'A', 'favor', { targetSessionId: 's:C' });
    expect(c.hand.length).toBe(beforeC - 1);
  });

  it('压制：下家被封锁时攻击 → 连续行动 4 回合', () => {
    const e = ready(207);
    advanceTo(e, 'A');
    const next = e.nextAliveSessionId();
    P(e, 'A').boneStacks = 3;
    e.useSkill('s:A', { skillId: 'butcher-skill', targetSessionId: next });
    play(e, 'A', 'attack');
    expect(e.current()?.sessionId).toBe(next);
    expect(e.current()!.turnsLeft).toBe(4);
  });

  it('冷却按屠夫自己的回合递减', () => {
    const e = ready(208);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.boneStacks = 3;
    cleave(e, 'A', 'B');
    e.drawCard('s:A');
    advanceTo(e, 'B');
    expect(a.butcherTargetCd['s:B']).toBe(5);
    advanceTo(e, 'A');
    expect(a.butcherTargetCd['s:B']).toBe(4);
  });

  it('冰冻的秀英免疫剔骨（层数与冷却照常消耗）', () => {
    const e = ready(209, { A: 'butcher', B: 'xiuying', C: 'none' });
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    expect(b.freezeLayers).toBeGreaterThan(0);
    const layers = b.freezeLayers;
    const hand = b.hand.length;
    a.boneStacks = 3;
    expect(invalid(cleave(e, 'A', 'B'))).toBeUndefined();
    expect(b.lockedBy).toBe('');
    expect(b.hand.length).toBe(hand);
    expect(b.freezeLayers).toBe(layers - 1);
    expect(a.boneStacks).toBe(0);
  });

  it('AI：屠夫机器人整局对弈到结束且会发动剔骨', () => {
    let totalCleaves = 0;
    for (const seed of [301, 302, 303, 304]) {
      const e = setup(seed, ['A', 'B', 'C', 'D']);
      start(e, { A: 'butcher', B: 'phantom-thief', C: 'none', D: 'oracle' });
      for (let i = 0; i < 5000 && e.phase === 'playing'; i++) {
        if (e.subPhase === 'awaiting-nope') {
          e.resolveNopes();
          continue;
        }
        const sid =
          e.subPhase === 'awaiting-defuse'
            ? e.pendingDefuse!.sessionId
            : e.subPhase === 'awaiting-alter'
              ? e.pendingAlter!.sessionId
              : e.current()!.sessionId;
        const d = decide(e, sid, null);
        if (!d) throw new Error('bot 无决策: ' + e.subPhase);
        let ev: EngineEvent[];
        if (d.kind === 'draw') ev = e.drawCard(sid);
        else if (d.kind === 'defuse') ev = e.defusePosition(sid, d.position);
        else if (d.kind === 'alter') ev = e.alterFutureOrder(sid, d.order);
        else if (d.kind === 'butcherCleave') {
          ev = e.useSkill(sid, { skillId: d.skillId, targetSessionId: d.targetSessionId });
          if (invalid(ev)) throw new Error('剔骨决策非法: ' + invalid(ev)!.message);
          totalCleaves++;
        } else if (d.kind === 'play') {
          ev = e.playCard(sid, d);
          if (invalid(ev)) e.drawCard(sid);
        } else throw new Error('意外决策 ' + d.kind);
      }
      expect(e.phase).toBe('finished');
    }
    expect(totalCleaves).toBeGreaterThan(0);
  });
});
