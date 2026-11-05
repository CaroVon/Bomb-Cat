import type {
  CardDef,
  CardEffect,
  ServerMessage,
  LocMsg,
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
  /* ---- 迭代五：策略层状态 ---- */
  buildUsed: boolean;
  runBonuses: string[];
  playsThisTurn: number;
  defuseUsed: number;
  attackedThisGame: boolean;
  objective: {
    defId: string;
    targetSessionId?: string;
    counter: number;
    done: boolean;
  } | null;
  /* ---- v2：五角色新状态 ---- */
  skillCooldowns: Record<string, number>;
  permanentDead: boolean;
  tearCount: number;
  digestion: { card: CardInstance; turnsLeft: number } | null;
  digestCount: number;
  fullTurns: number;
  forcedDraws: number;
  mustPlayIid: string | null;
  isAngry: boolean;
  rippleUsedThisTurn: boolean;
  /** bigEye 档案：该玩家被监视者积累的档案数（记在被监视者身上） */
  archives: number;
  /* ---- v3：数学老师 / 秀英 ---- */
  /** 减法标记：下一次摸牌少摸 1 张（可叠加） */
  mathSubDraw: number;
  /** 乘法标记：下一张功能牌效果触发两次（可叠加） */
  mathMulNext: number;
  /** 除法标记：下一张功能牌无法触发（可叠加，与乘法同存时除法优先） */
  mathDivNext: number;
  /** 秀英冰冻层数（0 = 已解冻，正常行动） */
  freezeLayers: number;
  /** 秀英：本回合获得过帮助（即使仍有冰冻层也可正常出牌/摸牌） */
  helpedThisTurn: boolean;
  /** 秀英荔枝数（2 颗兑换一张随机普通猫后清零） */
  lychees: number;
  /** 本回合已求助过的玩家（防止重复问同一人） */
  askedHelp: string[];
  /** 本回合已喂出的荔枝数（每回合上限） */
  lycheeGivenThisTurn: number;
  /* ---- v4：邪恶苹果头 ---- */
  /** 身上邪恶苹果的剩余回合（0=没有；3→2→1→0，为 0 时下个回合开始变成爆炸苹果入牌堆） */
  appleTurns: number;
  /** 苹果是谁投的（吃苹果时把手牌交给他） */
  appleFrom: string;
  /* ---- v5：屠夫 ---- */
  /** 屠夫剔骨层数（仅屠夫本人有意义） */
  boneStacks: number;
  /** 屠夫对各目标的剩余冷却（按屠夫自己的回合递减） */
  butcherTargetCd: Record<string, number>;
  /** 被哪位屠夫封锁（'' = 未封锁）；持续到被封锁者的下一回合结束 */
  lockedBy: string;
  /* ---- v6：司机小贾 ---- */
  /** 小贾累计收到的车费份数 */
  fares: number;
  /** 小贾「撞大运」层数（摸到爆炸牌时自动消耗 1 层放回牌堆） */
  luckCharges: number;
  /** 乘客：下一回合结束时不用摸牌 */
  freeRide: boolean;
  /** 小贾本回合已邀请过的玩家（被拒后不能重复问同一人） */
  askedRide: string[];
  /* ---- v7：Julia 姐 / 懒懒羊 ---- */
  /** Julia 投资组合（不在手牌里：不会被偷/求赠/吞噬，也不能打出） */
  portfolio: CardInstance[];
  /** 距离自动交割还剩几个本人回合（0 = 无持仓） */
  portfolioTurns: number;
  /** Julia 的大盘（有持仓期间：功能/梦境牌 +1，猫牌/否认 −1） */
  market: number;
  /** 懒懒羊：梦乡中（别人对她的偷牌落空，她不能打否认），直到她的下一回合开始 */
  asleep: boolean;
  /** 梦游：下一回合开始时自动随机打出一张功能牌 */
  sleepwalk: boolean;
  /** 回笼觉：下一次摸牌要多摸的张数 */
  deferredDraw: number;
}

export type SubPhase =
  | 'awaiting-action'
  | 'awaiting-nope'
  | 'awaiting-defuse'
  | 'awaiting-alter'
  | 'awaiting-tear'
  /** 秀英求助：等待被求助者回应（同意/拒绝/超时） */
  | 'awaiting-help'
  /** 懒懒羊醒来：等待她从梦境牌里选 1 张（留下或送人） */
  | 'awaiting-dream';

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
  /** 爆炸牌的真实 cardId（'exploding' 或 'exploding-apple'）——放回牌堆时要保留身份 */
  cardId: string;
  /** true = 玩家没有真拆解，等待香蕉兑换（defusePosition 直通会被拒绝） */
  needsCard: boolean;
}

export interface PendingAlter {
  sessionId: string;
  /** 重排前的牌堆顶 3 张（自顶向下） */
  cards: CardInstance[];
}

/** 秀英求助挂起：等待被求助者回应 */
export interface PendingHelp {
  /** help = 秀英求助；ride = 司机小贾邀请上车（流程相同：被邀请者同意需交一张牌） */
  kind: 'help' | 'ride';
  /** 秀英 / 小贾 */
  ownerSessionId: string;
  /** 被求助者 */
  helperSessionId: string;
}

/** 懒懒羊醒来挂起：等待选梦境牌 */
export interface PendingDream {
  sessionId: string;
  /** 可选的梦境牌 cardId（互不相同） */
  options: string[];
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
  | { type: 'awaitingTear' }
  | { type: 'tearResolved' }
  | { type: 'awaitingHelp' }
  | { type: 'helpResolved' }
  | { type: 'awaitingDream' }
  | { type: 'dreamResolved' }
  | { type: 'death'; sessionId: string }
  | { type: 'revive'; sessionId: string }
  | { type: 'invalid'; sessionId: string; message: string; msg: LocMsg }
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
  /** Julia 建仓：要放进投资组合的手牌 */
  investInstanceIds?: string[];
}

export interface GameEndInfo {
  winnerName: string;
  ranking: Array<{ sessionId: string; name: string; place: number }>;
}

/** 卡牌定义查找（内置 + 本局自定义） */
export type CardLookup = (cardId: string) => CardDef | undefined;
