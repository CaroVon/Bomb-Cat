import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * 公开同步状态：**绝不包含任何隐藏信息**。
 * 手牌内容只以 handCount 数字同步；本人手牌由房间层私发。
 */
export const PlayerState = schema(
  {
    sessionId: t.string().default(''),
    userId: t.string().default(''),
    name: t.string().default(''),
    characterId: t.string().default('none'),
    handCount: t.uint8().default(0),
    alive: t.boolean().default(true),
    connected: t.boolean().default(true),
    turnsLeft: t.uint8().default(1),
    isHost: t.boolean().default(false),
    /** 主动技能剩余次数（skillId -> 次数） */
    skillUsesLeft: t.map('number'),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    phase: t.string().default('lobby'), // lobby | playing | finished
    subPhase: t.string().default('awaiting-action'),
    roomCode: t.string().default(''),
    hostSessionId: t.string().default(''),
    deckName: t.string().default('经典卡组'),

    players: t.map(PlayerState),
    turnOrder: t.array('string'),
    turnIndex: t.int8().default(0),
    direction: t.int8().default(1),

    deckCount: t.uint8().default(0),
    discardCount: t.uint8().default(0),
    discardTopCardId: t.string().default(''),
    /** 最近 8 张弃牌（旧→新），驱动散乱弃牌堆 */
    discardTopIds: t.array('string'),

    /** 正在处理拆解/重排的玩家（配合 subPhase 判断弹窗归属，避免依赖消息时序） */
    defuseBy: t.string().default(''),
    alterBy: t.string().default(''),

    /** 回合截止时间（epoch ms，服务端权威；0=无计时——否认窗口期等） */
    turnEndsAt: t.number().default(0),

    /** 最近一次出牌（中央舞台可视化："谁打了什么牌"） */
    lastPlayBy: t.string().default(''),
    lastPlayById: t.string().default(''),
    lastPlayCards: t.array('string'),
    lastPlayAt: t.number().default(0),
    lastPlayNoped: t.boolean().default(false),

    /** 最近一次阵亡（爆炸演出） */
    lastDeathBy: t.string().default(''),
    lastDeathAt: t.number().default(0),

    // 否认窗口
    nopeActive: t.boolean().default(false),
    nopePlayId: t.string().default(''),
    nopePlayBy: t.string().default(''),
    nopeCardIds: t.array('string'),
    nopeTargetId: t.string().default(''),
    nopeEndsAt: t.number().default(0),
    nopeNopedBy: t.array('string'),

    // 本局自定义卡的 JSON 定义（CardDef[]，逐项序列化）
    customCardsJson: t.array('string'),

    winnerSessionId: t.string().default(''),
    log: t.array('string'),
  },
  'GameState',
);
export type GameState = SchemaType<typeof GameState>;
