/**
 * 炸弹猫共享类型定义（前后端共用）
 *
 * 设计原则：卡牌效果与角色技能全部「数据驱动」——
 * 卡牌 = 效果原语组合；角色 = 触发器 + 有界技能原型。
 * 服务端与客户端都只认这里定义的结构，自定义内容经
 * validation.ts 校验后才被服务端接受。
 */

/* ============================== 卡牌效果原语 ============================== */

/**
 * 效果原语：任意卡牌（含自定义卡）的效果只能由下列原语组合而成。
 * 引擎按顺序结算一张卡的全部效果。
 */
export type CardEffectType =
  | 'skip' // 结束回合且不摸牌
  | 'attack' // 结束回合，下一位玩家连走 2 回合
  | 'targetedAttack' // 结束回合，指定某位玩家连走 2 回合
  | 'shuffle' // 洗牌堆
  | 'peek' // 私密查看牌堆顶 count 张（默认 3）
  | 'alterFuture' // 查看并重排牌堆顶 3 张
  | 'stealRandom' // 从目标玩家偷 1 张随机手牌
  | 'stealNamed' // 从目标玩家偷 1 张指定名称的牌（需提供 cardId）
  | 'peekHand' // 私密查看目标玩家全部手牌
  | 'swapHand' // 与目标玩家交换全部手牌
  | 'drawFromBottom' // 从牌堆底摸 1 张（不结束回合）
  | 'reverse' // 反转出牌方向
  | 'selfDraw'; // 立即额外摸 count 张（不结束回合）

/** 允许自定义卡牌使用的效果子集（排除会影响公平的内部原语） */
export const CUSTOM_CARD_ALLOWED_EFFECTS: readonly CardEffectType[] = [
  'skip',
  'attack',
  'targetedAttack',
  'shuffle',
  'peek',
  'alterFuture',
  'stealRandom',
  'stealNamed',
  'peekHand',
  'swapHand',
  'drawFromBottom',
  'reverse',
  'selfDraw',
];

export interface CardEffect {
  type: CardEffectType;
  /** 数量类效果使用（peek/selfDraw 的张数） */
  count?: number;
  /** stealNamed 要偷的牌 id */
  cardId?: string;
}

/* ============================== 卡牌 ============================== */

export type CardKind = 'exploding' | 'defuse' | 'action' | 'plain' | 'streaking';

export interface CardDef {
  /** 唯一 id；内置卡为短名，自定义卡必须带 "custom:" 前缀 */
  id: string;
  name: string;
  kind: CardKind;
  /** 前端默认显示的 emoji（卡面可被皮肤替换） */
  emoji: string;
  description: string;
  effects: CardEffect[];
  /** plain 卡默认可作为对子/三张组合打出 */
  comboable?: boolean;
  /** 万能猫：可与任意 plain 卡组合成对子/三连（feral 规则） */
  feral?: boolean;
  /** 前端主题色（可选） */
  color?: string;
}

/* ============================== 卡组 ============================== */

export interface DeckDef {
  id: string;
  name: string;
  description?: string;
  /** 自定义新增的卡牌定义 */
  customCards: CardDef[];
  /** cardId -> 张数（内置卡与自定义卡都记在这里） */
  counts: Record<string, number>;
  /**
   * 覆盖爆炸猫张数；默认 = 玩家数 - 1。
   * 出于防作弊考虑，自定义卡组不允许定义 exploding/defuse 的张数。
   */
  explodingCount?: number;
}

/* ============================== 角色与技能 ============================== */

/** 技能触发时机（引擎在这些结算点调用技能） */
export type SkillTrigger =
  | 'gameStart' // 游戏开始时
  | 'turnStart' // 自己回合开始时
  | 'onStolenFrom' // 自己被偷牌时
  | 'onNoped' // 自己打出的牌被否认时
  | 'active'; // 主动使用（自己出牌阶段）

/**
 * 技能效果原型（有界集合）：自定义角色只能从这些原型中组合，
 * 引擎逐一实现，保证任意组合都能被正确结算。
 */
export type SkillEffect =
  | { kind: 'gainCardAtStart'; cardId: string; count: number } // 开局获得指定牌
  | { kind: 'peekAtTurnStart'; count: number } // 回合开始看牌堆顶 N 张
  | { kind: 'immuneSteal'; times: number } // 前 N 次被偷牌无效
  | { kind: 'returnNoped'; times: number } // 前 N 张被否认的牌返还手牌
  | { kind: 'activeSteal'; costCards: number; named: boolean; uses: number } // 主动：弃 cost 张偷 1 张（named=可指定牌名）
  | { kind: 'activeRecycle'; costCards: number; uses: number } // 主动：弃 cost 张，从弃牌堆顶拿回 1 张
  | { kind: 'startWithSkip'; count: number }; // 开局获得跳过（gainCardAtStart 的糖）

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  trigger: SkillTrigger;
  effect: SkillEffect;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  emoji: string;
  description: string;
  skills: SkillDef[];
}

/* ============================== 卡面皮肤（纯客户端装饰） ============================== */

export interface CardSkin {
  cardId: string;
  /** dataURL 或 Supabase Storage 公开 URL */
  imageUrl: string;
}

export interface SkinPack {
  id: string;
  name: string;
  /** 皮肤对应的卡组无关，按 cardId 覆盖显示 */
  skins: CardSkin[];
}

/* ============================== 房间与对局 ============================== */

export type GamePhase =
  | 'lobby' // 等待玩家/选角色
  | 'playing' // 对局中
  | 'finished'; // 已结束

/** 出牌后等待「否认」的窗口子状态 */
export type PlayingSubPhase =
  | 'awaiting-action' // 当前玩家自由行动
  | 'awaiting-nope' // 有人出牌，等待否认窗口结束
  | 'awaiting-defuse' // 有人摸到爆炸猫，等待放回位置
  | 'awaiting-alter' // 等待重排牌堆顶
  | 'awaiting-target'; // 等待出牌者选择目标玩家

export const NOPE_WINDOW_MS = 8000;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const HAND_SIZE_AT_START = 7; // 含 1 张拆解
/** 拆解总量：≤6 人固定 6 张；更多人时每人保底 1 张 */
export function defuseTotal(playerCount: number): number {
  return Math.max(6, playerCount);
}

/* ============================== 协议消息 ============================== */

/** 客户端 → 服务端 */
export type ClientMessage =
  | { action: 'startGame' }
  | { action: 'setCharacter'; characterId: string | null }
  | {
      action: 'setDeck';
      deck: DeckDef | null;
    } // null = 经典卡组（仅房主）
  | { action: 'setBuild'; cardIds: string[] } // 个人出战构筑（10 张，开局前）
  | {
      action: 'playCard';
      instanceId: string;
      /** 需要目标的卡必须给 */
      targetSessionId?: string;
      /** stealNamed 需要 */
      wantCardId?: string;
      /** 对子/三张组合：额外弃置的同名 plain 牌 */
      comboInstanceIds?: string[];
      /** 否认窗口内打出否认牌 */
      asNope?: boolean;
    }
  | { action: 'draw' } // 结束回合并摸牌
  | { action: 'defusePosition'; position: number } // 爆炸猫放回牌堆的位置（0=顶）
  | { action: 'alterFuture'; order: number[] } // 重排牌堆顶 N 张的新顺序（旧索引，自顶向下）
  | {
      action: 'useSkill';
      skillId: string;
      costInstanceIds?: string[];
      targetSessionId?: string;
      wantCardId?: string;
    };

/** 服务端 → 客户端（私密/一次性消息；公开状态走 schema 同步） */
export type ServerMessage =
  | { action: 'hand'; cards: HandCard[] } // 你的手牌（全量）
  | { action: 'peekDeck'; cards: CardDef[]; playId?: string } // 私密看牌
  | { action: 'peekHand'; playerName: string; cards: CardDef[] }
  | { action: 'alterPrompt'; cards: CardDef[] } // 请重排这 3 张
  | { action: 'promptDefuse'; deckCount: number } // 请选择爆炸猫放回位置
  | { action: 'error'; message: string }
  | { action: 'notice'; text: string } // 私密提示（如藏猫通知，不进公开日志语义）
  | { action: 'objectiveDone'; defId: string; defName: string } // 秘密任务达成
  | { action: 'objective'; defId: string; defName: string; description: string; targetName?: string } // 秘密任务下发
  | {
      action: 'gameEnd';
      winnerName: string;
      ranking: Array<{ sessionId: string; name: string; place: number }>;
      objectives?: Array<{ sessionId: string; name: string; defId: string; defName: string; done: boolean }>;
    };

/** 手牌中的单张实例（发给本人时带定义） */
export interface HandCard {
  instanceId: string;
  def: CardDef;
}
