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
  | { kind: 'alter'; order: number[] };

const rand = () => Math.random();

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
    // 爆炸猫排到最后（摸到的顺序最晚）
    const cards = e.pendingAlter.cards;
    const normal: number[] = [];
    const booms: number[] = [];
    cards.forEach((c, i) => (c.cardId === 'exploding' ? booms : normal).push(i));
    return { kind: 'alter', order: [...normal, ...booms] };
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

  const aliveOthers = e.players.filter((p) => p.alive && p.sessionId !== sid);
  const aliveCount = e.players.filter((p) => p.alive).length;
  // 信念：剩余爆炸猫 ≈ 存活人数 - 1（近似，不作弊）
  const danger = (aliveCount - 1) / Math.max(e.deck.length, 1);
  const hasDefuse = has('defuse');
  const top = knownTop?.[0] ?? null;

  // 已知顶牌是爆炸猫 → 优先规避
  if (top === 'exploding' && !hasDefuse) {
    if (has('skip')) return { kind: 'play', instanceId: pick('skip') };
    if (has('attack')) return { kind: 'play', instanceId: pick('attack') };
    if (has('shuffle')) return { kind: 'play', instanceId: pick('shuffle') };
    return { kind: 'draw' }; // 认命
  }
  if (top === 'exploding' && hasDefuse && rand() < 0.5 && has('skip')) {
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
  if (combo && rand() < 0.6) {
    const target = strongest(aliveOthers);
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
