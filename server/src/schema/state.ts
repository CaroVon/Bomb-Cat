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
    /** 已提交个人构筑（等待室展示） */
    buildReady: t.boolean().default(false),
    /** 主动技能剩余次数（skillId -> 次数） */
    skillUsesLeft: t.map('number'),
    /** 技能冷却剩余回合（skillId -> 回合数） */
    skillCooldowns: t.map('number'),
    /** Pig King：消化剩余回合（消化中的卡名是隐藏信息，不进公开状态） */
    digestionTurns: t.number().default(0),
    /** Pig King：饱腹剩余回合 */
    fullTurns: t.number().default(0),
    /** Pig King：消化次数 */
    digestCount: t.number().default(0),
    /** Pig King：必须先打出/丢弃的消化牌（空=无） */
    mustPlayIid: t.string().default(''),
    /** bigEye：该玩家被积累的档案数（0-4） */
    archives: t.uint8().default(0),
    /** Banana：愤怒形态 */
    isAngry: t.boolean().default(false),
    /** Nana：永久死亡 */
    permanentDead: t.boolean().default(false),
    /* ---- v3：数学老师 / 秀英 ---- */
    /** 数学老师：减法标记（下次摸牌少摸 1 张） */
    mathSubDraw: t.uint8().default(0),
    /** 数学老师：乘法标记（下张功能牌触发两次） */
    mathMulNext: t.uint8().default(0),
    /** 数学老师：除法标记（下张功能牌无法触发） */
    mathDivNext: t.uint8().default(0),
    /** 秀英：冰冻层数（0=已解冻） */
    freezeLayers: t.uint8().default(0),
    /** 秀英：本回合获得过帮助（可正常行动） */
    helpedThisTurn: t.boolean().default(false),
    /** 秀英：荔枝数（0-2） */
    lychees: t.uint8().default(0),
    /** 秀英：本回合已求助过的玩家（公开：日志里本就可见） */
    askedHelp: t.array('string'),
    /** 秀英：本回合已喂出的荔枝数 */
    lycheeGiven: t.uint8().default(0),
    /** 邪恶苹果头：身上的邪恶苹果剩余回合（0=没有） */
    appleTurns: t.uint8().default(0),
    /** 屠夫：剔骨层数 */
    boneStacks: t.uint8().default(0),
    /** 被哪位屠夫封锁（''=未封锁） */
    lockedBy: t.string().default(''),
    /** 屠夫：对各目标的剩余冷却（sessionId -> 回合） */
    butcherTargetCd: t.map('number'),
    /** 司机小贾：车费份数 / 撞大运层数 */
    fares: t.uint8().default(0),
    luckCharges: t.uint8().default(0),
    /** 乘客：下一回合结束不摸牌 */
    freeRide: t.boolean().default(false),
    /** 司机小贾：本回合已邀请过的玩家（客户端据此隐藏） */
    askedRide: t.array('string'),
    /* ---- v7：Julia 姐 / 懒懒羊 ---- */
    /** Julia：投资组合张数（牌面隐藏，仅本人经 portfolio 私密消息得知） */
    portfolioCount: t.uint8().default(0),
    /** Julia：距离自动交割还剩几个本人回合（0 = 无持仓） */
    portfolioTurns: t.uint8().default(0),
    /** Julia：大盘（有持仓期间累计） */
    market: t.int8().default(0),
    /** 懒懒羊：梦乡中（偷牌落空、不能否认） */
    asleep: t.boolean().default(false),
    /** 梦游：下一回合开始时自动打出一张功能牌 */
    sleepwalk: t.boolean().default(false),
    /** 回笼觉：下一次摸牌要多摸的张数 */
    deferredDraw: t.uint8().default(0),
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
    /** 司机小贾变道：最近一次互换座次的两人 + 序号（序号变化即播放换位动画） */
    laneSwapA: t.string().default(''),
    laneSwapB: t.string().default(''),
    laneSwapSeq: t.number().default(0),
    lastPlayNoped: t.boolean().default(false),
    /** 最近一次出牌的目标（舞台"→ 谁"与目标座位脉冲） */
    lastPlayTargetId: t.string().default(''),
    lastPlayTargetName: t.string().default(''),

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

    /** 本局 World Rule（公开：全员可见） */
    worldRuleId: t.string().default(''),
    worldRuleName: t.string().default(''),
    worldRuleDesc: t.string().default(''),
    worldRuleEmoji: t.string().default(''),

    /* ---- v2：五角色新公开状态 ---- */
    /** Banana 大香蕉之怒：剩余覆盖轮数（1 轮 = 所有存活玩家各行动一次） */
    bananaOverlayTurns: t.number().default(0),
    /** chaos_queen 混沌之触是否激活 */
    chaosDrawsActive: t.boolean().default(false),
    /** 当前眼泪处理者（空=无） */
    tearPendingBy: t.string().default(''),
    /* ---- v3 ---- */
    /** 秀英求助中：正在等待回应的被求助者（空=无） */
    helpPendingBy: t.string().default(''),
    /** 秀英求助中：求助者（空=无） */
    helpOwnerId: t.string().default(''),
    /* ---- v7 ---- */
    /** 懒懒羊醒来选梦中：选梦者（空=无） */
    dreamBy: t.string().default(''),
  },
  'GameState',
);
export type GameState = SchemaType<typeof GameState>;
