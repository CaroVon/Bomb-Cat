import type { GameEngine } from '../engine/Engine.js';

/**
 * 规则打分 AI（参考 RLCard 的 UNO rule-based agent 思路 + 概率信念建模）：
 * 高随机性游戏中启发式足够，MCTS 收益极低。
 * 决策输入为引擎公开视角 + 机器人通过 peek 获得的记忆（不作弊读牌堆）。
 */

export type BotDecision =
  | { kind: 'play'; instanceId: string; comboInstanceIds?: string[]; targetSessionId?: string; wantCardId?: string }
  | { kind: 'draw' }
  | { kind: 'defuse'; position: number }
  | { kind: 'alter'; order: number[] }
  | { kind: 'bananaAction'; cardId: string; costInstanceIds: string[] }
  | { kind: 'iceHelp'; targetSessionId: string }
  | { kind: 'appleEat'; giveInstanceId: string }
  | { kind: 'butcherCleave'; skillId: string; targetSessionId: string }
  | { kind: 'driverSkill'; skillId: string; targetSessionId: string }
  | { kind: 'juliaSkill'; skillId: string; investInstanceIds?: string[] }
  | { kind: 'sheepDream'; skillId: string }
  | { kind: 'dreamPick'; cardId: string; giveTo?: string };

/** 懒懒羊选梦：好梦留给自己，噩梦/梦游塞给手牌最多的对手 */
const GOOD_DREAMS = ['dream-snooze', 'dream-fleece', 'dream-sense', 'dream-weave'];

const rand = () => Math.random();

/** 爆炸类卡（爆炸猫 / 爆炸苹果），按 cardId 判断（bot 侧无 cardMap 便捷访问） */
const isBoom = (cardId: string): boolean =>
  cardId === 'exploding' || cardId === 'exploding-apple';

export function decide(
  e: GameEngine,
  sid: string,
  knownTop: string[] | null,
): BotDecision | null {
  if (e.phase !== 'playing') return null;

  if (e.subPhase === 'awaiting-defuse') {
    if (e.pendingDefuse?.sessionId !== sid) return null;
    // 偏好埋深（避开下一轮；带少量随机防被读）
    const deck = e.deck.length;
    const position = Math.max(0, Math.min(deck, deck - Math.floor(rand() * 6)));
    return { kind: 'defuse', position };
  }

  if (e.subPhase === 'awaiting-alter') {
    if (e.pendingAlter?.sessionId !== sid) return null;
    // 爆炸猫/爆炸苹果排到最后（摸到的顺序最晚）
    const cards = e.pendingAlter.cards;
    const normal: number[] = [];
    const booms: number[] = [];
    cards.forEach((c, i) => (isBoom(c.cardId) ? booms : normal).push(i));
    return { kind: 'alter', order: [...normal, ...booms] };
  }

  if (e.subPhase === 'awaiting-dream') {
    const pd = e.pendingDreamInfo;
    if (!pd || pd.sessionId !== sid) return null;
    const good = pd.options.find((id) => GOOD_DREAMS.includes(id));
    if (good) return { kind: 'dreamPick', cardId: good };
    const bad = pd.options[0]!;
    const rival = strongest(e.players.filter((p) => p.alive && p.sessionId !== sid));
    return rival ? { kind: 'dreamPick', cardId: bad, giveTo: rival } : { kind: 'dreamPick', cardId: bad };
  }

  if (e.subPhase !== 'awaiting-action') return null;
  const me = e.current();
  if (!me || me.sessionId !== sid) return null;

  const hand = me.hand;
  const byId = new Map<string, typeof hand>();
  for (const c of hand) {
    const list = byId.get(c.cardId) ?? [];
    list.push(c);
    byId.set(c.cardId, list);
  }
  const has = (id: string) => (byId.get(id)?.length ?? 0) > 0;
  const pick = (id: string) => byId.get(id)![0]!.iid;

  // 邪恶苹果：身上有苹果时，剩 1 回合必吃，否则 50% 概率吃掉（给出最便宜的牌）
  if (me.appleTurns > 0 && hand.length > 0) {
    const mustEat = me.appleTurns <= 1;
    if (mustEat || rand() < 0.5) {
      const plain = hand.find((c) => e.cardMap.get(c.cardId)?.kind === 'plain');
      const give = plain ?? hand[hand.length - 1]!;
      return { kind: 'appleEat', giveInstanceId: give.iid };
    }
  }

  // 被屠夫封锁：功能牌与技能都用不了，只能摸牌
  if (me.lockedBy) return { kind: 'draw' };

  // 秀英冰冻：无法出牌/摸牌 → 优先向还没问过的玩家求助，否则结束回合
  if (me.freezeLayers > 0 && !me.helpedThisTurn) {
    const askable = e.players.filter(
      (p) => p.alive && p.sessionId !== sid && !me.askedHelp.includes(p.sessionId),
    );
    const helpSkill = e.characterMap
      .get(me.characterId)
      ?.skills.find((s) => s.effect.kind === 'iceHelp');
    if (helpSkill && askable.length > 0 && rand() < 0.85) {
      const target = askable[Math.floor(rand() * askable.length)]!;
      return { kind: 'iceHelp', targetSessionId: target.sessionId };
    }
    return { kind: 'draw' };
  }

  // 香蕉覆盖期间：组合被禁用
  // - 香蕉女王只能靠兑换出牌（2 张香蕉 = 任意技能牌）
  // - 其他人只能盲打单牌（随机抽一张，猫/拆解/否认会直接进弃牌堆）
  if (e.bananaOverlayTurns > 0) {
    if (me.characterId === 'banana') {
      if (hand.length >= 2 && rand() < 0.85) {
        const choice = ['skip', 'shuffle'].find((id) => e.cardMap.has(id));
        if (choice) {
          return { kind: 'bananaAction', cardId: choice, costInstanceIds: hand.slice(0, 2).map((c) => c.iid) };
        }
      }
      return { kind: 'draw' };
    }
    if (hand.length > 0 && rand() < 0.5) {
      const c = hand[Math.floor(rand() * hand.length)]!;
      return { kind: 'play', instanceId: c.iid };
    }
    return { kind: 'draw' };
  }

  const aliveOthers = e.players.filter((p) => p.alive && p.sessionId !== sid);

  // 屠夫：层数够就剔骨——封锁手牌最多、不在冷却中的对手（避开冰冻的秀英）
  const cleave = e.characterMap
    .get(me.characterId)
    ?.skills.find((s) => s.effect.kind === 'butcherCleave');
  if (cleave && cleave.effect.kind === 'butcherCleave' && me.boneStacks >= cleave.effect.cost) {
    const targets = aliveOthers.filter(
      (p) => (me.butcherTargetCd[p.sessionId] ?? 0) <= 0 && p.freezeLayers <= 0 && !p.lockedBy,
    );
    const t = strongest(targets);
    if (t && rand() < 0.8) return { kind: 'butcherCleave', skillId: cleave.id, targetSessionId: t };
  }
  // 司机小贾：上车——邀请手牌最多、本回合没问过、没冰冻、不在车上的人
  if (me.characterId === 'driver') {
    const ride = e.characterMap.get('driver')?.skills.find((s) => s.effect.kind === 'driverRide');
    if (ride && (me.skillCooldowns[ride.id] ?? 0) <= 0) {
      const riders = aliveOthers.filter(
        (p) => !me.askedRide.includes(p.sessionId) && p.freezeLayers <= 0 && !p.freeRide && p.hand.length > 0,
      );
      const t = strongest(riders);
      if (t && rand() < 0.75) return { kind: 'driverSkill', skillId: ride.id, targetSessionId: t };
    }
    // 变道：偶尔把自己和下家对调（避开下一轮的攻击落点）
    const lane = e.characterMap.get('driver')?.skills.find((s) => s.effect.kind === 'driverLane');
    if (lane && (me.skillCooldowns[lane.id] ?? 0) <= 0 && aliveOthers.length >= 2 && rand() < 0.2) {
      return { kind: 'driverSkill', skillId: lane.id, targetSessionId: sid };
    }
  }

  const aliveCount0 = e.players.filter((p) => p.alive).length;
  const danger0 = (aliveCount0 + 2) / Math.max(e.deck.length, 1);

  // Julia 姐：没持仓且冷却好、手里 ≥2 张普通猫 → 35% 拿 1~2 张猫建仓；持仓且大盘 ≤ −2 → 平仓止损
  if (me.characterId === 'julia') {
    const skills = e.characterMap.get('julia')?.skills ?? [];
    const invest = skills.find((s) => s.effect.kind === 'juliaInvest');
    const cashout = skills.find((s) => s.effect.kind === 'juliaCashout');
    if (me.portfolio.length > 0) {
      if (cashout && me.market <= -2) return { kind: 'juliaSkill', skillId: cashout.id };
    } else if (invest && (me.skillCooldowns[invest.id] ?? 0) <= 0) {
      const cats = hand.filter((c) => e.cardMap.get(c.cardId)?.kind === 'plain');
      if (cats.length >= 2 && rand() < 0.35) {
        const n = rand() < 0.5 ? 1 : 2;
        return { kind: 'juliaSkill', skillId: invest.id, investInstanceIds: cats.slice(0, n).map((c) => c.iid) };
      }
    }
  }

  // 懒懒羊：危险度高时 60% 数羊入梦
  if (me.characterId === 'lazy_sheep') {
    const dream = e.characterMap.get('lazy_sheep')?.skills.find((s) => s.effect.kind === 'sheepDream');
    if (dream && (me.skillCooldowns[dream.id] ?? 0) <= 0 && !me.mustPlayIid && danger0 > 0.3 && rand() < 0.6) {
      return { kind: 'sheepDream', skillId: dream.id };
    }
  }

  // 梦境牌：噩梦尽快扔掉；危险时回笼觉 / 造梦；偶尔预知梦（羊毛毯是被动，绝不主动打）
  if (has('dream-nightmare') && rand() < 0.8) return { kind: 'play', instanceId: pick('dream-nightmare') };
  if (danger0 > 0.3) {
    if (has('dream-weave') && rand() < 0.6) return { kind: 'play', instanceId: pick('dream-weave') };
    if (has('dream-snooze') && rand() < 0.6) return { kind: 'play', instanceId: pick('dream-snooze') };
  }
  if (danger0 > 0.2 && has('dream-sense') && rand() < 0.3) return { kind: 'play', instanceId: pick('dream-sense') };

  // 屠夫压制：对被自己封锁的玩家，偷牌/攻击翻倍
  const suppressed = aliveOthers.find((p) => p.lockedBy === sid && p.hand.length > 0);
  const nextId = e.nextAliveSessionId();
  if (me.characterId === 'butcher' && has('attack') && aliveOthers.some((p) => p.lockedBy === sid && p.sessionId === nextId) && rand() < 0.7) {
    return { kind: 'play', instanceId: pick('attack') };
  }

  const aliveCount = e.players.filter((p) => p.alive).length;
  // 信念：剩余爆炸猫 ≈ 存活人数 + 2（近似，不作弊）
  const danger = (aliveCount + 2) / Math.max(e.deck.length, 1);
  const hasDefuse = has('defuse');
  const top = knownTop?.[0] ?? null;

  // 已知顶牌是爆炸猫 → 优先规避
  if (isBoom(top ?? '') && !hasDefuse) {
    if (has('skip')) return { kind: 'play', instanceId: pick('skip') };
    if (has('attack')) return { kind: 'play', instanceId: pick('attack') };
    if (has('shuffle')) return { kind: 'play', instanceId: pick('shuffle') };
    return { kind: 'draw' }; // 认命
  }
  if (isBoom(top ?? '') && hasDefuse && rand() < 0.5 && has('skip')) {
    return { kind: 'play', instanceId: pick('skip') }; // 有拆解也省着用
  }

  // 危险度高：跳过/攻击规避
  if (danger > 0.3 && !hasDefuse) {
    if (has('skip') && rand() < 0.6) return { kind: 'play', instanceId: pick('skip') };
    if (has('attack') && rand() < 0.5) {
      const target = strongest(aliveOthers);
      if (target) return { kind: 'play', instanceId: pick('attack'), targetSessionId: target };
    }
  }

  // 组合偷牌（含万能猫通配）
  const combo = findCombo(e, hand);
  if (combo && rand() < (suppressed ? 0.9 : 0.6)) {
    const target = suppressed?.sessionId ?? strongest(aliveOthers);
    if (target) {
      if (combo.length === 3) {
        const want = pickWantCardId(e, aliveOthers);
        if (want) {
          return {
            kind: 'play',
            instanceId: combo[0]!,
            comboInstanceIds: combo.slice(1),
            targetSessionId: target,
            wantCardId: want,
          };
        }
      } else {
        return { kind: 'play', instanceId: combo[0]!, comboInstanceIds: combo.slice(1), targetSessionId: target };
      }
    }
  }

  // 未知顶牌且危险：peek 探路
  if (!top && danger > 0.2 && has('peek') && rand() < 0.5) {
    return { kind: 'play', instanceId: pick('peek') };
  }

  return { kind: 'draw' };
}

function strongest(others: { sessionId: string; hand: unknown[]; alive: boolean }[]): string | undefined {
  if (others.length === 0) return undefined;
  return [...others].sort((a, b) => b.hand.length - a.hand.length)[0]!.sessionId;
}

/** 找 2-3 张可组合的普通猫（同名 或 万能猫通配） */
function findCombo(
  e: GameEngine,
  hand: { iid: string; cardId: string }[],
): string[] | null {
  const plains = hand.filter((c) => {
    const d = e.cardMap.get(c.cardId);
    return d?.kind === 'plain' && d.comboable;
  });
  if (plains.length < 2) return null;
  // 同名对子
  const groups = new Map<string, string[]>();
  for (const c of plains) {
    const g = groups.get(c.cardId) ?? [];
    g.push(c.iid);
    groups.set(c.cardId, g);
  }
  for (const [id, g] of groups) {
    if (g.length >= 2 && !e.cardMap.get(id)?.feral) return g.slice(0, g.length >= 3 ? 3 : 2);
  }
  // 万能猫通配：feral + 任意 plain（或 feral×2）
  const feral = plains.find((c) => e.cardMap.get(c.cardId)?.feral);
  if (feral) {
    const other = plains.find((c) => c.iid !== feral.iid);
    if (other) return [feral.iid, other.iid];
  }
  return null;
}

/** 三连指名偷：优先偷拆解，其次攻击/跳过 */
function pickWantCardId(
  e: GameEngine,
  others: { hand: { cardId: string }[] }[],
): string | undefined {
  const pool = ['defuse', 'attack', 'skip', 'peek', 'nope'];
  const all = new Set<string>();
  others.forEach((o) => o.hand.forEach((c) => all.add(c.cardId)));
  for (const id of pool) {
    if (all.has(id) && e.cardMap.has(id)) return id;
  }
  return 'skip';
}
