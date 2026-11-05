import { describe, expect, it } from 'vitest';
import { GameEngine, type Rng } from '../src/engine/Engine.js';
import type { EngineEvent } from '../src/engine/types.js';
import { decide } from '../src/ai/BotBrain.js';
import { CLASSIC_DECK, DREAM_CARD_IDS, validateDeck } from '@bombcat/shared';

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

function ready(seed: number, players?: string[], chars: Record<string, string> = { A: 'lazy_sheep', B: 'none', C: 'none' }) {
  const e = setup(seed, players);
  start(e, chars);
  stripDanger(e);
  stripNopes(e);
  return e;
}

const sleep = (e: GameEngine, by = 'A') => e.useSkill(`s:${by}`, { skillId: 'sheep-dream' });

/** A 数羊入梦，推进到 B 的回合 */
function asleepA(e: GameEngine): void {
  advanceTo(e, 'A');
  expect(invalid(sleep(e))).toBeUndefined();
  expect(P(e, 'A').asleep).toBe(true);
  advanceTo(e, 'B');
}

/** A 入梦后推进到醒来（awaiting-dream），可指定选项 */
function wakeA(e: GameEngine, options?: string[]): EngineEvent[] {
  asleepA(e);
  advanceTo(e, 'C');
  const ev = e.drawCard('s:C');
  expect(e.subPhase).toBe('awaiting-dream');
  if (options) (e as any).pendingDream.options = options;
  return ev;
}

const privates = (evs: EngineEvent[], action: string) =>
  evs.filter((x) => x.type === 'private' && (x as any).message.action === action) as any[];

describe('懒懒羊', () => {
  it('数羊：照常摸牌结束回合，然后入梦并进入冷却', () => {
    const e = ready(701);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const h = a.hand.length;
    const deck = e.deck.length;
    expect(invalid(sleep(e))).toBeUndefined();
    expect(a.hand.length).toBe(h + 1);
    expect(e.deck.length).toBe(deck - 1);
    expect(a.asleep).toBe(true);
    expect(e.current()?.sessionId).toBe('s:B');
    expect(a.skillCooldowns['sheep-dream']).toBe(3);
  });

  it('数羊时摸到爆炸猫且没拆解：出局，不会入睡', () => {
    const e = ready(702);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.hand = a.hand.filter((c) => c.cardId !== 'defuse' && c.cardId !== 'streaking');
    e.deck.push(card('exploding'));
    sleep(e);
    expect(a.alive).toBe(false);
    expect(a.asleep).toBe(false);
  });

  it('梦乡中：求赠 / 对子 / 怪盗的偷牌都落空（牌和代价照常消耗）', () => {
    const e = ready(703, undefined, { A: 'lazy_sheep', B: 'phantom-thief', C: 'none' });
    asleepA(e);
    const a = P(e, 'A');
    const b = P(e, 'B');
    const h = a.hand.length;
    const bh = b.hand.length;
    play(e, 'B', 'favor', { targetSessionId: 's:A' });
    expect(a.hand.length).toBe(h);
    expect(b.hand.length).toBe(bh);
    expect(e.logLines.some((l) => l.includes('梦乡'))).toBe(true);
    const pair = [card('plain-potato'), card('plain-potato')];
    b.hand.push(...pair);
    e.playCard('s:B', { instanceId: pair[0]!.iid, comboInstanceIds: [pair[1]!.iid], targetSessionId: 's:A' });
    if (e.subPhase === 'awaiting-nope') e.resolveNopes();
    expect(a.hand.length).toBe(h);
    expect(b.hand.length).toBe(bh);
    // 怪盗：弃 2 张指名偷
    const cost = [card('plain-melon'), card('plain-melon')];
    b.hand.push(...cost);
    const ev = e.useSkill('s:B', {
      skillId: 'thief-steal',
      costInstanceIds: cost.map((c) => c.iid),
      targetSessionId: 's:A',
      wantCardId: a.hand[0]!.cardId,
    });
    expect(invalid(ev)).toBeUndefined();
    expect(a.hand.length).toBe(h);
    expect(b.hand.length).toBe(bh);
  });

  it('梦乡中不能打否认（也不会因为她手里有否认而开窗口）', () => {
    const e = ready(704);
    asleepA(e);
    stripNopes(e);
    const nope = card('nope');
    P(e, 'A').hand.push(nope);
    play(e, 'B', 'shuffle');
    expect(e.subPhase).toBe('awaiting-action'); // 只有睡着的人有否认 → 直接结算
    P(e, 'C').hand.push(card('nope'));
    const sh = card('shuffle');
    P(e, 'B').hand.push(sh);
    e.playCard('s:B', { instanceId: sh.iid });
    expect(e.subPhase).toBe('awaiting-nope');
    expect(invalid(e.playCard('s:A', { instanceId: nope.iid, asNope: true }))?.message).toContain('梦乡');
  });

  it('醒来：进入 awaiting-dream，私发 2 张不同的梦境牌', () => {
    const e = ready(705);
    const ev = wakeA(e);
    const a = P(e, 'A');
    expect(a.asleep).toBe(false);
    expect(e.current()?.sessionId).toBe('s:A');
    const opts = e.pendingDreamInfo!.options;
    expect(opts.length).toBe(2);
    expect(new Set(opts).size).toBe(2);
    expect(opts.every((id) => DREAM_CARD_IDS.includes(id))).toBe(true);
    const prompt = privates(ev, 'dreamPrompt')[0];
    expect(prompt.sessionId).toBe('s:A');
    expect(prompt.message.options.map((c: any) => c.id)).toEqual(opts);
    // 选梦期间不能出牌 / 摸牌
    expect(invalid(e.drawCard('s:A'))).toBeDefined();
  });

  it('选梦：留下 → 进自己手牌；非法选择被拒且保持挂起', () => {
    const e = ready(706);
    wakeA(e, ['dream-snooze', 'dream-weave']);
    const a = P(e, 'A');
    expect(invalid(e.dreamPick('s:A', { cardId: 'dream-sense' }))).toBeDefined();
    expect(invalid(e.dreamPick('s:B', { cardId: 'dream-snooze' }))).toBeDefined();
    P(e, 'C').alive = false;
    expect(invalid(e.dreamPick('s:A', { cardId: 'dream-snooze', giveTo: 's:C' }))).toBeDefined();
    expect(e.subPhase).toBe('awaiting-dream');
    const h = a.hand.length;
    expect(invalid(e.dreamPick('s:A', { cardId: 'dream-weave' }))).toBeUndefined();
    expect(e.subPhase).toBe('awaiting-action');
    expect(a.hand.length).toBe(h + 1);
    expect(a.hand.some((c) => c.cardId === 'dream-weave')).toBe(true);
    expect(e.logLines[e.logLines.length - 1]).not.toContain('造梦');
  });

  it('选梦：送人 → 进对方手牌，对方私密得知，公开日志不泄露是哪张', () => {
    const e = ready(707);
    wakeA(e, ['dream-nightmare', 'dream-sense']);
    const b = P(e, 'B');
    const h = b.hand.length;
    const ev = e.dreamPick('s:A', { cardId: 'dream-nightmare', giveTo: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    expect(b.hand.length).toBe(h + 1);
    const given = privates(ev, 'dreamGiven')[0];
    expect(given.sessionId).toBe('s:B');
    expect(given.message.cardId).toBe('dream-nightmare');
    const last = e.logLines[e.logLines.length - 1]!;
    expect(last).toContain('B');
    expect(last).not.toContain('噩梦');
  });

  it('超时兜底：自动留下第一张', () => {
    const e = ready(708);
    wakeA(e, ['dream-sense', 'dream-snooze']);
    e.autoDreamPick();
    expect(e.subPhase).toBe('awaiting-action');
    expect(P(e, 'A').hand.some((c) => c.cardId === 'dream-sense')).toBe(true);
  });

  it('梦游：不进手牌只是状态；下一回合开始自动打出一张功能牌', () => {
    const e = ready(709);
    wakeA(e, ['dream-sleepwalk', 'dream-sense']);
    const b = P(e, 'B');
    b.hand = [card('defuse'), card('nope'), card('plain-melon'), card('dream-snooze'), card('skip')];
    e.dreamPick('s:A', { cardId: 'dream-sleepwalk', giveTo: 's:B' });
    expect(b.sleepwalk).toBe(true);
    expect(b.hand.length).toBe(5);
    e.drawCard('s:A');
    // B 梦游打出唯一的功能牌「跳过」→ 回合直接结束
    expect(b.sleepwalk).toBe(false);
    expect(b.hand.some((c) => c.cardId === 'skip')).toBe(false);
    expect(b.hand.length).toBe(4);
    expect(e.current()?.sessionId).toBe('s:C');
    expect(e.logLines.some((l) => l.includes('梦游'))).toBe(true);
  });

  it('梦游：手里没有可打的功能牌时什么也不发生', () => {
    const e = ready(710);
    wakeA(e, ['dream-sleepwalk', 'dream-sense']);
    const b = P(e, 'B');
    b.hand = [card('defuse'), card('nope'), card('plain-melon')];
    e.dreamPick('s:A', { cardId: 'dream-sleepwalk', giveTo: 's:B' });
    e.drawCard('s:A');
    expect(e.current()?.sessionId).toBe('s:B');
    expect(e.subPhase).toBe('awaiting-action');
    expect(b.sleepwalk).toBe(false);
    expect(b.hand.length).toBe(3);
    expect(e.logLines.some((l) => l.includes('什么也没发生'))).toBe(true);
  });

  it('梦游打出求赠：随机指定目标，效果照常', () => {
    const e = ready(711);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    b.hand = [card('favor')];
    b.sleepwalk = true;
    const others = P(e, 'A').hand.length + P(e, 'C').hand.length;
    e.drawCard('s:A');
    if (e.subPhase === 'awaiting-nope') e.resolveNopes();
    expect(b.hand.length).toBe(1);
    expect(b.hand[0]!.cardId).not.toBe('favor');
    expect(P(e, 'A').hand.length + P(e, 'C').hand.length).toBe(others); // A 摸了 1 张，又被偷走 1 张
    expect(e.current()?.sessionId).toBe('s:B');
  });
});

describe('梦境牌', () => {
  it('回笼觉：立即结束回合不摸牌，下一次摸牌多摸 1 张', () => {
    const e = ready(720);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const h = a.hand.length;
    play(e, 'A', 'dream-snooze');
    expect(e.current()?.sessionId).toBe('s:B');
    expect(a.hand.length).toBe(h);
    expect(a.deferredDraw).toBe(1);
    advanceTo(e, 'A');
    e.drawCard('s:A');
    expect(a.hand.length).toBe(h + 2);
    expect(a.deferredDraw).toBe(0);
  });

  it('羊毛毯：不能打出；被攻击时自动少 1 回合并弃掉', () => {
    const e = ready(721);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    const fleece = card('dream-fleece');
    b.hand.push(fleece);
    expect(e.nextAliveSessionId()).toBe('s:B');
    play(e, 'A', 'attack');
    expect(e.current()?.sessionId).toBe('s:B');
    expect(b.turnsLeft).toBe(1);
    expect(b.hand.some((c) => c.iid === fleece.iid)).toBe(false);
    expect(e.discard.some((c) => c.iid === fleece.iid)).toBe(true);
    expect(e.logLines.some((l) => l.includes('羊毛毯'))).toBe(true);
    const f2 = card('dream-fleece');
    b.hand.push(f2);
    expect(invalid(e.playCard('s:B', { instanceId: f2.iid }))?.message).toContain('羊毛毯');
  });

  it('预知梦：私密告知牌堆顶 5 张里爆炸牌的位置', () => {
    const e = ready(722);
    advanceTo(e, 'A');
    e.deck.push(card('exploding'), card('skip'), card('skip'), card('exploding-apple'), card('skip'));
    const ev = play(e, 'A', 'dream-sense');
    const msg = privates(ev, 'bombSense')[0];
    expect(msg.sessionId).toBe('s:A');
    expect(msg.message.positions).toEqual([2, 5]);
    expect(msg.message.checked).toBe(5);
    expect(e.current()?.sessionId).toBe('s:A');
  });

  it('造梦：把牌堆顶 3 张里的爆炸牌移到牌堆底', () => {
    const e = ready(723);
    advanceTo(e, 'A');
    const b1 = card('exploding');
    const s1 = card('skip');
    const b2 = card('exploding');
    e.deck.push(b1, s1, b2);
    play(e, 'A', 'dream-weave');
    expect(e.deck[e.deck.length - 1]!.iid).toBe(s1.iid);
    expect(e.deck.slice(0, 2).map((c) => c.iid).sort()).toEqual([b1.iid, b2.iid].sort());
    expect(e.logLines.some((l) => l.includes('2 张爆炸牌'))).toBe(true);
  });

  it('噩梦：拿在手里每次摸牌多摸 1 张；可以打出扔掉', () => {
    const e = ready(724);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.hand.push(card('dream-nightmare'));
    const h = a.hand.length;
    e.drawCard('s:A');
    expect(a.hand.length).toBe(h + 2);
    advanceTo(e, 'A');
    const nm = a.hand.find((c) => c.cardId === 'dream-nightmare')!;
    expect(invalid(e.playCard('s:A', { instanceId: nm.iid }))).toBeUndefined();
    if (e.subPhase === 'awaiting-nope') e.resolveNopes();
    expect(a.hand.some((c) => c.cardId === 'dream-nightmare')).toBe(false);
    expect(e.discard.some((c) => c.iid === nm.iid)).toBe(true);
    expect(e.current()?.sessionId).toBe('s:A');
    const h2 = a.hand.length;
    e.drawCard('s:A');
    expect(a.hand.length).toBe(h2 + 1);
  });

  it('被屠夫封锁时梦境牌打不出', () => {
    const e = ready(725);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.lockedBy = 's:B';
    const c = card('dream-snooze');
    a.hand.push(c);
    expect(invalid(e.playCard('s:A', { instanceId: c.iid }))?.message).toContain('封锁');
  });

  it('卡组校验：梦境牌不能放进卡组', () => {
    const deck = { ...CLASSIC_DECK, id: 'x', counts: { ...CLASSIC_DECK.counts, 'dream-snooze': 1 } };
    expect(validateDeck(deck, 4).ok).toBe(false);
  });

  it('AI：懒懒羊机器人整局对弈到结束，会数羊并处理选梦', () => {
    let sleeps = 0;
    let picks = 0;
    for (const seed of [731, 732, 733, 734, 735, 736]) {
      const e = setup(seed, ['A', 'B', 'C', 'D']);
      start(e, { A: 'lazy_sheep', B: 'julia', C: 'butcher', D: 'none' });
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
              : e.subPhase === 'awaiting-dream'
                ? e.pendingDreamInfo!.sessionId
                : e.current()!.sessionId;
        const d = decide(e, sid, null);
        if (!d) throw new Error('bot 无决策: ' + e.subPhase);
        let ev: EngineEvent[];
        if (d.kind === 'draw') ev = e.drawCard(sid);
        else if (d.kind === 'defuse') ev = e.defusePosition(sid, d.position);
        else if (d.kind === 'alter') ev = e.alterFutureOrder(sid, d.order);
        else if (d.kind === 'dreamPick') {
          ev = e.dreamPick(sid, { cardId: d.cardId, giveTo: d.giveTo });
          if (invalid(ev)) throw new Error('选梦非法: ' + invalid(ev)!.message);
          picks++;
        } else if (d.kind === 'sheepDream' || d.kind === 'juliaSkill' || d.kind === 'butcherCleave') {
          ev = e.useSkill(sid, {
            skillId: d.skillId,
            investInstanceIds: d.kind === 'juliaSkill' ? d.investInstanceIds : undefined,
            targetSessionId: d.kind === 'butcherCleave' ? d.targetSessionId : undefined,
          });
          if (invalid(ev)) throw new Error('技能决策非法: ' + invalid(ev)!.message);
          if (d.kind === 'sheepDream') sleeps++;
        } else if (d.kind === 'play') {
          ev = e.playCard(sid, d);
          if (invalid(ev)) {
            const cid = d.instanceId.split('#')[0]!;
            if (cid.startsWith('dream-')) throw new Error('梦境牌决策非法: ' + invalid(ev)!.message);
            e.drawCard(sid);
          }
        } else throw new Error('意外决策 ' + d.kind);
      }
      expect(e.phase).toBe('finished');
    }
    expect(sleeps).toBeGreaterThan(0);
    expect(picks).toBeGreaterThan(0);
  });
});
