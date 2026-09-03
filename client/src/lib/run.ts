import { RUN_BONUSES, type RunBonusId } from '@bombcat/shared';
import { createRoom } from './game';
import { getActiveBuild } from './builds';
import { sendAct } from './game';

/**
 * 无尽挑战（Run Mode）：单人 roguelike 编排层。
 * 客户端管关卡/增益/纪录；每关一个新房间（bots 填桌 + runBonuses 随 create 传入）。
 */

const RUN_KEY = 'bombcat:endlessRun';
const BEST_KEY = 'bombcat:endlessBest';

export interface RunState {
  stage: number;
  bonuses: RunBonusId[];
  alive: boolean;
}

export function loadRun(): RunState | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RUN_KEY) ?? 'null');
    if (!raw || typeof raw.stage !== 'number') return null;
    return raw as RunState;
  } catch {
    return null;
  }
}

function saveRun(run: RunState | null): void {
  if (!run) sessionStorage.removeItem(RUN_KEY);
  else sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
}

export function getBestStage(): number {
  return Number(localStorage.getItem(BEST_KEY) ?? 0);
}

function setBestStage(stage: number): void {
  if (stage > getBestStage()) localStorage.setItem(BEST_KEY, String(stage));
}

/** 开始/继续无尽挑战：创建新房间（2 bot + 增益 + 当前关卡难度） */
export async function startRunStage(
  stage: number,
  bonuses: RunBonusId[],
): Promise<void> {
  const extraExploding = Math.floor((stage - 1) / 2); // 每 2 关 +1 爆炸猫
  await createRoom('挑战者', {
    run: true,
    runBonuses: bonuses,
    extraExploding,
    bots: 2,
  } as never);
  const run: RunState = { stage, bonuses, alive: true };
  saveRun(run);
  // 带上个人构筑（如果有）
  const build = getActiveBuild();
  if (build) sendAct({ action: 'setBuild', cardIds: build.cards });
}

/** 本关获胜：从剩余未持有的增益中随机 3 个供选 */
export function offerBonuses(current: RunBonusId[]): RunBonusId[] {
  const pool = RUN_BONUSES.filter((b) => !current.includes(b.id));
  const picks: RunBonusId[] = [];
  while (picks.length < Math.min(3, pool.length)) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]!.id);
  }
  return picks;
}

/** 选中增益 → 进入下一关 */
export async function advanceStage(bonus: RunBonusId): Promise<void> {
  const run = loadRun();
  if (!run) return;
  const bonuses = [...run.bonuses, bonus];
  setBestStage(run.stage);
  await startRunStage(run.stage + 1, bonuses);
}

/** 本关失败：结算纪录，清 run */
export function endRun(): { stage: number; best: number } {
  const run = loadRun();
  const stage = run?.stage ?? 0;
  setBestStage(stage);
  saveRun(null);
  return { stage, best: getBestStage() };
}

export function clearRun(): void {
  saveRun(null);
}
