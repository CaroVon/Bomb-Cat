import { describe, expect, it } from 'vitest';
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

/** 把某张牌挪到牌堆顶 */
function bringToTop(e: GameEngine, pred: (c: { cardId: string }) => boolean): void {
  const idx = e.deck.findIndex(pred);
  if (idx >= 0) {
    const [c] = e.deck.splice(idx, 1);
    e.deck.push(c!);
  }
}

const invalid = (evs: EngineEvent[]) =>
  evs.find((x) => x.type === 'invalid') as { message: string } | undefined;

describe('v2 五角色修复', () => {
  /* ---------------- chaos_queen ---------------- */

  it('混沌女王：两个主动技都能发动（此前第二技能被单主动技查找锁死）', () => {
    const e = setup(11);
    start(e, { A: 'chaos_queen', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const dirBefore = e.direction;
    const ev1 = e.useSkill('s:A', { skillId: 'chaos-warp' });
    expect(invalid(ev1)).toBeUndefined();
    expect(e.direction).not.toBe(dirBefore);

    const ev2 = e.useSkill('s:A', { skillId: 'chaos-touch' });
    expect(invalid(ev2)).toBeUndefined();
    expect((e as any).chaosDrawsActive).toBe(true);
  });

  it('混沌女王：涟漪被动在其他玩家手牌变化时摸 1 张（每回合 1 次）', () => {
    const e = setup(12);
    start(e, { A: 'none', B: 'none', C: 'chaos_queen' });
    stripDanger(e);
    const cq = P(e, 'C');
    const before = cq.hand.length;
    // A 对 B 打求赠（stealRandom → B 手牌变化）
    advanceTo(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const favor = P(e, 'A').hand.find((c) => c.cardId === 'favor');
    if (!favor) {
      P(e, 'A').hand.push({ iid: 't-favor', cardId: 'favor' });
      e.playCard('s:A', { instanceId: 't-favor', targetSessionId: 's:B' });
    } else {
      e.playCard('s:A', { instanceId: favor.iid, targetSessionId: 's:B' });
    }
    expect(cq.hand.length).toBe(before + 1);
    expect(e.logLines.some((l) => l.includes('涟漪'))).toBe(true);
  });

  /* ---------------- Pig King ---------------- */

  it('猪王：饱腹期结束回合跳过摸牌，不再卡死', () => {
    const e = setup(13);
    start(e, { A: 'pig_king', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const pig = P(e, 'A');
    pig.fullTurns = 3;
    // 清掉所有能结束回合的牌，制造原来的死锁场景
    pig.hand = pig.hand.filter((c) => !['skip', 'attack', 'draw-bottom'].includes(c.cardId));
    const handBefore = pig.hand.length;
    const ev = e.drawCard('s:A');
    expect(invalid(ev)).toBeUndefined(); // 原实现这里返回 invalid 并卡死
    expect(pig.hand.length).toBe(handBefore); // 没有摸牌
    expect(e.current()?.sessionId).not.toBe('s:A'); // 回合正常推进
    expect(e.logLines.some((l) => l.includes('饱腹中，跳过摸牌'))).toBe(true);
  });

  it('猪王：消化完成的牌必须先处理（打出或丢弃），digestPlay 可丢弃', () => {
    const e = setup(14);
    start(e, { A: 'pig_king', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const pig = P(e, 'A');
    pig.mustPlayIid = pig.hand[0]!.iid;
    const other = pig.hand[1]!;

    // 出别的牌被拒绝
    const ev1 = e.playCard('s:A', { instanceId: other.iid });
    expect(invalid(ev1)?.message).toContain('消化');
    // 结束回合被拒绝
    const ev2 = e.drawCard('s:A');
    expect(invalid(ev2)?.message).toContain('消化');
    // 丢弃消化牌成功
    const iid = pig.mustPlayIid;
    const ev3 = e.handleDigestPlay('s:A', { instanceId: iid });
    expect(invalid(ev3)).toBeUndefined();
    expect(pig.mustPlayIid).toBeNull();
    expect(pig.hand.some((c) => c.iid === other.iid)).toBe(true);
  });

  it('猪王：打出消化牌本体放行并清除限制', () => {
    const e = setup(15);
    start(e, { A: 'pig_king', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const pig = P(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const shuffleCard = pig.hand.find((c) => c.cardId === 'shuffle') ?? pig.hand[0]!;
    pig.mustPlayIid = shuffleCard.iid;
    const ev = e.playCard('s:A', { instanceId: shuffleCard.iid });
    expect(invalid(ev)).toBeUndefined();
    expect(pig.mustPlayIid).toBeNull();
  });

  /* ---------------- Nana ---------------- */

  it('Nana：死亡眼泪入堆 → 他人摸到喂牌复活 → 排名恢复；非法提交不吞眼泪', () => {
    const e = setup(16);
    start(e, { A: 'none', B: 'nana', C: 'none' });
    // B 无拆解开局：直接置顶爆炸猫炸死 B
    advanceTo(e, 'B');
    stripDanger(e);
    e.deck.push({ iid: 't-boom', cardId: 'exploding' });
    e.drawCard('s:B');
    const nana = P(e, 'B');
    expect(nana.alive).toBe(false);
    expect(e.deck.some((c) => c.cardId === 'tear')).toBe(true);
    expect(e.deathOrder).toContain('s:B');

    // A 摸到眼泪
    advanceTo(e, 'A');
    bringToTop(e, (c) => c.cardId === 'tear');
    e.drawCard('s:A');
    expect(e.subPhase).toBe('awaiting-tear');

    // 非法 giveInstanceId：不吞眼泪，仍可重试
    const bad = e.handleTearChoice('s:A', { accept: true, giveInstanceId: 'not-exist' });
    expect(invalid(bad)).toBeDefined();
    expect(e.subPhase).toBe('awaiting-tear');

    // 正确喂牌：Nana 复活（眼泪可能流回刚复活的 Nana 手中，所以只验证首张为所喂牌）
    const give = P(e, 'A').hand[0]!;
    const ok = e.handleTearChoice('s:A', { accept: true, giveInstanceId: give.iid });
    expect(invalid(ok)).toBeUndefined();
    expect(nana.alive).toBe(true);
    expect(nana.hand[0]?.iid).toBe(give.iid);
    expect(e.deathOrder).not.toContain('s:B'); // 复活清出死亡序列
  });

  it('眼泪不能主动打出', () => {
    const e = setup(17);
    start(e);
    advanceTo(e, 'A');
    P(e, 'A').hand.push({ iid: 't-tear', cardId: 'tear' });
    const ev = e.playCard('s:A', { instanceId: 't-tear' });
    expect(invalid(ev)?.message).toContain('眼泪');
  });

  /* ---------------- Banana ---------------- */

  it('香蕉女王：无拆解爆炸挂起 → 4 张香蕉兑换拆解', () => {
    const e = setup(18);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    // 发动大香蕉之怒（先确保无拆解）
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    while (q.hand.length < 5) q.hand.push({ iid: `t-pad-${q.hand.length}`, cardId: 'plain-melon' });
    const evSkill = e.useSkill('s:A', { skillId: 'banana-rage' });
    expect(invalid(evSkill)).toBeUndefined();
    expect((e as any).bananaOverlayTurns).toBe(1);

    // 摸到爆炸猫 → 挂起等待香蕉兑换（而不是直接死亡）
    stripDanger(e);
    e.deck.push({ iid: 't-boom2', cardId: 'exploding' });
    e.drawCard('s:A');
    expect(e.subPhase).toBe('awaiting-defuse');
    expect(e.pendingDefuse!.needsCard).toBe(true);
    // 没有真拆解时 defusePosition 直通被拒绝
    const evDirect = e.defusePosition('s:A', 0);
    expect(invalid(evDirect)).toBeDefined();

    // 4 张香蕉兑换成功
    const cost = q.hand.slice(0, 4).map((c) => c.iid);
    const handBefore = q.hand.length;
    const evSub = e.handleBananaSubstitute('s:A', {
      mode: 'defuse',
      costInstanceIds: cost,
      position: 0,
    });
    expect(invalid(evSub)).toBeUndefined();
    expect(q.hand.length).toBe(handBefore - 4);
    expect(e.deck.some((c) => c.iid === 't-boom2')).toBe(true);
    expect(e.current()?.sessionId).not.toBe('s:A'); // 回合已结束
  });

  it('香蕉女王：2 张香蕉兑换任意动作牌并立即打出', () => {
    const e = setup(19);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    e.useSkill('s:A', { skillId: 'banana-rage' });
    advanceTo(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const cost = q.hand.slice(0, 2).map((c) => c.iid);
    const handBefore = q.hand.length;
    const ev = e.handleBananaSubstitute('s:A', {
      mode: 'action',
      cardId: 'shuffle',
      costInstanceIds: cost,
    });
    expect(invalid(ev)).toBeUndefined();
    expect(q.hand.length).toBe(handBefore - 2);
    expect(e.logLines.some((l) => l.includes('2 张香蕉兑换'))).toBe(true);
    expect(e.logLines.some((l) => l.includes('牌堆被洗乱了'))).toBe(true);
    // 张数不符（3 张）会被拒绝
    const evBad = e.handleBananaSubstitute('s:A', {
      mode: 'action',
      cardId: 'shuffle',
      costInstanceIds: q.hand.slice(0, 3).map((c) => c.iid),
    });
    expect(invalid(evBad)?.message).toContain('2 张');
  });

  it('香蕉女王：整局 3 次 + 冷却 3 回合 + 覆盖期间禁止再发动', () => {
    const e = setup(31);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');

    const ev1 = e.useSkill('s:A', { skillId: 'banana-rage' });
    expect(invalid(ev1)).toBeUndefined();
    expect(e.bananaOverlayTurns).toBe(1); // 轮次制：持续 1 轮
    expect(q.skillCooldowns['banana-rage']).toBe(3);
    expect(q.skillState['banana-rage']!.used).toBe(1);

    // 覆盖期间再次发动 → 拒绝
    const evDup = e.useSkill('s:A', { skillId: 'banana-rage' });
    expect(invalid(evDup)?.message).toContain('正在生效');

    // 推进到覆盖结束、冷却归零（女王手中不能有拆解）
    for (let i = 0; i < 40 && !(e.bananaOverlayTurns === 0 && (q.skillCooldowns['banana-rage'] ?? 0) === 0); i++) {
      if (e.subPhase === 'awaiting-nope') { e.resolveNopes(); continue; }
      if (e.subPhase === 'awaiting-defuse') { e.defusePosition(e.pendingDefuse!.sessionId, 0); continue; }
      if (e.phase !== 'playing') throw new Error('phase=' + e.phase);
      stripDanger(e);
      e.drawCard(e.current()!.sessionId);
    }
    expect(e.bananaOverlayTurns).toBe(0);
    expect(q.skillCooldowns['banana-rage'] ?? 0).toBe(0);

    advanceTo(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    expect(invalid(e.useSkill('s:A', { skillId: 'banana-rage' }))).toBeUndefined();
    expect(q.skillState['banana-rage']!.used).toBe(2);
    expect(e.bananaOverlayTurns).toBe(1);
  });

  it('香蕉覆盖轮次制：所有存活玩家各行动一次后才消退（连击不额外消耗）', () => {
    const e = setup(34);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    expect(invalid(e.useSkill('s:A', { skillId: 'banana-rage' }))).toBeUndefined();

    // A 结束回合 → B 回合开始（覆盖仍在：B 本轮首次行动）
    stripDanger(e);
    e.drawCard('s:A');
    expect(e.bananaOverlayTurns).toBe(1);
    expect(e.current()?.sessionId).toBe('s:B');

    // B 结束 → C 回合开始（覆盖仍在）
    e.drawCard('s:B');
    expect(e.bananaOverlayTurns).toBe(1);
    expect(e.current()?.sessionId).toBe('s:C');

    // C 结束 → 轮次回绕到 A：覆盖消退
    e.drawCard('s:C');
    expect(e.bananaOverlayTurns).toBe(0);
    expect(e.logLines.some((l) => l.includes('效果消退了'))).toBe(true);
  });

  it('香蕉覆盖期间：女王无法直接出牌，其他人盲打普通猫无效果进弃牌堆', () => {
    const e = setup(32);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    e.useSkill('s:A', { skillId: 'banana-rage' });
    // 女王直接出牌被拒
    const evQueen = e.playCard('s:A', { instanceId: q.hand[0]!.iid });
    expect(invalid(evQueen)?.message).toContain('兑换');

    // 轮到 B：盲打一张普通猫 → 直接进弃牌堆、无效果、回合不结束
    e.drawCard('s:A');
    advanceTo(e, 'B');
    const b = P(e, 'B');
    b.hand.push({ iid: 't-blind-cat', cardId: 'plain-melon' });
    const discBefore = e.discard.length;
    const evBlind = e.playCard('s:B', { instanceId: 't-blind-cat' });
    expect(invalid(evBlind)).toBeUndefined();
    expect(e.discard.length).toBe(discBefore + 1);
    expect(e.discard.some((c) => c.iid === 't-blind-cat')).toBe(true);
    expect(e.current()?.sessionId).toBe('s:B'); // 回合未结束
    expect(e.logLines.some((l) => l.includes('盲打了一张香蕉'))).toBe(true);

    // 组合在覆盖期间被禁用
    b.hand.push({ iid: 't-cat2', cardId: 'plain-melon' }, { iid: 't-cat3', cardId: 'plain-melon' });
    const evCombo = e.playCard('s:B', {
      instanceId: 't-cat2',
      comboInstanceIds: ['t-cat3'],
      targetSessionId: 's:C',
    });
    expect(invalid(evCombo)?.message).toContain('组合');
  });

  it('大香蕉之怒：发动后全场手牌洗乱但牌不变（每人一个 hand 事件）', () => {
    const e = setup(33);
    start(e, { A: 'banana', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const q = P(e, 'A');
    q.hand = q.hand.filter((c) => c.cardId !== 'defuse');
    const before = e.players.map((p) => [...p.hand.map((c) => c.iid)].sort().join(','));
    const ev = e.useSkill('s:A', { skillId: 'banana-rage' });
    expect(invalid(ev)).toBeUndefined();
    const after = e.players.map((p) => [...p.hand.map((c) => c.iid)].sort().join(','));
    expect(after).toEqual(before);
    const handEvents = ev
      .filter((x) => x.type === 'hand')
      .map((x) => (x as { sessionId: string }).sessionId)
      .sort();
    expect(handEvents).toEqual(['s:A', 's:B', 's:C']);
    expect(e.logLines.some((l) => l.includes('打乱'))).toBe(true);
  });

  /* ---------------- future_queen ---------------- */

  it('Future女王：命运改写 看顶5→激活1张→手牌替换→按序放回', () => {
    const e = setup(20);
    start(e, { A: 'future_queen', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const fq = P(e, 'A');
    stripDanger(e);
    // 构造已知的顶 5 张（自顶向下）：shuffle, peek, skip, favor, attack
    const topFive = ['shuffle', 'peek', 'skip', 'favor', 'attack'].map((id, i) => ({
      iid: `t-top-${i}`,
      cardId: id,
    }));
    e.deck.push(...[...topFive].reverse()); // 顶是 shuffle

    const evSkill = e.useSkill('s:A', { skillId: 'future-rewrite' });
    expect(invalid(evSkill)).toBeUndefined();
    const prompt = evSkill.find((x) => x.type === 'private') as {
      message: { cards: { id: string }[] };
    };
    expect(prompt.message.cards.map((c) => c.id)).toEqual([
      'shuffle',
      'peek',
      'skip',
      'favor',
      'attack',
    ]);

    // 激活顶张 shuffle；用一张手牌替换；顺序保持
    const swap = fq.hand[0]!;
    const evPick = e.handleFutureRewrite('s:A', {
      activateIdx: 0,
      swapInstanceId: swap.iid,
      order: [0, 1, 2, 3, 4],
    });
    expect(invalid(evPick)).toBeUndefined();
    // shuffle 生效
    expect(e.logLines.some((l) => l.includes('改写了命运') && l.includes('洗牌'))).toBe(true);
    // 手牌替换牌离开手牌
    expect(fq.hand.some((c) => c.iid === swap.iid)).toBe(false);
    // 替换牌在牌堆顶 5 张内
    expect(e.deck.slice(-5).some((c) => c.iid === swap.iid)).toBe(true);
    // 激活的 shuffle 进了弃牌堆
    expect(e.discard.some((c) => c.iid === 't-top-0')).toBe(true);
  });

  /* ---------------- Voyage ---------------- */

  it('Voyage：随机交换 3 张手牌，回合结束，进入冷却', () => {
    const e = setup(22);
    start(e, { A: 'voyage', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    const aBefore = [...a.hand];
    const bBefore = [...b.hand];
    const ev = e.useSkill('s:A', { skillId: 'voyage-skill', targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    // 双方手牌数量不变，各有 3 张来自对方
    expect(a.hand).toHaveLength(aBefore.length);
    expect(b.hand).toHaveLength(bBefore.length);
    const fromB = a.hand.filter((c) => bBefore.some((x) => x.iid === c.iid));
    const fromA = b.hand.filter((c) => aBefore.some((x) => x.iid === c.iid));
    expect(fromB).toHaveLength(3);
    expect(fromA).toHaveLength(3);
    // 回合立即结束 + 冷却 5
    expect(e.current()?.sessionId).not.toBe('s:A');
    expect(a.skillCooldowns['voyage-skill']).toBe(5);
    expect(e.logLines.some((l) => l.includes('交换了 3 张手牌'))).toBe(true);
  });

  it('Voyage：指定自己交出的 3 张牌，对方仍随机', () => {
    const e = setup(29);
    start(e, { A: 'voyage', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    const aBefore = [...a.hand];
    const bBefore = [...b.hand];
    // 指定交出前 3 张
    const give = a.hand.slice(0, 3).map((c) => c.iid);
    const ev = e.useSkill('s:A', {
      skillId: 'voyage-skill',
      targetSessionId: 's:B',
      costInstanceIds: give,
    });
    expect(invalid(ev)).toBeUndefined();
    // 指定的 3 张确实到了 B 手中
    for (const iid of give) {
      expect(b.hand.some((c) => c.iid === iid)).toBe(true);
    }
    // A 收到 B 的 3 张随机牌，手牌数不变
    expect(a.hand).toHaveLength(aBefore.length);
    expect(b.hand).toHaveLength(bBefore.length);
    const fromB = a.hand.filter((c) => bBefore.some((x) => x.iid === c.iid));
    expect(fromB).toHaveLength(3);

    // 张数不符 → 拒绝
    const e2 = setup(30);
    start(e2, { A: 'voyage', B: 'none', C: 'none' });
    stripDanger(e2);
    advanceTo(e2, 'A');
    const a2 = P(e2, 'A');
    const evBad = e2.useSkill('s:A', {
      skillId: 'voyage-skill',
      targetSessionId: 's:B',
      costInstanceIds: a2.hand.slice(0, 2).map((c) => c.iid),
    });
    expect(invalid(evBad)?.message).toContain('3 张');
  });

  it('Voyage：任一方手牌不足 3 张不能发动', () => {
    const e = setup(23);
    start(e, { A: 'voyage', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const b = P(e, 'B');
    b.hand = b.hand.slice(0, 2);
    const ev = e.useSkill('s:A', { skillId: 'voyage-skill', targetSessionId: 's:B' });
    expect(invalid(ev)?.message).toContain('至少 3 张');
  });

  /* ---------------- bigEye 大眼Nana ---------------- */

  it('大眼Nana：其他玩家使用功能牌积累档案（上限 4，自己不计）', () => {
    const e = setup(24);
    start(e, { A: 'bigEye', B: 'none', C: 'none' });
    stripDanger(e);
    const a = P(e, 'A');
    const b = P(e, 'B');
    // B 打一张动作牌 → B 档案 +1
    advanceTo(e, 'B');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const shuffle = b.hand.find((c) => c.cardId === 'shuffle') ?? b.hand[0]!;
    e.playCard('s:B', { instanceId: shuffle.iid });
    expect(b.archives).toBe(1);
    // bigEye 自己出牌不积累
    advanceTo(e, 'A');
    const aCard = a.hand.find((c) => c.cardId === 'peek') ?? a.hand[0]!;
    if (aCard.cardId !== 'nope' && aCard.cardId !== 'defuse') {
      e.playCard('s:A', { instanceId: aCard.iid });
    }
    expect(a.archives).toBe(0);
    expect(b.archives).toBe(1);
    // 上限 4
    b.archives = 4;
    advanceTo(e, 'B');
    const bCard2 = b.hand.find((c) => c.cardId === 'peek') ?? b.hand[0]!;
    if (bCard2.cardId !== 'nope' && bCard2.cardId !== 'defuse') {
      e.playCard('s:B', { instanceId: bCard2.iid });
    }
    expect(b.archives).toBe(4);
  });

  it('大眼Nana：无法使用求赠和组合偷牌', () => {
    const e = setup(25);
    start(e, { A: 'bigEye', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const a = P(e, 'A');
    a.hand.push({ iid: 't-favor-2', cardId: 'favor' });
    const ev1 = e.playCard('s:A', { instanceId: 't-favor-2', targetSessionId: 's:B' });
    expect(invalid(ev1)?.message).toContain('求赠');
    a.hand.push(
      { iid: 't-m1', cardId: 'plain-melon' },
      { iid: 't-m2', cardId: 'plain-melon' },
    );
    const ev2 = e.playCard('s:A', {
      instanceId: 't-m1',
      comboInstanceIds: ['t-m2'],
      targetSessionId: 's:B',
    });
    expect(invalid(ev2)?.message).toContain('求赠');
  });

  it('大眼Nana：揭发 2 档案=看牌面，档案清零并进入冷却', () => {
    const e = setup(26);
    start(e, { A: 'bigEye', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    b.archives = 2;
    const ev = e.useSkill('s:A', { skillId: 'bigeye-expose', targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    const prompt = ev.find((x) => x.type === 'private') as {
      message: { action: string; mode: string; cards: unknown[] };
    };
    expect(prompt.message.action).toBe('exposePrompt');
    expect(prompt.message.mode).toBe('view');
    expect(prompt.message.cards).toHaveLength(b.hand.length);
    expect(b.archives).toBe(0); // 发动后清零
    expect(a.skillCooldowns['bigeye-expose']).toBe(3);
  });

  it('大眼Nana：揭发 3 档案=指定弃一张；4 档案=抽走一张', () => {
    const e = setup(27);
    start(e, { A: 'bigEye', B: 'none', C: 'none' });
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');

    // 3 档案：discard
    b.archives = 3;
    const ev3 = e.useSkill('s:A', { skillId: 'bigeye-expose', targetSessionId: 's:B' });
    const p3 = ev3.find((x) => x.type === 'private') as {
      message: { mode: string; cards: Array<{ instanceId: string }> };
    };
    expect(p3.message.mode).toBe('discard');
    const victim = b.hand[0]!;
    const bHandBefore = b.hand.length;
    const pick3 = e.handleExposePick('s:A', { instanceId: victim.iid });
    expect(invalid(pick3)).toBeUndefined();
    expect(b.hand).toHaveLength(bHandBefore - 1);
    expect(e.discard.some((c) => c.iid === victim.iid)).toBe(true);

    // 4 档案：steal（重置冷却）
    a.skillCooldowns['bigeye-expose'] = 0;
    b.archives = 4;
    const ev4 = e.useSkill('s:A', { skillId: 'bigeye-expose', targetSessionId: 's:B' });
    const p4 = ev4.find((x) => x.type === 'private') as {
      message: { mode: string; cards: Array<{ instanceId: string }> };
    };
    expect(p4.message.mode).toBe('steal');
    const stealTarget = b.hand[0]!;
    const aHandBefore = a.hand.length;
    const bBefore2 = b.hand.length;
    const pick4 = e.handleExposePick('s:A', { instanceId: stealTarget.iid });
    expect(invalid(pick4)).toBeUndefined();
    expect(a.hand).toHaveLength(aHandBefore + 1);
    expect(b.hand).toHaveLength(bBefore2 - 1);
    expect(a.hand.some((c) => c.iid === stealTarget.iid)).toBe(true);

    // 档案不足 2 不能揭发
    a.skillCooldowns['bigeye-expose'] = 0;
    b.archives = 1;
    const evLow = e.useSkill('s:A', { skillId: 'bigeye-expose', targetSessionId: 's:B' });
    expect(invalid(evLow)?.message).toContain('档案不足');
  });

  /* ---------------- 信息脱敏 ---------------- */

  it('公开日志不泄露隐藏信息（偷牌卡名/拆解位置）', () => {
    const e = setup(21);
    start(e);
    stripDanger(e);
    // A 打求赠偷 B 一张
    advanceTo(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    const favor = P(e, 'A').hand.find((c) => c.cardId === 'favor');
    if (favor) {
      e.playCard('s:A', { instanceId: favor.iid, targetSessionId: 's:B' });
    } else {
      P(e, 'A').hand.push({ iid: 't-favor-x', cardId: 'favor' });
      e.playCard('s:A', { instanceId: 't-favor-x', targetSessionId: 's:B' });
    }
    const stealLog = e.logLines.find((l) => l.includes('偷走了 1 张牌'));
    expect(stealLog).toBeDefined();
    expect(stealLog).not.toContain('【');

    // 拆解日志不含位置
    if (e.phase === 'playing') {
      advanceTo(e, 'A');
      e.deck.push({ iid: 't-boom3', cardId: 'exploding' });
      const hasDefuse = P(e, 'A').hand.some((c) => c.cardId === 'defuse');
      e.drawCard('s:A');
      if (e.subPhase === 'awaiting-defuse' && hasDefuse) {
        e.defusePosition('s:A', 3);
        const dlog = e.logLines.find((l) => l.includes('放回了牌堆'));
        expect(dlog).toBeDefined();
        expect(dlog).not.toContain('第');
      }
    }
  });

  /* ---------------- v3：数学老师（soup） ---------------- */

  it('数学老师：加法让目标立即摸一张（不结束其回合）', () => {
    const e = setup(41);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    const before = b.hand.length;
    const deckBefore = e.deck.length;
    const ev = e.useSkill('s:A', { skillId: 'soup-add', targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    expect(b.hand.length).toBe(before + 1);
    expect(e.deck.length).toBe(deckBefore - 1);
    expect(e.current()?.sessionId).toBe('s:A'); // 仍是老师的回合
    expect(a.skillCooldowns['soup-add']).toBe(4);
    // 不能指定自己
    const evSelf = e.useSkill('s:A', { skillId: 'soup-sub', targetSessionId: 's:A' });
    expect(invalid(evSelf)?.message).toContain('不能指定自己');
  });

  it('数学老师：减法让目标下次摸牌少摸一张（最少 0）', () => {
    const e = setup(42);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    expect(invalid(e.useSkill('s:A', { skillId: 'soup-sub', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.mathSubDraw).toBe(1);
    // A 结束回合 → B 摸牌应少摸一张（0 张）
    e.drawCard('s:A');
    expect(e.current()?.sessionId).toBe('s:B');
    const before = b.hand.length;
    stripDanger(e);
    e.drawCard('s:B');
    expect(b.hand.length).toBe(before); // 被减法压到 0 张
    expect(b.mathSubDraw).toBe(0);
    expect(e.logLines.some((l) => l.includes('受减法影响'))).toBe(true);
  });

  it('数学老师：乘法让目标下一张功能牌触发两次', () => {
    const e = setup(43);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    expect(invalid(e.useSkill('s:A', { skillId: 'soup-mul', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.mathMulNext).toBe(1);
    e.drawCard('s:A');
    expect(e.current()?.sessionId).toBe('s:B');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    // B 打出「洗牌」：乘法生效 → 触发两次（日志可见），标记消耗
    b.hand.push({ iid: 't-shuffle-mul', cardId: 'shuffle' });
    const ev = e.playCard('s:B', { instanceId: 't-shuffle-mul' });
    expect(invalid(ev)).toBeUndefined();
    expect(b.mathMulNext).toBe(0);
    expect(e.logLines.some((l) => l.includes('乘法生效'))).toBe(true);
    // 洗了两次 → 两条洗牌日志
    expect(e.logLines.filter((l) => l.includes('牌堆被洗乱了')).length).toBe(2);
  });

  it('数学老师：除法让目标下一张功能牌无法触发（直接进弃牌堆）', () => {
    const e = setup(44);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    expect(invalid(e.useSkill('s:A', { skillId: 'soup-div', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.mathDivNext).toBe(1);
    e.drawCard('s:A');
    expect(e.current()?.sessionId).toBe('s:B');
    b.hand.push({ iid: 't-shuffle-div', cardId: 'shuffle' });
    const discBefore = e.discard.length;
    const ev = e.playCard('s:B', { instanceId: 't-shuffle-div' });
    expect(invalid(ev)).toBeUndefined();
    expect(b.mathDivNext).toBe(0);
    expect(e.discard.length).toBe(discBefore + 1);
    expect(e.logLines.some((l) => l.includes('被除法干扰'))).toBe(true);
    // 没有真的洗牌日志
    expect(e.logLines.some((l) => l.includes('牌堆被洗乱了'))).toBe(false);
  });

  /* ---------------- v3：秀英（xiuying） ---------------- */

  it('秀英：开局 10 层冰冻，无法出牌/摸牌（结束回合不摸牌）', () => {
    const e = setup(45);
    start(e, { A: 'xiuying', B: 'none', C: 'none' });
    const x = P(e, 'A');
    expect(x.freezeLayers).toBe(10);
    stripDanger(e);
    advanceTo(e, 'A');
    // 出牌被拒
    const card = x.hand[0]!;
    expect(invalid(e.playCard('s:A', { instanceId: card.iid }))?.message).toContain('冰冻');
    // 结束回合：不摸牌
    const handBefore = x.hand.length;
    const deckBefore = e.deck.length;
    e.drawCard('s:A');
    expect(x.hand.length).toBe(handBefore);
    expect(e.deck.length).toBe(deckBefore);
    expect(e.current()?.sessionId).not.toBe('s:A');
  });

  it('秀英：求助成功（对方交牌）→ 冰冻 -1 且本回合可正常行动；拒绝后可继续问', () => {
    const e = setup(46);
    start(e, { A: 'xiuying', B: 'none', C: 'none' });
    const x = P(e, 'A');
    const b = P(e, 'B');
    stripDanger(e);
    advanceTo(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));

    // 求助 B → B 拒绝
    const evAsk = e.useSkill('s:A', { skillId: 'ice-help', targetSessionId: 's:B' });
    expect(invalid(evAsk)).toBeUndefined();
    expect(e.subPhase).toBe('awaiting-help');
    expect(e.helpPending).toBe(true);
    const evRefuse = e.handleHelpRespond('s:B', { accept: false });
    expect(invalid(evRefuse)).toBeUndefined();
    expect(e.helpPending).toBe(false);
    expect(x.freezeLayers).toBe(10);
    // 被拒后仍可继续问别人（本回合同一人不能再问）
    const evDupAsk = e.useSkill('s:A', { skillId: 'ice-help', targetSessionId: 's:B' });
    expect(invalid(evDupAsk)?.message).toContain('已经问过');

    // 求助 C → C 同意并交一张牌
    const giveCard = b.hand[0]!;
    const evAsk2 = e.useSkill('s:A', { skillId: 'ice-help', targetSessionId: 's:C' });
    expect(invalid(evAsk2)).toBeUndefined();
    const c = P(e, 'C');
    const cCard = c.hand[0]!;
    const xBefore = x.hand.length;
    const evAccept = e.handleHelpRespond('s:C', { accept: true, giveInstanceId: cCard.iid });
    expect(invalid(evAccept)).toBeUndefined();
    expect(x.freezeLayers).toBe(9);
    expect(x.helpedThisTurn).toBe(true);
    expect(x.hand.length).toBe(xBefore + 1);
    expect(x.hand.some((k) => k.iid === cCard.iid)).toBe(true);
    // 本回合可正常出牌
    const playable = x.hand.find((k) => k.cardId === 'shuffle') ?? x.hand[0]!;
    const evPlay = e.playCard('s:A', { instanceId: playable.iid });
    expect(invalid(evPlay)).toBeUndefined();
    void giveCard;
  });

  it('秀英：冰冻中不受技能影响（技能无效但冰冻 -1）', () => {
    const e = setup(47);
    start(e, { A: 'soup', B: 'xiuying', C: 'none' });
    const x = P(e, 'B');
    stripDanger(e);
    advanceTo(e, 'A');
    const bBefore = x.hand.length;
    const ev = e.useSkill('s:A', { skillId: 'soup-add', targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    expect(x.hand.length).toBe(bBefore); // 加法被冰冻挡下，没有摸牌
    expect(x.freezeLayers).toBe(9);
    expect(e.logLines.some((l) => l.includes('处于冰冻中'))).toBe(true);
  });

  it('秀英：解冻后可喂荔枝，集齐 2 颗换一张普通猫；不能喂自己', () => {
    const e = setup(48);
    start(e, { A: 'xiuying', B: 'none', C: 'none' });
    const x = P(e, 'A');
    const b = P(e, 'B');
    stripDanger(e);
    advanceTo(e, 'A');
    // 冰冻时不能喂
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:B' }))?.message).toContain('冰冻');
    // 解冻
    x.freezeLayers = 0;
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.lychees).toBe(1);
    // 每回合只能喂 1 颗
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:B' }))?.message).toContain('已经喂过');
    // 不能喂自己
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:A' }))?.message).toContain('不能喂自己');
    // 下一回合再喂一颗 → 集齐 2 颗换普通猫
    e.drawCard('s:A');
    advanceTo(e, 'A');
    const bHandBefore = b.hand.length;
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.lychees).toBe(0);
    expect(b.hand.length).toBe(bHandBefore + 1);
    expect(e.logLines.some((l) => l.includes('集齐 2 颗荔枝'))).toBe(true);
  });

  /* ---------------- v3：全局规则防重复 ---------------- */

  /* ---------------- v3：全局规则防重复 ---------------- */

  it('全局规则：连续多局不出现同一条规则（防重复）', () => {
    const picked: string[] = [];
    for (let i = 0; i < 12; i++) {
      const e = setup(100 + i);
      // 不传 worldRuleId → 走随机分支（带防重复）
      e.startGame(e.hostSessionId, null, {});
      picked.push(e.worldRuleId);
    }
    for (let i = 0; i < picked.length; i++) {
      expect(picked[i]).not.toBe('');
    }
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i]).not.toBe(picked[i - 1]);
    }
    // 多条不同规则出现（不是反复同一条）
    expect(new Set(picked).size).toBeGreaterThan(1);
  });

  /* ---------------- v4：邪恶苹果头（apple） ---------------- */

  it('邪恶苹果头：开局往牌堆藏一张爆炸苹果（公开公告）', () => {
    const e = setup(61);
    start(e, { A: 'apple', B: 'none', C: 'none' });
    expect(e.deck.filter((c) => c.cardId === 'exploding-apple')).toHaveLength(1);
    expect(e.logLines.some((l) => l.includes('爆炸苹果'))).toBe(true);
  });

  it('邪恶苹果头：本人摸到爆炸苹果 → 悄悄放回牌堆并再摸一张', () => {
    const e = setup(62);
    start(e, { A: 'apple', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    // 把爆炸苹果放到牌堆顶（顶=数组末尾）
    e.deck.push({ iid: 't-apple-top', cardId: 'exploding-apple' });
    const handBefore = a.hand.length;
    const drawEv = e.drawCard('s:A');
    expect(a.alive).toBe(true);
    expect(a.hand.length).toBe(handBefore + 1); // 苹果被放回，额外摸一张
    expect(e.deck.some((c) => c.cardId === 'exploding-apple')).toBe(true); // 苹果仍在牌堆
    expect(
      drawEv.some(
        (x) => x.type === 'private' && (x as { message?: { action?: string } }).message?.action === 'notice',
      ),
    ).toBe(true);
    expect(e.subPhase).not.toBe('awaiting-defuse'); // 不会爆炸挂起
  });

  it('邪恶苹果头：其他人摸到爆炸苹果等同爆炸猫，拆解后仍以爆炸苹果身份回牌堆', () => {
    const e = setup(63);
    start(e, { A: 'apple', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'B');
    const b = P(e, 'B');
    expect(b.hand.some((c) => c.cardId === 'defuse')).toBe(true);
    e.deck.push({ iid: 't-apple-hit', cardId: 'exploding-apple' });
    e.drawCard('s:B');
    expect(e.subPhase).toBe('awaiting-defuse');
    e.defusePosition('s:B', 0);
    expect(e.deck.some((c) => c.cardId === 'exploding-apple')).toBe(true);
    expect(e.deck.some((c) => c.iid === 't-apple-hit')).toBe(true);
  });

  it('邪恶苹果头：投掷苹果 → 目标可吃掉（交一张手牌），每人限 1 个', () => {
    const e = setup(64);
    start(e, { A: 'apple', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const b = P(e, 'B');
    const ev = e.useSkill('s:A', { skillId: 'apple-throw', targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    expect(b.appleTurns).toBe(3);
    expect(a.skillCooldowns['apple-throw']).toBe(5);
    // 重复投掷被拒（先清冷却，才能验到"已有苹果"的拦截）
    a.skillCooldowns['apple-throw'] = 0;
    expect(invalid(e.useSkill('s:A', { skillId: 'apple-throw', targetSessionId: 's:B' }))?.message).toContain(
      '已经有邪恶苹果',
    );
    a.skillCooldowns['apple-throw'] = 5;

    // B 在自己回合吃掉
    e.drawCard('s:A');
    advanceTo(e, 'B');
    const give = b.hand[0]!;
    const aHandBefore = a.hand.length;
    const evEat = e.handleAppleEat('s:B', { giveInstanceId: give.iid });
    expect(invalid(evEat)).toBeUndefined();
    expect(b.appleTurns).toBe(0);
    expect(a.hand.length).toBe(aHandBefore + 1);
    expect(a.hand.some((c) => c.iid === give.iid)).toBe(true);
  });

  it('邪恶苹果头：不吃苹果 → 3 回合后变成爆炸苹果混入牌堆', () => {
    const e = setup(65);
    start(e, { A: 'apple', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const b = P(e, 'B');
    expect(invalid(e.useSkill('s:A', { skillId: 'apple-throw', targetSessionId: 's:B' }))).toBeUndefined();
    expect(b.appleTurns).toBe(3);
    const before = e.deck.filter((c) => c.cardId === 'exploding-apple').length;
    // 垫 10 张安全牌，推进到苹果成熟
    for (let i = 0; i < 10; i++) e.deck.push({ iid: `t-safe-${i}`, cardId: 'plain-melon' });
    for (let i = 0; i < 20 && b.appleTurns > 0; i++) {
      if (e.phase !== 'playing') break;
      if (e.subPhase === 'awaiting-nope') { e.resolveNopes(); continue; }
      if (e.subPhase === 'awaiting-defuse') { e.defusePosition(e.pendingDefuse!.sessionId, 0); continue; }
      e.drawCard(e.current()!.sessionId);
    }
    expect(b.appleTurns).toBe(0);
    expect(e.deck.filter((c) => c.cardId === 'exploding-apple').length).toBeGreaterThan(before);
    expect(e.logLines.some((l) => l.includes('熟透'))).toBe(true);
  });

  /* ---------------- v4：秀英修复 ---------------- */

  it('秀英：被功能牌（求赠）指定也减冰冻层，且卡牌效果照常生效', () => {
    const e = setup(66);
    start(e, { A: 'none', B: 'xiuying', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    const x = P(e, 'B');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    x.hand.push({ iid: 't-x-card', cardId: 'plain-melon' });
    if (!a.hand.some((c) => c.cardId === 'favor')) {
      a.hand.push({ iid: 't-favor-x', cardId: 'favor' });
    }
    const favorIid = a.hand.find((c) => c.cardId === 'favor')!.iid;
    const xHandBefore = x.hand.length;
    const aHandBefore = a.hand.length;
    const ev = e.playCard('s:A', { instanceId: favorIid, targetSessionId: 's:B' });
    expect(invalid(ev)).toBeUndefined();
    expect(x.freezeLayers).toBe(9); // 冰冻 -1
    expect(x.hand.length).toBe(xHandBefore - 1); // 求赠照常生效：被偷走一张
    expect(a.hand.length).toBe(aHandBefore); // 打出一张 + 偷到一张
    expect(e.logLines.some((l) => l.includes('冰冻 -1'))).toBe(true);
  });

  it('秀英：被帮助的回合（冰冻未归零）也能喂荔枝', () => {
    const e = setup(67);
    start(e, { A: 'xiuying', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const x = P(e, 'A');
    const b = P(e, 'B');
    const c = P(e, 'C');
    expect(invalid(e.useSkill('s:A', { skillId: 'ice-help', targetSessionId: 's:B' }))).toBeUndefined();
    const give = b.hand[0]!;
    expect(invalid(e.handleHelpRespond('s:B', { accept: true, giveInstanceId: give.iid }))).toBeUndefined();
    expect(x.freezeLayers).toBe(9);
    expect(x.helpedThisTurn).toBe(true);
    // 仍冻结（9 层）但本回合被帮助过 → 可以喂荔枝
    const ev = e.useSkill('s:A', { skillId: 'ice-lychee', targetSessionId: 's:C' });
    expect(invalid(ev)).toBeUndefined();
    expect(c.lychees).toBe(1);
  });

  /* ---------------- v4：数学老师乘法双倍修复 ---------------- */

  it('数学老师乘法：攻击的连击回合数翻倍（2→4）', () => {
    const e = setup(68);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    a.hand.push({ iid: 't-atk-mul', cardId: 'attack' });
    a.mathMulNext = 1;
    const ev = e.playCard('s:A', { instanceId: 't-atk-mul' });
    expect(invalid(ev)).toBeUndefined();
    expect(a.mathMulNext).toBe(0);
    const victim = e.current()!;
    expect(victim.sessionId).toBe('s:B');
    expect(victim.turnsLeft).toBe(4); // 2 × 2
  });

  it('数学老师乘法：预知未来翻倍为看顶 6 张', () => {
    const e = setup(69);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    a.hand.push({ iid: 't-peek-mul', cardId: 'peek' });
    a.mathMulNext = 1;
    const ev = e.playCard('s:A', { instanceId: 't-peek-mul' });
    const peekEv = ev.find(
      (x) => x.type === 'private' && (x as { message?: { action?: string } }).message?.action === 'peekDeck',
    ) as { message: { cards: unknown[] } } | undefined;
    expect(peekEv).toBeDefined();
    expect(peekEv!.message.cards).toHaveLength(6);
    expect(a.mathMulNext).toBe(0);
    expect(e.logLines.some((l) => l.includes('乘法生效'))).toBe(true);
  });

  it('数学老师乘法：摸牌底翻倍为从牌堆底摸 2 张', () => {
    const e = setup(70);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    for (let i = 0; i < 4; i++) e.deck.push({ iid: `t-top-${i}`, cardId: 'plain-melon' });
    a.hand.push({ iid: 't-bottom-mul', cardId: 'draw-bottom' });
    a.mathMulNext = 1;
    const logsBefore = e.logLines.filter((l) => l.includes('从牌堆底摸了一张牌')).length;
    const ev = e.playCard('s:A', { instanceId: 't-bottom-mul' });
    expect(invalid(ev)).toBeUndefined();
    expect(a.mathMulNext).toBe(0);
    const logsAfter = e.logLines.filter((l) => l.includes('从牌堆底摸了一张牌')).length;
    expect(logsAfter - logsBefore).toBe(2);
  });

  it('数学老师乘法：跳过这类没有加倍空间的牌不消耗标记', () => {
    const e = setup(71);
    start(e, { A: 'soup', B: 'none', C: 'none' });
    stripDanger(e);
    advanceTo(e, 'A');
    const a = P(e, 'A');
    e.players.forEach((p) => (p.hand = p.hand.filter((c) => c.cardId !== 'nope')));
    a.hand.push({ iid: 't-skip-mul', cardId: 'skip' });
    a.mathMulNext = 1;
    const ev = e.playCard('s:A', { instanceId: 't-skip-mul' });
    expect(invalid(ev)).toBeUndefined();
    expect(a.mathMulNext).toBe(1); // 标记保留给下一张功能牌
    expect(e.logLines.some((l) => l.includes('乘法生效'))).toBe(false);
  });
});
