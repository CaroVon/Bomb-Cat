import { OBJECTIVES, OBJECTIVE_MAP } from '@bombcat/shared';
import type { EngineEvent, EnginePlayer } from './types';

/** 秘密任务辅助方法（挂到 GameEngine 原型上，与类主体分离便于维护） */

export function assignObjectives(
  players: EnginePlayer[],
  shuffle: <T>(a: T[]) => T[],
): void {
  // 允许重复抽取（多人可能拿到同款任务，无所谓）
  for (const p of players) {
    let def = OBJECTIVES[Math.floor(Math.random() * OBJECTIVES.length)]!;
    // 2 人局不能出「比命长」（无第三方目标差）——换成偷牌大师
    if (def.needsTarget && players.length < 3) def = OBJECTIVE_MAP.get('steal-3')!;
    const targetSessionId = def.needsTarget
      ? players.filter((x) => x.sessionId !== p.sessionId)[0]?.sessionId
      : undefined;
    p.objective = { defId: def.id, targetSessionId, counter: 0, done: false };
  }
}

export function completeObjective(p: EnginePlayer, events: EngineEvent[]): void {
  if (!p.objective || p.objective.done) return;
  p.objective.done = true;
  const def = OBJECTIVE_MAP.get(p.objective.defId);
  events.push({
    type: 'private',
    sessionId: p.sessionId,
    message: { action: 'objectiveDone', defId: p.objective.defId, defName: def?.name ?? '' },
  });
}

export function objectiveSteal(p: EnginePlayer, events: EngineEvent[]): void {
  const o = p.objective;
  if (!o || o.done) return;
  if (o.defId === 'steal-3') {
    o.counter += 1;
    if (o.counter >= 3) completeObjective(p, events);
  }
  objectiveHandCheck(p, events);
}

export function objectiveHandCheck(p: EnginePlayer, events: EngineEvent[]): void {
  const o = p.objective;
  if (!o || o.done) return;
  if (o.defId === 'hand-10' && p.hand.length >= 10) completeObjective(p, events);
}

export function objectivePlay(p: EnginePlayer, events: EngineEvent[]): void {
  const o = p.objective;
  if (!o || o.done) return;
  if (o.defId === 'combo-3') {
    p.playsThisTurn += 1;
    if (p.playsThisTurn >= 3) completeObjective(p, events);
  }
  objectiveHandCheck(p, events);
}

export function objectiveDefuse(p: EnginePlayer, events: EngineEvent[]): void {
  const o = p.objective;
  if (!o || o.done) return;
  if (o.defId === 'defuse-2') {
    p.defuseUsed += 1;
    if (p.defuseUsed >= 2) completeObjective(p, events);
  }
}

export function objectiveReport(
  players: EnginePlayer[],
): Array<{ sessionId: string; name: string; defId: string; defName: string; done: boolean }> {
  return players.map((p) => ({
    sessionId: p.sessionId,
    name: p.name,
    defId: p.objective?.defId ?? '',
    defName: OBJECTIVE_MAP.get(p.objective?.defId ?? '')?.name ?? '',
    done: p.objective?.done ?? false,
  }));
}
