import type {
  CardDef,
  CardEffect,
  ServerMessage,
} from '@bombcat/shared';

export interface CardInstance {
  /** 实例 id（服务端生成） */
  iid: string;
  /** 对应 CardDef id */
  cardId: string;
}

export interface SkillRuntimeState {
  /** 主动技能已用次数 */
  used: number;
  /** 免疫/返还类被动已消耗次数 */
  passiveUsed: number;
}

export interface EnginePlayer {
  sessionId: string;
  userId: string;
  name: string;
  characterId: string;
  hand: CardInstance[];
  alive: boolean;
  connected: boolean;
  /** 连击剩余回合数（含当前回合） */
  turnsLeft: number;
  skillState: Record<string, SkillRuntimeState>;
  /* ---- 迭代五：策略层状态（服务端内部，不进同步 schema） ---- */
  /** 本局使用的个人构筑（true=用了 10 张自选） */
  buildUsed: boolean;
  /** 无尽挑战增益 */
  runBonuses: string[];
  /** 本回合已出牌数（连出王任务） */
  playsThisTurn: number;
  /** 拆解使用次数（拆弹部队任务） */
  defuseUsed: number;
  /** 是否打过攻击牌（和平主义任务） */
  attackedThisGame: boolean;
  /** 秘密任务 */
  objective: {
    defId: string;
    /** 比命长目标 */
    targetSessionId?: string;
    /** 计数器（偷牌数等） */
    counter: number;
    done: boolean;
  } | null;
}

export type SubPhase =
  | 'awaiting-action'
  | 'awaiting-nope'
  | 'awaiting-defuse'
  | 'awaiting-alter';

export interface PendingPlay {
  playId: string;
  sessionId: string;
  instances: CardInstance[];
  /** 单张 / 对子 / 三张 */
  combo: 'single' | 'pair' | 'triple';
  /** 引擎展开后的效果（含 combo 生成的偷牌） */
  effects: CardEffect[];
  targetSessionId?: string;
  wantCardId?: string;
  /** 交替否认的 sessionId 链 */
  nopedBy: string[];
}

export interface PendingDefuse {
  sessionId: string;
  instanceId: string;
}

export interface PendingAlter {
  sessionId: string;
  /** 重排前的牌堆顶 3 张（自顶向下） */
  cards: CardInstance[];
}

/** 引擎输出事件：房间层把它们翻译为 schema 更新与私密消息 */
export type EngineEvent =
  | { type: 'hand'; sessionId: string }
  | { type: 'log'; text: string }
  | { type: 'private'; sessionId: string; message: ServerMessage }
  | { type: 'nopeWindowOpened' }
  | { type: 'nopeWindowClosed' }
  | { type: 'turnAdvanced' }
  | { type: 'awaitingDefuse' }
  | { type: 'defuseResolved' }
  | { type: 'awaitingAlter' }
  | { type: 'alterResolved' }
  | { type: 'death'; sessionId: string }
  | { type: 'invalid'; sessionId: string; message: string }
  | {
      type: 'gameEnd';
      winnerSessionId: string;
      objectives?: Array<{
        sessionId: string;
        name: string;
        defId: string;
        defName: string;
        done: boolean;
      }>;
    };

export interface PlayCardInput {
  instanceId: string;
  comboInstanceIds?: string[];
  targetSessionId?: string;
  wantCardId?: string;
  asNope?: boolean;
}

export interface UseSkillInput {
  skillId: string;
  costInstanceIds?: string[];
  targetSessionId?: string;
  wantCardId?: string;
}

export interface GameEndInfo {
  winnerName: string;
  ranking: Array<{ sessionId: string; name: string; place: number }>;
}

/** 卡牌定义查找（内置 + 本局自定义） */
export type CardLookup = (cardId: string) => CardDef | undefined;
