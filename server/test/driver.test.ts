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

function ready(seed: number, players: string[] | undefined, chars: Record<string, string> = { A: 'driver', B: 'none', C: 'none' }) {
  const e = setup(seed, players);
  start(e, chars);
  stripDanger(e);
  stripNopes(e);
  return e;
}


const ride = (e: GameEngine, by: string, target: string) =>
  e.useSkill(`s:${by}`, { skillId: 'driver-ride', targetSessionId: `s:${target}` });
const lane = (e: GameEngine, by: string, target: string) =>
  e.useSkill(`s:${by}`, { skillId: 'driver-lane', targetSessionId: `s:${target}` });

/** 被邀请者同意：交出手里第一张牌 */
function accept(e: GameEngine, name: string): EngineEvent[] {
  const give = P(e, name).hand[0]!;
  return e.handleHelpRespond(`s:${name}`, { accept: true, giveInstanceId: give.iid });
}

describe('司机小贾', () => {
  it('上车：同意 → 车费转给小贾、进入冷却；乘客下一回合结束不摸牌', () => {
    const e = ready(401, undefined);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    const aHand = a.hand.length;
    const bHand = b.hand.length;
    expect(invalid(ride(e, 'A', 'B'))).toBeUndefined();
    expect(e.subPhase).toBe('awaiting-help');
    const accEv = accept(e, 'B');
    expect(invalid(accEv)).toBeUndefined();
    // 给小贾的结果消息标明是上车（客户端不能显示成秀英的「冰冻 -1」）
    const resolved = accEv.find(
      (x) => x.type === 'private' && (x as any).message?.action === 'helpResolved',
    ) as any;
    expect(resolved?.message?.kind).toBe('ride');
    expect(e.subPhase).toBe('awaiting-action');
    expect(a.hand.length).toBe(aHand + 1);
    expect(b.hand.length).toBe(bHand - 1);
    expect(b.freeRide).toBe(true);
    expect(a.fares).toBe(1);
    expect(a.skillCooldowns['driver-ride']).toBe(3);
    expect(invalid(ride(e, 'A', 'C'))?.message).toContain('冷却');

    e.drawCard('s:A');
    advanceTo(e, 'B');
    const before = b.hand.length;
    const deckBefore = e.deck.length;
    e.drawCard('s:B');
    expect(b.hand.length).toBe(before); // 到站不摸牌
    expect(e.deck.length).toBe(deckBefore);
    expect(b.freeRide).toBe(false);
    expect(e.logLines.some((l) => l.includes('安全到站'))).toBe(true);
  });

  it('上车：拒绝不进冷却，同一回合不能重复问同一人，可以换人', () => {
    const e = ready(402, undefined);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    ride(e, 'A', 'B');
    e.handleHelpRespond('s:B', { accept: false });
    expect(e.subPhase).toBe('awaiting-action');
    expect(a.skillCooldowns['driver-ride'] ?? 0).toBe(0);
    expect(P(e, 'B').freeRide).toBe(false);
    expect(invalid(ride(e, 'A', 'B'))?.message).toContain('已经邀请过');
    expect(invalid(ride(e, 'A', 'C'))).toBeUndefined();
  });

  it('上车：超时视为拒绝；同意但没选牌时邀请仍然挂起', () => {
    const e = ready(403, undefined);
    advanceTo(e, 'A');
    ride(e, 'A', 'B');
    expect(invalid(e.handleHelpRespond('s:B', { accept: true, giveInstanceId: 'nope' }))).toBeDefined();
    expect(e.subPhase).toBe('awaiting-help');
    e.autoRefuseHelp();
    expect(e.subPhase).toBe('awaiting-action');
    expect(P(e, 'B').freeRide).toBe(false);
  });

  it('上车：没手牌的人、冰冻的秀英不能被邀请', () => {
    const e = ready(404, undefined, { A: 'driver', B: 'xiuying', C: 'none' });
    advanceTo(e, 'A');
    expect(P(e, 'B').freezeLayers).toBeGreaterThan(0);
    expect(invalid(ride(e, 'A', 'B'))?.message).toContain('冰冻');
    P(e, 'C').hand = [];
    expect(invalid(ride(e, 'A', 'C'))?.message).toContain('没有手牌');
  });

  it('到站只抵一个回合：被攻击连续行动 2 回合时，第二回合照常摸牌', () => {
    const e = ready(405, undefined);
    advanceTo(e, 'A');
    ride(e, 'A', 'B');
    accept(e, 'B');
    // A 的下家是 B：直接攻击，让 B 连续行动 2 回合
    expect(e.nextAliveSessionId()).toBe('s:B');
    play(e, 'A', 'attack');
    const b = P(e, 'B');
    expect(e.current()?.sessionId).toBe('s:B');
    const h0 = b.hand.length;
    e.drawCard('s:B'); // 第一个回合：到站不摸
    expect(b.hand.length).toBe(h0);
    expect(e.current()?.sessionId).toBe('s:B');
    e.drawCard('s:B'); // 第二个回合：照常摸
    expect(b.hand.length).toBe(h0 + 1);
  });

  it('变道：选中的玩家与下家交换座次，攻击打到新的下家，turnIndex 不乱', () => {
    const e = ready(406, ['A', 'B', 'C', 'D'], { A: 'driver', B: 'none', C: 'none', D: 'none' });
    advanceTo(e, 'A');
    const next0 = e.nextAliveSessionId();
    // 让 A 自己和下家互换：A 后面的人变成原下家的下家
    expect(invalid(lane(e, 'A', 'A'))).toBeUndefined();
    expect(e.current()?.sessionId).toBe('s:A');
    const next1 = e.nextAliveSessionId();
    expect(next1).not.toBe(next0);
    expect(P(e, 'A').skillCooldowns['driver-lane']).toBe(4);
    // 公开换位事件：客户端据序号播放换位动画
    expect(e.laneSwap?.seq).toBe(1);
    expect(e.laneSwap?.a).toBe('s:A');
    expect(e.laneSwap?.b).toBe(next0);
    expect(invalid(lane(e, 'A', 'B'))?.message).toContain('冷却');
    play(e, 'A', 'attack');
    expect(e.current()?.sessionId).toBe(next1);
  });

  it('变道：存活玩家少于 3 人时不能用', () => {
    const e = ready(407, ['A', 'B'], { A: 'driver', B: 'none' });
    advanceTo(e, 'A');
    expect(invalid(lane(e, 'A', 'B'))?.message).toContain('3 名');
  });

  it('老司机：满 3 份车费得 1 层撞大运；摸到爆炸猫 / 爆炸苹果自动放回且不消耗拆解', () => {
    const e = ready(408, undefined);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.fares = 2;
    ride(e, 'A', 'B');
    accept(e, 'B');
    expect(a.fares).toBe(3);
    expect(a.luckCharges).toBe(1);
    a.luckCharges = 2;
    const defuses = a.hand.filter((c) => c.cardId === 'defuse').length;
    e.deck.push({ iid: 't-boom', cardId: 'exploding' });
    e.drawCard('s:A');
    expect(a.alive).toBe(true);
    expect(e.subPhase).not.toBe('awaiting-defuse');
    expect(a.hand.filter((c) => c.cardId === 'defuse').length).toBe(defuses);
    expect(e.deck.some((c) => c.iid === 't-boom')).toBe(true);
    expect(a.luckCharges).toBe(1);
    advanceTo(e, 'A');
    e.deck.push({ iid: 't-apple', cardId: 'exploding-apple' });
    e.drawCard('s:A');
    expect(a.alive).toBe(true);
    expect(a.luckCharges).toBe(0);
    expect(e.deck.some((c) => c.iid === 't-apple')).toBe(true);
  });

  it('老司机：没有层数时照常爆炸（走拆解流程）', () => {
    const e = ready(409, undefined);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    if (!a.hand.some((c) => c.cardId === 'defuse')) a.hand.push({ iid: 't-def', cardId: 'defuse' });
    e.deck.push({ iid: 't-boom2', cardId: 'exploding' });
    e.drawCard('s:A');
    expect(e.subPhase).toBe('awaiting-defuse');
  });

  it('AI：小贾机器人整局对弈到结束，且会发出上车邀请', () => {
    let rides = 0;
    for (const seed of [501, 502, 503, 504]) {
      const e = setup(seed, ['A', 'B', 'C', 'D']);
      start(e, { A: 'driver', B: 'phantom-thief', C: 'none', D: 'oracle' });
      for (let i = 0; i < 6000 && e.phase === 'playing'; i++) {
        if (e.subPhase === 'awaiting-nope') {
          e.resolveNopes();
          continue;
        }
        if (e.subPhase === 'awaiting-help') {
          // 模拟被邀请者：一半同意（交第一张牌），一半拒绝
          const pending = e.pendingHelpInfo!;
          const helper = e.players.find((p) => p.sessionId === pending.helperSessionId)!;
          if (i % 2 === 0 && helper.hand.length > 0) {
            e.handleHelpRespond(helper.sessionId, { accept: true, giveInstanceId: helper.hand[0]!.iid });
          } else {
            e.handleHelpRespond(helper.sessionId, { accept: false });
          }
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
        else if (d.kind === 'driverSkill') {
          ev = e.useSkill(sid, { skillId: d.skillId, targetSessionId: d.targetSessionId });
          if (invalid(ev)) throw new Error('小贾决策非法: ' + invalid(ev)!.message);
          if (d.skillId === 'driver-ride') rides++;
        } else if (d.kind === 'play') {
          ev = e.playCard(sid, d);
          if (invalid(ev)) e.drawCard(sid);
        } else throw new Error('意外决策 ' + d.kind);
      }
      expect(e.phase).toBe('finished');
    }
    expect(rides).toBeGreaterThan(0);
  });
});
