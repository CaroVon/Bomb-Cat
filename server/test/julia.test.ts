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
const card = (cardId: string) => ({ iid: `t-${cardId}-${++seq}`, cardId });

/** 塞一张牌进手并打出，结算否认窗口 */
function play(e: GameEngine, name: string, cardId: string, extra: Record<string, unknown> = {}): EngineEvent[] {
  const c = card(cardId);
  P(e, name).hand.push(c);
  const ev = e.playCard(`s:${name}`, { instanceId: c.iid, ...extra });
  if (e.subPhase === 'awaiting-nope') e.resolveNopes();
  return ev;
}

function ready(seed: number, players?: string[], chars: Record<string, string> = { A: 'julia', B: 'none', C: 'none' }) {
  const e = setup(seed, players);
  start(e, chars);
  stripDanger(e);
  stripNopes(e);
  return e;
}

const invest = (e: GameEngine, by: string, ids: string[]) =>
  e.useSkill(`s:${by}`, { skillId: 'julia-invest', investInstanceIds: ids });
const cashout = (e: GameEngine, by: string) => e.useSkill(`s:${by}`, { skillId: 'julia-cashout' });

/** 给 Julia 一手已知的牌并建仓前 n 张（猫牌） */
function openPosition(e: GameEngine, n: number): string[] {
  const a = P(e, 'A');
  const stake = Array.from({ length: n }, () => card('plain-melon'));
  a.hand.push(...stake);
  const ev = invest(e, 'A', stake.map((c) => c.iid));
  expect(invalid(ev)).toBeUndefined();
  return stake.map((c) => c.iid);
}

describe('Julia 姐', () => {
  it('建仓：牌离开手牌进投资组合，私发组合内容，进入冷却；持仓牌不会被偷', () => {
    const e = ready(601);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.hand = [card('skip')];
    const stake = [card('plain-melon'), card('attack')];
    a.hand.push(...stake);
    const ev = invest(e, 'A', stake.map((c) => c.iid));
    expect(invalid(ev)).toBeUndefined();
    expect(a.portfolio.map((c) => c.iid)).toEqual(stake.map((c) => c.iid));
    expect(a.hand.map((c) => c.cardId)).toEqual(['skip']);
    expect(a.portfolioTurns).toBe(2);
    expect(a.market).toBe(0);
    expect(a.skillCooldowns['julia-invest']).toBe(3);
    const msg = ev.find((x) => x.type === 'private' && (x as any).message.action === 'portfolio') as any;
    expect(msg.sessionId).toBe('s:A');
    expect(msg.message.cards.map((c: any) => c.id)).toEqual(['plain-melon', 'attack']);

    e.drawCard('s:A');
    advanceTo(e, 'B');
    a.hand = [];
    play(e, 'B', 'favor', { targetSessionId: 's:A' });
    expect(a.portfolio.length).toBe(2);
    expect(P(e, 'B').hand.some((c) => stake.some((s) => s.iid === c.iid))).toBe(false);
  });

  it('大盘：持仓期间功能牌 +1、猫牌每张 −1、否认 −1；没人持仓时不计', () => {
    const e = ready(602);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    play(e, 'A', 'shuffle');
    expect(a.market).toBe(0); // 还没持仓
    openPosition(e, 1);
    e.drawCard('s:A');
    advanceTo(e, 'B');
    play(e, 'B', 'shuffle');
    expect(a.market).toBe(1);
    // 对子（每张 −1）
    const b = P(e, 'B');
    const pair = [card('plain-potato'), card('plain-potato')];
    b.hand.push(...pair);
    e.playCard('s:B', { instanceId: pair[0]!.iid, comboInstanceIds: [pair[1]!.iid], targetSessionId: 's:C' });
    if (e.subPhase === 'awaiting-nope') e.resolveNopes();
    expect(a.market).toBe(-1);
    // 功能牌 +1，被否认 −1
    const nope = card('nope');
    P(e, 'C').hand.push(nope);
    const sh = card('shuffle');
    b.hand.push(sh);
    e.playCard('s:B', { instanceId: sh.iid });
    expect(e.subPhase).toBe('awaiting-nope');
    expect(a.market).toBe(0);
    expect(invalid(e.playCard('s:C', { instanceId: nope.iid, asNope: true }))).toBeUndefined();
    e.resolveNopes();
    expect(a.market).toBe(-1);
  });

  /** 建仓后推进到交割前一刻（C 的回合），返回交割前 A 的手牌数 */
  function toSettlement(e: GameEngine, market: number): number {
    const a = P(e, 'A');
    e.drawCard('s:A');
    advanceTo(e, 'A');
    expect(a.portfolioTurns).toBe(1);
    e.drawCard('s:A');
    advanceTo(e, 'C');
    a.market = market;
    return a.hand.length;
  }

  it('交割：牛市（≥ +2）拿回本金 + 从弃牌堆随机拿同样张数的非爆炸牌', () => {
    const e = ready(603);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    openPosition(e, 2);
    const h = toSettlement(e, 3);
    e.discard = [card('exploding'), card('skip'), card('attack'), card('peek')];
    e.drawCard('s:C');
    expect(e.current()?.sessionId).toBe('s:A');
    expect(a.hand.length).toBe(h + 4);
    expect(a.portfolio.length).toBe(0);
    expect(a.market).toBe(0);
    expect(e.discard.length).toBe(2);
    expect(e.discard.some((c) => c.cardId === 'exploding')).toBe(true);
    expect(a.hand.some((c) => c.cardId === 'exploding')).toBe(false);
    expect(e.logLines.some((l) => l.includes('牛市') && l.includes('3'))).toBe(true);
  });

  it('交割：牛市但弃牌堆不够时能拿多少拿多少', () => {
    const e = ready(604);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    openPosition(e, 3);
    const h = toSettlement(e, 2);
    e.discard = [card('skip')];
    e.drawCard('s:C');
    expect(a.hand.length).toBe(h + 4);
    expect(e.discard.length).toBe(0);
  });

  it('交割：震荡（−1 ~ +1）原样拿回', () => {
    const e = ready(605);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const ids = openPosition(e, 2);
    const h = toSettlement(e, 1);
    const d = e.discard.length;
    e.drawCard('s:C');
    expect(a.hand.length).toBe(h + 2);
    expect(ids.every((id) => a.hand.some((c) => c.iid === id))).toBe(true);
    expect(e.discard.length).toBe(d);
    expect(e.logLines.some((l) => l.includes('震荡'))).toBe(true);
  });

  it('交割：熊市（≤ −2）随机亏掉一半（向上取整），封锁不影响自动交割', () => {
    const e = ready(606);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    openPosition(e, 3);
    const h = toSettlement(e, -2);
    a.lockedBy = 's:B';
    const d = e.discard.length;
    e.drawCard('s:C');
    expect(a.hand.length).toBe(h + 1);
    expect(e.discard.length).toBe(d + 2);
    expect(a.portfolio.length).toBe(0);
    const msg = e.logLines.find((l) => l.includes('熊市'));
    expect(msg).toContain('-2');
  });

  it('平仓：随机扣 1 张手续费，其余拿回；没持仓不能平仓', () => {
    const e = ready(607);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    expect(invalid(cashout(e, 'A'))).toBeDefined();
    openPosition(e, 3);
    const h = a.hand.length;
    const d = e.discard.length;
    const ev = cashout(e, 'A');
    expect(invalid(ev)).toBeUndefined();
    expect(a.hand.length).toBe(h + 2);
    expect(e.discard.length).toBe(d + 1);
    expect(a.portfolio.length).toBe(0);
    const msg = ev.find((x) => x.type === 'private' && (x as any).message.action === 'portfolio') as any;
    expect(msg.message.cards).toEqual([]);
  });

  it('建仓限制：不能投爆炸猫/果奔猫，张数 1~3，同时只能一笔持仓，冷却 3 回合', () => {
    const e = ready(608);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const boom = card('exploding');
    const streak = card('streaking');
    a.hand.push(boom, streak);
    expect(invalid(invest(e, 'A', [boom.iid]))).toBeDefined();
    expect(invalid(invest(e, 'A', [streak.iid]))).toBeDefined();
    expect(invalid(invest(e, 'A', []))).toBeDefined();
    const four = Array.from({ length: 4 }, () => card('plain-melon'));
    a.hand.push(...four);
    expect(invalid(invest(e, 'A', four.map((c) => c.iid)))).toBeDefined();
    expect(a.portfolio.length).toBe(0);

    openPosition(e, 1);
    a.skillCooldowns['julia-invest'] = 0;
    const extra = card('plain-melon');
    a.hand.push(extra);
    expect(invalid(invest(e, 'A', [extra.iid]))?.message).toContain('持仓');
    // 平仓后仍在冷却
    a.skillCooldowns['julia-invest'] = 3;
    cashout(e, 'A');
    expect(invalid(invest(e, 'A', [extra.iid]))?.message).toContain('冷却');
  });

  it('Julia 出局：投资组合进弃牌堆', () => {
    const e = ready(609);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const ids = openPosition(e, 2);
    a.hand = a.hand.filter((c) => c.cardId !== 'defuse' && c.cardId !== 'streaking');
    e.deck.push(card('exploding'));
    e.drawCard('s:A');
    expect(a.alive).toBe(false);
    expect(a.portfolio.length).toBe(0);
    expect(ids.every((id) => e.discard.some((c) => c.iid === id))).toBe(true);
  });

  it('被屠夫封锁时不能平仓', () => {
    const e = ready(610);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    openPosition(e, 2);
    a.lockedBy = 's:B';
    expect(invalid(cashout(e, 'A'))?.message).toContain('封锁');
    expect(a.portfolio.length).toBe(2);
  });

  it('AI：Julia 机器人整局对弈到结束，且会建仓', () => {
    let invests = 0;
    for (const seed of [611, 612, 613, 614]) {
      const e = setup(seed, ['A', 'B', 'C', 'D']);
      start(e, { A: 'julia', B: 'phantom-thief', C: 'none', D: 'oracle' });
      for (let i = 0; i < 6000 && e.phase === 'playing'; i++) {
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
        else if (d.kind === 'juliaSkill') {
          ev = e.useSkill(sid, { skillId: d.skillId, investInstanceIds: d.investInstanceIds });
          if (invalid(ev)) throw new Error('Julia 决策非法: ' + invalid(ev)!.message);
          if (d.skillId === 'julia-invest') invests++;
        } else if (d.kind === 'play') {
          ev = e.playCard(sid, d);
          if (invalid(ev)) e.drawCard(sid);
        } else throw new Error('意外决策 ' + d.kind);
      }
      expect(e.phase).toBe('finished');
    }
    expect(invests).toBeGreaterThan(0);
  });
});
