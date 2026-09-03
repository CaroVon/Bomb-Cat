import { BUILTIN_CARD_MAP } from './cards';
import type { CardDef } from './types';

/**
 * 局内规则（World Rule）与秘密任务（Secret Objective）定义。
 * 全部数据驱动、挂在既有结算点上，架构与角色技能钩子同构。
 */

/* ============================== World Rule ============================== */

export interface WorldRuleDef {
  id: string;
  emoji: string;
  name: string;
  description: string;
}

/** 第一批：混乱欢乐池 */
export const WORLD_RULES: WorldRuleDef[] = [
  {
    id: 'mad-draw',
    emoji: '🌀',
    name: '疯狂抽卡',
    description: '打出「跳过」后必须额外摸一张牌——跳过变成"换一张"。',
  },
  {
    id: 'double-down',
    emoji: '🎰',
    name: '双倍下注',
    description: '结束回合时摸 2 张牌而不是 1 张。双倍的炸弹压力，双倍的刺激。',
  },
  {
    id: 'pass-joy',
    emoji: '🎁',
    name: '传递快乐',
    description: '每个回合开始时，当前玩家手牌中随机一张传给下家。',
  },
  {
    id: 'defuse-plenty',
    emoji: '🔧',
    name: '防爆过剩',
    description: '牌堆额外混入 2 张拆解。',
  },
  {
    id: 'overdrive',
    emoji: '⚡',
    name: '火力全开',
    description: '攻击造成的连击回合从 2 个翻倍到 4 个。',
  },
  {
    id: 'all-seeing',
    emoji: '👁️',
    name: '全员天眼',
    description: '每个回合开始时，当前玩家私密查看牌堆顶 1 张牌。',
  },
];

export const WORLD_RULE_MAP: ReadonlyMap<string, WorldRuleDef> = new Map(
  WORLD_RULES.map((r) => [r.id, r]),
);

/* ============================== 秘密任务 ============================== */

export interface ObjectiveDef {
  id: string;
  emoji: string;
  name: string;
  description: string;
  /** 需要指定目标玩家（比命长） */
  needsTarget?: boolean;
}

export const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'steal-3',
    emoji: '🤏',
    name: '偷牌大师',
    description: '累计偷到 3 张牌（求赠/组合/技能均可）。',
  },
  {
    id: 'hand-10',
    emoji: '💰',
    name: '手牌大亨',
    description: '任一时刻手牌达到 10 张。',
  },
  {
    id: 'outlive',
    emoji: '🏃',
    name: '比命长',
    description: '活过系统指定的那名玩家（TA 出局时你还活着）。',
    needsTarget: true,
  },
  {
    id: 'pacifist',
    emoji: '🕊️',
    name: '和平主义',
    description: '整局不打任何攻击牌，并活到只剩 3 名玩家。',
  },
  {
    id: 'combo-3',
    emoji: '🎬',
    name: '连出王',
    description: '在单个回合内打出 3 张牌。',
  },
  {
    id: 'defuse-2',
    emoji: '🔧',
    name: '拆弹部队',
    description: '使用 2 次拆解。',
  },
];

export const OBJECTIVE_MAP: ReadonlyMap<string, ObjectiveDef> = new Map(
  OBJECTIVES.map((o) => [o.id, o]),
);

/** 任务完成奖励积分（接入 stats 积分体系） */
export const OBJECTIVE_BONUS_POINTS = 50;

/* ============================== 出战构筑 ============================== */

export const BUILD_SIZE = 10;
/** 构筑中同卡最多张数 */
export const BUILD_MAX_COPIES = 2;
/** 构筑进入起手的张数（其余洗入公共堆） */
export const BUILD_HAND_CARDS = 6;

/**
 * 校验个人出战构筑：恰好 10 张、卡存在、kind 为 action/plain（禁拆解/爆炸/果奔）、同卡 ≤2。
 * cardPool 为本局可用卡定义（内置 + 房主自定义）。
 */
export function validateBuild(
  cardIds: unknown,
  cardPool: Map<string, CardDef>,
): { ok: boolean; error?: string } {
  if (!Array.isArray(cardIds) || cardIds.length !== BUILD_SIZE) {
    return { ok: false, error: `构筑必须恰好 ${BUILD_SIZE} 张` };
  }
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    if (typeof id !== 'string') return { ok: false, error: '构筑内含非法卡' };
    const def = cardPool.get(id) ?? BUILTIN_CARD_MAP.get(id);
    if (!def) return { ok: false, error: `卡 ${id} 不在本局卡池` };
    if (def.kind !== 'action' && def.kind !== 'plain') {
      return { ok: false, error: `${def.name} 不能进入构筑（仅动作牌与普通猫）` };
    }
    const n = (counts.get(id) ?? 0) + 1;
    if (n > BUILD_MAX_COPIES) {
      const name = def.name;
      return { ok: false, error: `${name} 最多带 ${BUILD_MAX_COPIES} 张` };
    }
    counts.set(id, n);
  }
  return { ok: true };
}

/* ============================== 无尽挑战增益 ============================== */

export type RunBonusId =
  | 'extra-deal' // +1 起手牌
  | 'extra-defuse' // 开局多 1 张拆解
  | 'steal-immune' // 首次被偷免疫
  | 'start-peek' // 开局看牌堆顶 3 张
  | 'boom-shield'; // 首次爆炸免死（弃光手牌，爆炸猫放回堆顶）

export interface RunBonusDef {
  id: RunBonusId;
  emoji: string;
  name: string;
  description: string;
}

export const RUN_BONUSES: RunBonusDef[] = [
  { id: 'extra-deal', emoji: '🃏', name: '厚实起手', description: '起手牌 +1 张。' },
  { id: 'extra-defuse', emoji: '🔧', name: '随身工具箱', description: '开局额外获得 1 张拆解。' },
  { id: 'steal-immune', emoji: '🛡️', name: '第一次防偷', description: '本局第一次被偷牌时无效。' },
  { id: 'start-peek', emoji: '👁️', name: '先知', description: '开局私密查看牌堆顶 3 张。' },
  { id: 'boom-shield', emoji: '😇', name: '免死金牌', description: '第一次爆炸时免死：弃光手牌，爆炸猫放回牌堆顶。' },
];

export const RUN_BONUS_MAP: ReadonlyMap<string, RunBonusDef> = new Map(
  RUN_BONUSES.map((b) => [b.id, b]),
);
