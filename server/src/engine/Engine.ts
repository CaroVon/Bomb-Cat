import {
  BUILTIN_CARD_MAP,
  BUILTIN_CHARACTERS,
  CLASSIC_DECK,
  classicDeckFor,
  MAX_PLAYERS,
  OBJECTIVE_MAP,
  OBJECTIVES,
  WORLD_RULES,
  WORLD_RULE_MAP,
  BUILD_HAND_CARDS,
  defuseTotal,
  validateBuild,
  validateDeck,
  type CardDef,
  type CardEffect,
  type CharacterDef,
  type DeckDef,
  type SkillDef,
} from '@bombcat/shared';
import type {
  CardInstance,
  EngineEvent,
  EnginePlayer,
  PendingAlter,
  PendingDefuse,
  PendingHelp,
  PendingPlay,
  PlayCardInput,
  SubPhase,
  UseSkillInput,
} from './types';
import {
  assignObjectives as assignObjs,
  objectiveDefuse as objDefuse,
  objectiveHandCheck as objHand,
  objectivePlay as objPlay,
  objectiveSteal as objSteal,
  objectiveReport,
} from './objectives.js';

let instanceSeq = 0;
const newIid = (cardId: string): string => `${cardId}#${++instanceSeq}`;

/** 上一局出现的 World Rule（进程内记忆，用于"连续两局不重复"防重复） */
let lastWorldRuleId = '';

export type Rng = () => number;

/**
 * 炸弹猫规则引擎（纯逻辑，不依赖 Colyseus，可单测）。
 *
 * 牌堆/弃牌堆约定：数组末尾 = 顶。
 * 手牌不进同步状态，通过 'hand' 事件让房间层私发本人。
 * 出牌流程：playCard → (否认窗口) → resolveNopes → 效果队列逐个结算，
 * 摸到爆炸猫或重排未来会挂起队列，等 defusePosition / alterFutureOrder 续跑。
 */
export class GameEngine {
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  subPhase: SubPhase = 'awaiting-action';

  players: EnginePlayer[] = [];
  hostSessionId = '';

  deck: CardInstance[] = [];
  discard: CardInstance[] = [];
  deckDef: DeckDef = CLASSIC_DECK;
  cardMap: Map<string, CardDef> = new Map(BUILTIN_CARD_MAP);
  characterMap: Map<string, CharacterDef> = new Map(
    BUILTIN_CHARACTERS.map((c) => [c.id, c]),
  );

  turnOrder: string[] = [];
  turnIndex = 0;
  direction: 1 | -1 = 1;
  turnCount = 0;

  pendingPlay: PendingPlay | null = null;
  pendingDefuse: PendingDefuse | null = null;
  pendingAlter: PendingAlter | null = null;

  /** 效果队列（跨挂起状态续跑） */
  private queue: { play: PendingPlay; effects: CardEffect[]; index: number } | null = null;
  /** 队列跑完后是否结束回合（skip/attack/drawFromBottom 类效果） */
  private endTurnAfterEffects = false;
  /** 结束回合时从牌堆底摸的牌数（0=不摸；乘法可加倍为 2） */
  private pendingEndDrawCount = 0;
  /** 本轮出牌携带的攻击（结束回合后沿方向下一位连走 N 回合） */
  private pendingAttack: boolean = false;
  /** 攻击回合倍率（乘法双倍时为 2） */
  private pendingAttackMult = 1;

  winnerSessionId = '';
  deathOrder: string[] = [];
  logLines: string[] = [];

  /** 本局 World Rule（空串=无规则） */
  worldRuleId = '';

  /** World Rule 防爆过剩的额外拆解数（startGame 内计算） */
  private defuseExtraPool = 0;

  /** 最近一次出牌（可视化用：中央舞台展示"谁打了什么牌"） */
  lastPlay: {
    playId: string;
    bySessionId: string;
    byName: string;
    cardIds: string[];
    at: number;
    noped: boolean;
    /** 目标型效果的目标（舞台展示"→ 谁"与座位脉冲） */
    targetSessionId?: string;
  } | null = null;

  /** 最近一次阵亡（可视化用：爆炸演出） */
  lastDeath: { sessionId: string; name: string; at: number } | null = null;

  /* ---- v2：全局效果修饰器 ---- */
  /** chaos_queen 混沌之触：激活时所有摸牌变为从随机玩家偷牌 */
  chaosDrawsActive = false;
  /** chaos_queen 混沌之触：激活者 sessionId（下轮其回合开始时关闭） */
  chaosDrawsBy = '';
  /** Banana 大香蕉之怒：剩余覆盖轮数（1 轮 = 所有存活玩家各经历一次回合开始） */
  bananaOverlayTurns = 0;
  /** Banana 大香蕉之怒：本轮已开始过回合的玩家（连击回合不重复计入） */
  private bananaOverlaySeen = new Set<string>();
  /** 当前正在处理的眼泪牌信息 */
  pendingTear: { sessionId: string; tearIid: string } | null = null;
  /** future_queen 命运改写：待选择的顶 N 张（该玩家提交 futureRewritePick 或回合结束作废） */
  private pendingFutureRewrite: { sessionId: string; cards: CardInstance[] } | null = null;
  /** bigEye 揭发：待点选的弃牌/抽牌（该玩家提交 exposePick 或回合结束作废） */
  private pendingExpose: { sessionId: string; targetSessionId: string; mode: 'discard' | 'steal' } | null = null;
  /** 秀英求助：等待被求助者回应（提交 helpRespond 或超时自动拒绝） */
  private pendingHelp: PendingHelp | null = null;

  /** 命运改写是否挂起中（房间层据此暂停回合计时，给玩家思考时间） */
  get futureRewritePending(): boolean {
    return this.pendingFutureRewrite !== null;
  }

  /** 秀英求助是否挂起中（房间层据此暂停回合计时） */
  get helpPending(): boolean {
    return this.pendingHelp !== null;
  }

  /** 当前求助信息（房间层用于超时兜底） */
  get pendingHelpInfo(): PendingHelp | null {
    return this.pendingHelp;
  }

  constructor(private rng: Rng = Math.random) {}

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */

  private ev(events: EngineEvent[], e: EngineEvent): EngineEvent[] {
    events.push(e);
    return events;
  }

  private log(events: EngineEvent[], text: string): EngineEvent[] {
    this.logLines.push(text);
    if (this.logLines.length > 60) this.logLines.shift();
    return this.ev(events, { type: 'log', text });
  }

  private invalid(sessionId: string, message: string): EngineEvent[] {
    return [{ type: 'invalid', sessionId, message }];
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  }

  /** 从手牌中随机抽 n 张（不重复） */
  private pickRandomFrom(hand: CardInstance[], n: number): CardInstance[] {
    const pool = [...hand];
    const picked: CardInstance[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = Math.floor(this.rng() * pool.length);
      picked.push(pool.splice(idx, 1)[0]!);
    }
    return picked;
  }

  current(): EnginePlayer | undefined {
    return this.players.find((p) => p.sessionId === this.turnOrder[this.turnIndex]);
  }

  defOf(instance: CardInstance): CardDef {
    return this.cardMap.get(instance.cardId)!;
  }

  /** 是否爆炸类卡牌（爆炸猫 / 爆炸苹果）——统一按 kind 判断，避免漏掉新卡 */
  private isExploding(c: CardInstance): boolean {
    return this.cardMap.get(c.cardId)?.kind === 'exploding';
  }

  handOf(sessionId: string): CardInstance[] {
    return this.players.find((p) => p.sessionId === sessionId)?.hand ?? [];
  }

  private skillOf(player: EnginePlayer, trigger: SkillDef['trigger']): SkillDef | undefined {
    const ch = this.characterMap.get(player.characterId);
    return ch?.skills.find((s) => s.trigger === trigger);
  }

  /** 按 id 查找主动技能（一个角色可能有多个主动技，如混沌女王） */
  private activeSkillOf(player: EnginePlayer, skillId: string): SkillDef | undefined {
    const ch = this.characterMap.get(player.characterId);
    return ch?.skills.find((s) => s.trigger === 'active' && s.id === skillId);
  }

  private skillState(player: EnginePlayer, skillId: string) {
    let st = player.skillState[skillId];
    if (!st) {
      st = player.skillState[skillId] = { used: 0, passiveUsed: 0 };
    }
    return st;
  }

  private othersCanNope(playSessionId: string): boolean {
    return this.players.some(
      (p) => p.alive && p.sessionId !== playSessionId && p.hand.some((c) => c.cardId === 'nope'),
    );
  }

  /* ------------------------------------------------------------------ */
  /* 大厅                                                                */
  /* ------------------------------------------------------------------ */

  addPlayer(sessionId: string, userId: string, name: string): EngineEvent[] {
    if (this.players.some((p) => p.sessionId === sessionId)) return [];
    if (this.players.length >= MAX_PLAYERS) return this.invalid(sessionId, '房间已满');
    if (this.phase !== 'lobby') return this.invalid(sessionId, '对局已开始，无法加入');
    const player: EnginePlayer = {
      sessionId,
      userId,
      name: name.slice(0, 16),
      characterId: 'none',
      hand: [],
      alive: true,
      connected: true,
      turnsLeft: 1,
      skillState: {},
      buildUsed: false,
      runBonuses: [],
      playsThisTurn: 0,
      defuseUsed: 0,
      attackedThisGame: false,
      objective: null,
      skillCooldowns: {},
      permanentDead: false,
      tearCount: 0,
      digestion: null,
      digestCount: 0,
      fullTurns: 0,
      forcedDraws: 0,
      mustPlayIid: null,
      isAngry: false,
      rippleUsedThisTurn: false,
      archives: 0,
      mathSubDraw: 0,
      mathMulNext: 0,
      mathDivNext: 0,
      freezeLayers: 0,
      helpedThisTurn: false,
      lychees: 0,
      askedHelp: [],
      lycheeGivenThisTurn: 0,
      appleTurns: 0,
      appleFrom: '',
    };
    this.players.push(player);
    if (!this.hostSessionId) this.hostSessionId = sessionId;
    return this.log([], `${player.name} 加入了房间`);
  }

  removePlayer(sessionId: string): EngineEvent[] {
    const p = this.players.find((x) => x.sessionId === sessionId);
    if (!p) return [];
    this.players = this.players.filter((x) => x.sessionId !== sessionId);
    this.turnOrder = this.turnOrder.filter((id) => id !== sessionId);
    if (this.turnIndex >= this.turnOrder.length) this.turnIndex = 0;
    if (this.hostSessionId === sessionId) {
      this.hostSessionId = this.players[0]?.sessionId ?? '';
    }
    return this.log([], `${p.name} 离开了房间`);
  }

  setCharacter(sessionId: string, characterId: string | null): EngineEvent[] {
    if (this.phase !== 'lobby') return this.invalid(sessionId, '对局已开始');
    const id = characterId ?? 'none';
    if (!this.characterMap.has(id)) return this.invalid(sessionId, '未知角色');
    const p = this.players.find((x) => x.sessionId === sessionId);
    if (!p) return this.invalid(sessionId, '你不在房间里');
    p.characterId = id;
    return [];
  }

  /* ------------------------------------------------------------------ */
  /* 开局                                                                */
  /* ------------------------------------------------------------------ */

  startGame(
    hostSessionId: string,
    deckDef: DeckDef | null,
    options?: {
      /** 个人出战构筑：sessionId -> 10 张 cardId（6 张随机入起手，4 张洗入公共堆） */
      builds?: Record<string, string[]>;
      /** 指定本局 World Rule（缺省随机）；null 表示禁用 */
      worldRuleId?: string | null;
      /** 无尽挑战增益（按 sessionId） */
      runBonuses?: Record<string, string[]>;
      /** 额外爆炸猫数量（无尽挑战难度递增） */
      extraExploding?: number;
    },
  ): EngineEvent[] {
    if (this.phase !== 'lobby') return this.invalid(hostSessionId, '对局已在进行');
    if (hostSessionId !== this.hostSessionId) {
      return this.invalid(hostSessionId, '只有房主能开始游戏');
    }
    const n = this.players.length;
    // 经典卡组按人数缩放（服务器可信来源，跳过张数上限校验；自定义卡组照常校验）
    const deck = deckDef ?? classicDeckFor(n);
    if (n < 2) return this.invalid(hostSessionId, '至少需要 2 名玩家');

    if (deckDef) {
      const result = validateDeck(deckDef, n);
      if (!result.ok) {
        return this.invalid(hostSessionId, `卡组不合法：${result.errors.join('；')}`);
      }
    }
    this.deckDef = deck;
    this.cardMap = new Map(BUILTIN_CARD_MAP);
    for (const c of deck.customCards) this.cardMap.set(c.id, c);

    // World Rule：指定 or 随机（null 禁用）
    if (options?.worldRuleId === null) {
      this.worldRuleId = '';
    } else if (options?.worldRuleId && WORLD_RULE_MAP.has(options.worldRuleId)) {
      this.worldRuleId = options.worldRuleId;
    } else {
      // 防重复：连续两局不出现同一条规则（进程内记忆上一局），其余保持等概率
      const pool = WORLD_RULES.filter((r) => r.id !== lastWorldRuleId);
      const candidates = pool.length > 0 ? pool : WORLD_RULES;
      const picked = candidates[Math.floor(this.rng() * candidates.length)]!;
      this.worldRuleId = picked.id;
      lastWorldRuleId = picked.id;
    }

    const pool: CardInstance[] = [];
    for (const [cardId, count] of Object.entries(deck.counts)) {
      for (let i = 0; i < count; i++) pool.push({ iid: newIid(cardId), cardId });
    }
    this.shuffle(pool);

    // 动作牌至少要够：每人 3 张 + 爆炸猫 + 剩余拆解
    const defuseLeft = Math.max(0, defuseTotal(n) - n);
    // 规则：爆炸猫 = 人数 + 2，随机分布（发完起手后混入整体洗牌）
    const exploding = n + 2 + (options?.extraExploding ?? 0);
    if (pool.length < exploding + defuseLeft + n * 3) {
      return this.invalid(hostSessionId, '卡组牌太少，无法支撑这么多玩家');
    }
    // 发牌数按人数自适应（≤6 人发 6 张，人多牌少时自动缩减）
    const dealCount = Math.min(6, Math.floor((pool.length - exploding - defuseLeft) / n));

    // 个人构筑：校验通过者用自选 10 张（随机 6 入手，余 4 入公共堆）
    if (options?.builds) {
      for (const [sid, build] of Object.entries(options.builds)) {
        const p = this.players.find((x) => x.sessionId === sid);
        if (!p) continue;
        const v = validateBuild(build, this.cardMap);
        if (!v.ok) {
          return this.invalid(hostSessionId, `${p.name} 的构筑不合法：${v.error}`);
        }
      }
    }
    this.players.forEach((p) => {
      p.runBonuses = options?.runBonuses?.[p.sessionId] ?? [];
      p.buildUsed = false;
      const build = options?.builds?.[p.sessionId];
      if (build && validateBuild(build, this.cardMap).ok) {
        const insts = build.map((cardId) => ({ iid: newIid(cardId), cardId }));
        this.shuffle(insts);
        p.hand = [{ iid: newIid('defuse'), cardId: 'defuse' }, ...insts.slice(0, BUILD_HAND_CARDS)];
        pool.push(...insts.slice(BUILD_HAND_CARDS));
        p.buildUsed = true;
      } else {
        p.hand = [{ iid: newIid('defuse'), cardId: 'defuse' }];
        for (let i = 0; i < dealCount; i++) {
          p.hand.push(pool.pop()!);
        }
      }
      p.alive = true;
      p.turnsLeft = 1;
      p.skillState = {};
      p.playsThisTurn = 0;
      p.defuseUsed = 0;
      p.attackedThisGame = false;
      // v2：重置新状态
      p.skillCooldowns = {};
      p.permanentDead = false;
      p.tearCount = 0;
      p.digestion = null;
      p.digestCount = 0;
      p.fullTurns = 0;
      p.forcedDraws = 0;
      p.mustPlayIid = null;
      p.isAngry = false;
      p.rippleUsedThisTurn = false;
      p.archives = 0;
      // v3：重置新状态
      p.mathSubDraw = 0;
      p.mathMulNext = 0;
      p.mathDivNext = 0;
      p.freezeLayers = 0;
      p.helpedThisTurn = false;
      p.lychees = 0;
      p.askedHelp = [];
      p.lycheeGivenThisTurn = 0;
      p.appleTurns = 0;
      p.appleFrom = '';

      // Nana：开局没有拆解
      if (p.characterId === 'nana') {
        p.hand = p.hand.filter((c) => c.cardId !== 'defuse');
      }
      // future_queen：开局额外获得 2 张预知未来
      if (p.characterId === 'future_queen') {
        const fe = this.skillOf(p, 'turnStart');
        if (fe?.effect.kind === 'futureEye' && fe.effect.bonusPeekCards > 0) {
          for (let i = 0; i < fe.effect.bonusPeekCards; i++) {
            p.hand.push({ iid: newIid('peek'), cardId: 'peek' });
          }
        }
      }
      // 秀英：开局 N 层冰冻（无法出牌/摸牌，且不受技能影响）
      const ice = this.skillOf(p, 'gameStart');
      if (ice?.effect.kind === 'iceFrozen') {
        p.freezeLayers = ice.effect.layers;
      }
    });
    // 重置全局修饰器
    this.chaosDrawsActive = false;
    this.chaosDrawsBy = '';
    this.bananaOverlayTurns = 0;
    this.bananaOverlaySeen = new Set();
    this.pendingTear = null;
    this.pendingFutureRewrite = null;
    this.pendingExpose = null;
    this.pendingHelp = null;

    // World Rule 防爆过剩：额外 2 张拆解
    if (this.worldRuleId === 'defuse-plenty') {
      this.defuseExtraPool = 2;
    } else {
      this.defuseExtraPool = 0;
    }
    for (let i = 0; i < defuseLeft + this.defuseExtraPool; i++) {
      pool.push({ iid: newIid('defuse'), cardId: 'defuse' });
    }
    for (let i = 0; i < exploding; i++) {
      pool.push({ iid: newIid('exploding'), cardId: 'exploding' });
    }
    this.deck = this.shuffle(pool);
    this.discard = [];

    // runBonuses：厚实起手 / 随身工具箱
    this.players.forEach((p) => {
      if (p.runBonuses.includes('extra-deal')) p.hand.push(pool.pop()!);
      if (p.runBonuses.includes('extra-defuse')) {
        p.hand.push({ iid: newIid('defuse'), cardId: 'defuse' });
      }
    });

    this.turnOrder = this.players.map((p) => p.sessionId);
    this.turnIndex = Math.floor(this.rng() * this.turnOrder.length);
    this.direction = 1;
    this.phase = 'playing';
    this.subPhase = 'awaiting-action';
    this.winnerSessionId = '';
    this.deathOrder = [];
    this.turnCount = 0;

    // 秘密任务：每人随机一条（比命长需指定目标）
    assignObjs(this.players, (a) => this.shuffle(a));

    const events: EngineEvent[] = [];
    this.players.forEach((p) => this.ev(events, { type: 'hand', sessionId: p.sessionId }));

    // 秘密任务私密下发（不进公开日志）
    for (const p of this.players) {
      if (!p.objective) continue;
      const def = OBJECTIVE_MAP.get(p.objective.defId);
      if (!def) continue;
      const targetName = p.objective.targetSessionId
        ? this.players.find((x) => x.sessionId === p.objective!.targetSessionId)?.name
        : undefined;
      this.ev(events, {
        type: 'private',
        sessionId: p.sessionId,
        message: {
          action: 'objective',
          defId: def.id,
          defName: def.name,
          description: def.description,
          targetName,
        },
      });
    }

    // runBonuses：先知（开局看牌堆顶 3 张）
    this.players.forEach((p) => {
      if (p.runBonuses.includes('start-peek')) {
        const top = this.deck.slice(-3).reverse();
        this.ev(events, {
          type: 'private',
          sessionId: p.sessionId,
          message: { action: 'peekDeck', cards: top.map((i) => this.defOf(i)) },
        });
      }
    });

    const rule = WORLD_RULE_MAP.get(this.worldRuleId);
    const first = this.current()!;
    this.log(
      events,
      `游戏开始！卡组【${this.deckDef.name}】，${n} 名玩家，${first.name} 先手（牌堆 ${this.deck.length} 张）${rule ? `；本局规则 ${rule.emoji}【${rule.name}】` : ''}`,
    );

    // gameStart 技能
    for (const p of this.players) {
      const skill = this.skillOf(p, 'gameStart');
      if (!skill) continue;
      if (skill.effect.kind === 'startWithSkip' || skill.effect.kind === 'gainCardAtStart') {
        const count = skill.effect.count;
        const cardId = skill.effect.kind === 'startWithSkip' ? 'skip' : skill.effect.cardId;
        if (this.cardMap.has(cardId)) {
          for (let i = 0; i < count; i++) p.hand.push({ iid: newIid(cardId), cardId });
          this.ev(events, { type: 'hand', sessionId: p.sessionId });
          this.log(events, `${p.name} 的「${skill.name}」生效`);
        }
      }
      // 邪恶苹果头被动：往牌堆随机位置藏爆炸苹果（公开公告：牌堆总数本就公开）
      if (skill.effect.kind === 'appleBomb') {
        for (let i = 0; i < skill.effect.count; i++) {
          const pos = Math.floor(this.rng() * (this.deck.length + 1));
          this.deck.splice(pos, 0, { iid: newIid('exploding-apple'), cardId: 'exploding-apple' });
        }
        this.log(events, `🍏 ${p.name} 往牌堆里藏了一张爆炸苹果……`);
      }
    }

    this.runTurnStartSkills(first, events);
    this.ev(events, { type: 'turnAdvanced' });
    return events;
  }

  /* ------------------------------------------------------------------ */
  /* 出牌与否认                                                          */
  /* ------------------------------------------------------------------ */

  playCard(sessionId: string, input: PlayCardInput): EngineEvent[] {
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    const player = this.players.find((p) => p.sessionId === sessionId);
    if (!player) return this.invalid(sessionId, '你不在房间里');

    if (input.asNope) return this.playNope(sessionId, input.instanceId);

    if (this.subPhase !== 'awaiting-action') return this.invalid(sessionId, '当前不能出牌');
    if (!player.alive) return this.invalid(sessionId, '你已出局');
    if (this.current()?.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');
    // 秀英冰冻：无法出牌
    if (this.isFrozen(player)) {
      return this.invalid(sessionId, `冰冻中无法出牌（剩 ${player.freezeLayers} 层）`);
    }

    const instance = player.hand.find((c) => c.iid === input.instanceId);
    if (!instance) return this.invalid(sessionId, '手中没有这张牌');

    // Pig King：消化完成的牌必须先处理（打出它或经 digestPlay 丢弃）
    if (player.mustPlayIid) {
      const playedIds = [input.instanceId, ...(input.comboInstanceIds ?? [])];
      if (!playedIds.includes(player.mustPlayIid)) {
        return this.invalid(sessionId, '必须先处理消化获得的牌 🐷');
      }
    }
    const def = this.defOf(instance);
    const overlayActive = this.bananaOverlayTurns > 0;

    // 香蕉覆盖期间：女王只能靠香蕉兑换出牌（点手牌只会选中）
    if (overlayActive && player.characterId === 'banana') {
      return this.invalid(sessionId, '覆盖期间只能通过香蕉兑换出牌 🍌');
    }
    // 香蕉覆盖期间：所有人只能盲打单牌
    // - 同名猫组合禁用
    // - 普通猫/拆解/否认：盲打无任何效果，直接进弃牌堆
    // - 动作牌：正常效果，需要目标时由服务端随机指定（盲打不泄露牌型）
    if (overlayActive) {
      if (def.kind === 'exploding') return this.invalid(sessionId, '爆炸猫不能主动打出');
      if (def.kind === 'tear') return this.invalid(sessionId, '眼泪不能主动打出');
      if ((input.comboInstanceIds ?? []).length > 0) {
        return this.invalid(sessionId, '覆盖期间无法使用同名猫组合 🍌');
      }
      if (def.kind === 'plain' || def.kind === 'defuse' || instance.cardId === 'nope') {
        player.hand = player.hand.filter((c) => c.iid !== instance.iid);
        if (player.mustPlayIid === instance.iid) player.mustPlayIid = null;
        this.discard.push(instance);
        const events: EngineEvent[] = [{ type: 'hand', sessionId }];
        this.log(events, `${player.name} 盲打了一张香蕉（【${def.name}】），没有产生效果`);
        this.lastPlay = {
          playId: `blind-${++instanceSeq}`,
          bySessionId: sessionId,
          byName: player.name,
          cardIds: [instance.cardId],
          at: Date.now(),
          noped: false,
        };
        this.addArchive(sessionId);
        return events;
      }
    }

    if (def.kind === 'defuse') return this.invalid(sessionId, '拆解会在摸到爆炸猫时自动使用');
    if (instance.cardId === 'nope') return this.invalid(sessionId, '否认牌只能在别人出牌的 8 秒窗口内打出');
    if (def.kind === 'exploding') return this.invalid(sessionId, '爆炸猫不能主动打出');
    if (def.kind === 'tear') return this.invalid(sessionId, '眼泪不能主动打出');

    let combo: PendingPlay['combo'] = 'single';
    let instances: CardInstance[] = [instance];
    let effects: CardEffect[];
    let wantCardId = input.wantCardId;

    const comboIds = input.comboInstanceIds ?? [];
    if (comboIds.length > 0) {
      if (def.kind !== 'plain' || !def.comboable) {
        return this.invalid(sessionId, '只有普通猫能组合打出');
      }
      const comboInstances: CardInstance[] = [];
      for (const id of comboIds) {
        const c = player.hand.find(
          (x) => x.iid === id && x.iid !== instance.iid,
        );
        if (!c) return this.invalid(sessionId, '组合牌必须是手中存在的牌');
        const cdef = this.cardMap.get(c.cardId);
        if (!cdef || cdef.kind !== 'plain' || !cdef.comboable) {
          return this.invalid(sessionId, '组合牌必须是普通猫');
        }
        comboInstances.push(c);
      }
      const total = comboInstances.length + 1;
      if (total !== 2 && total !== 3) {
        return this.invalid(sessionId, '组合只能是 2 张或 3 张');
      }
      // 同名成组；或组内含万能猫（feral）时允许任意普通猫混搭
      const group = [instance, ...comboInstances];
      const ids = new Set(group.map((c) => c.cardId));
      const hasFeral = group.some((c) => this.cardMap.get(c.cardId)?.feral);
      if (ids.size > 1 && !hasFeral) {
        return this.invalid(sessionId, '组合必须是同名普通猫（万能猫可通配）');
      }
      combo = total === 2 ? 'pair' : 'triple';
      instances = group;
      if (total === 3) {
        if (!wantCardId || !this.cardMap.has(wantCardId)) {
          return this.invalid(sessionId, '三张组合需要指定要偷的牌');
        }
        effects = [{ type: 'stealNamed', cardId: wantCardId }];
      } else {
        effects = [{ type: 'stealRandom' }];
      }
    } else if (def.kind === 'plain') {
      return this.invalid(sessionId, '普通猫只能 2 张或 3 张组合打出');
    } else if (def.kind === 'streaking') {
      return this.invalid(sessionId, '果奔猫是被动牌，不能主动打出');
    } else {
      effects = def.effects;
    }

    // bigEye 被动限制：无法使用求赠和偷牌效果（含组合偷牌）
    if (player.characterId === 'bigEye') {
      const stealEffect = effects.some((e) => e.type === 'stealRandom' || e.type === 'stealNamed');
      if (instance.cardId === 'favor' || stealEffect) {
        return this.invalid(sessionId, '大眼Nana无法使用求赠和偷牌效果 👀');
      }
    }

    const needsTarget = effects.some(
      (e) =>
        e.type === 'stealRandom' ||
        e.type === 'stealNamed' ||
        e.type === 'peekHand' ||
        e.type === 'swapHand',
    );
    let effectiveTargetId = input.targetSessionId;
    if (needsTarget && overlayActive) {
      // 盲打：服务端随机指定目标（含求赠索要的牌），避免"弹目标选择框"泄露牌型
      const alive = this.players.filter((p) => p.alive && p.sessionId !== sessionId);
      if (alive.length === 0) return this.invalid(sessionId, '没有其他存活玩家可以作为目标');
      const t = alive[Math.floor(this.rng() * alive.length)]!;
      effectiveTargetId = t.sessionId;
      if (!wantCardId && t.hand.length > 0) {
        wantCardId = t.hand[Math.floor(this.rng() * t.hand.length)]!.cardId;
      }
    } else if (needsTarget) {
      const t = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!t || !t.alive || t.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家作为目标');
      }
    }

    // 数学老师：除法/乘法修饰（作用于功能牌；同存时除法优先，两个标记都消耗）
    if (player.mathDivNext > 0) {
      player.mathDivNext = 0;
      player.mathMulNext = 0;
      player.hand = player.hand.filter((c) => !instances.some((i) => i.iid === c.iid));
      if (player.mustPlayIid && instances.some((i) => i.iid === player.mustPlayIid)) {
        player.mustPlayIid = null;
      }
      this.discard.push(...instances);
      const events: EngineEvent[] = [{ type: 'hand', sessionId }];
      const names = instances.map((i) => this.defOf(i).name).join('+');
      this.log(events, `➗ ${player.name} 打出【${names}】，被除法干扰没有产生效果`);
      this.lastPlay = {
        playId: `div-${++instanceSeq}`,
        bySessionId: sessionId,
        byName: player.name,
        cardIds: instances.map((i) => i.cardId),
        at: Date.now(),
        noped: false,
      };
      this.addArchive(sessionId);
      return events;
    }
    // 数学老师：乘法修饰（按效果类型给出真正的双倍语义；无法加倍则不消耗标记）
    let mulApplied = false;
    if (player.mathMulNext > 0) {
      const doubled = this.doubleEffects(player, effects);
      if (doubled) {
        effects = doubled;
        player.mathMulNext = 0;
        mulApplied = true;
      }
    }

    player.hand = player.hand.filter((c) => !instances.some((i) => i.iid === c.iid));
    if (player.mustPlayIid && instances.some((i) => i.iid === player.mustPlayIid)) {
      player.mustPlayIid = null;
    }

    const events: EngineEvent[] = [];
    this.ev(events, { type: 'hand', sessionId });

    const cardNames = instances.map((i) => this.defOf(i).name).join('+');
    const targetName = this.players.find((p) => p.sessionId === effectiveTargetId)?.name;
    this.log(events, `${player.name} 打出【${cardNames}】${targetName ? `→ ${targetName}` : ''}`);
    if (mulApplied) {
      this.log(events, `✖️ 乘法生效：【${cardNames}】的效果触发了两次`);
    }
    // 秀英冰冻：被功能牌指定 → 冰冻 -1（卡牌效果照常生效）
    if (needsTarget) {
      this.cardHitsFrozen(
        this.players.find((p) => p.sessionId === effectiveTargetId),
        cardNames,
        events,
      );
    }
    this.addArchive(sessionId);

    this.pendingPlay = {
      playId: `play-${++instanceSeq}`,
      sessionId,
      instances,
      combo,
      effects,
      targetSessionId: needsTarget ? effectiveTargetId : undefined,
      wantCardId,
      nopedBy: [],
    };
    objPlay(player, events);
    this.lastPlay = {
      playId: this.pendingPlay.playId,
      bySessionId: sessionId,
      byName: player.name,
      cardIds: instances.map((i) => i.cardId),
      at: Date.now(),
      noped: false,
      targetSessionId: needsTarget ? effectiveTargetId : undefined,
    };
    this.subPhase = 'awaiting-nope';
    this.ev(events, { type: 'nopeWindowOpened' });

    // 没人持否认牌时直接结算，省 8 秒等待
    if (!this.othersCanNope(sessionId)) {
      events.push(...this.resolveNopes());
    }
    return events;
  }

  playNope(sessionId: string, instanceId: string): EngineEvent[] {
    const pending = this.pendingPlay;
    if (!pending || this.subPhase !== 'awaiting-nope') {
      return this.invalid(sessionId, '现在没有可以否认的牌');
    }
    const player = this.players.find((p) => p.sessionId === sessionId);
    if (!player || !player.alive) return this.invalid(sessionId, '你无法否认');
    if (pending.sessionId === sessionId) return this.invalid(sessionId, '不能否认自己的牌');
    if (pending.nopedBy[pending.nopedBy.length - 1] === sessionId) {
      return this.invalid(sessionId, '需要别人先否认，你才能再次否认');
    }
    const instance = player.hand.find((c) => c.iid === instanceId && c.cardId === 'nope');
    if (!instance) return this.invalid(sessionId, '你手中没有否认牌');

    player.hand = player.hand.filter((c) => c.iid !== instanceId);
    this.discard.push(instance);
    pending.nopedBy.push(sessionId);
    const noped = pending.nopedBy.length % 2 === 1;
    const owner = this.players.find((p) => p.sessionId === pending.sessionId);

    const events: EngineEvent[] = [{ type: 'hand', sessionId }];
    this.log(events, `${player.name} ${noped ? '否认' : '反否认'}了 ${owner?.name} 的牌 ❌`);
    this.addArchive(sessionId);
    return events;
  }

  /** 否认窗口到期，由房间层计时调用 */
  resolveNopes(): EngineEvent[] {
    const pending = this.pendingPlay;
    if (!pending || this.subPhase !== 'awaiting-nope') return [];
    const events: EngineEvent[] = [];
    this.ev(events, { type: 'nopeWindowClosed' });
    this.pendingPlay = null;
    this.subPhase = 'awaiting-action';

    const noped = pending.nopedBy.length % 2 === 1;
    const player = this.players.find((p) => p.sessionId === pending.sessionId)!;
    if (this.lastPlay?.playId === pending.playId) {
      this.lastPlay = { ...this.lastPlay, noped };
    }
    if (noped) {
      // 牌被否认：乘法设定的攻击倍率不应生效
      this.pendingAttackMult = 1;
    }

    if (noped) {
      const skill = this.skillOf(player, 'onNoped');
      if (skill?.effect.kind === 'returnNoped') {
        const st = this.skillState(player, skill.id);
        if (st.passiveUsed < skill.effect.times && pending.instances[0]) {
          st.passiveUsed++;
          player.hand.push(pending.instances[0]!);
          this.discard.push(...pending.instances.slice(1));
          this.ev(events, { type: 'hand', sessionId: player.sessionId });
          this.log(events, `${player.name} 的「${skill.name}」生效，被否认的牌回到了手中`);
          return this.afterPlayResolved(events);
        }
      }
      this.discard.push(...pending.instances);
      this.log(events, `【${pending.instances.map((i) => this.defOf(i).name).join('+')}】被否认，进入弃牌堆`);
      return this.afterPlayResolved(events);
    }

    this.discard.push(...pending.instances);
    this.queue = { play: pending, effects: pending.effects, index: 0 };
    this.endTurnAfterEffects = pending.effects.some(
      (e) => e.type === 'skip' || e.type === 'attack' || e.type === 'drawFromBottom',
    );
    const bottomDraws = pending.effects
      .filter((e) => e.type === 'drawFromBottom')
      .reduce((sum, e) => sum + (e.count ?? 1), 0);
    this.pendingEndDrawCount = bottomDraws;
    this.pendingAttack = pending.effects.some((e) => e.type === 'attack');
    // 注意：pendingAttackMult 由「乘法」在 playCard 阶段设定，这里不能重置（否则双倍失效）
    return this.runQueue(events);
  }

  private afterPlayResolved(events: EngineEvent[]): EngineEvent[] {
    if (this.queue) return this.runQueue(events);
    if (this.endTurnAfterEffects) {
      this.endTurnAfterEffects = false;
      return this.finishTurn(events);
    }
    return events;
  }

  /* ------------------------------------------------------------------ */
  /* 效果队列                                                            */
  /* ------------------------------------------------------------------ */

  private runQueue(events: EngineEvent[]): EngineEvent[] {
    const q = this.queue;
    if (!q) return events;
    const player = this.players.find((p) => p.sessionId === q.play.sessionId)!;
    while (q.index < q.effects.length) {
      if (this.phase !== 'playing' || !player.alive) {
        // 结算途中出局/游戏结束：丢弃剩余效果
        this.queue = null;
        this.endTurnAfterEffects = false;
        return events;
      }
      const effect = q.effects[q.index]!;
      q.index++;
      const r = this.applyEffect(q.play, effect, events);
      if (r === 'suspend-defuse' || r === 'suspend-alter') {
        return events;
      }
    }
    this.queue = null;
    return this.afterPlayResolved(events);
  }

  /** 返回 'suspend-defuse' | 'suspend-alter' | 'ok' */
  private applyEffect(
    play: PendingPlay,
    effect: CardEffect,
    events: EngineEvent[],
  ): 'ok' | 'suspend-defuse' | 'suspend-alter' {
    const player = this.players.find((p) => p.sessionId === play.sessionId)!;

    switch (effect.type) {
      case 'skip':
      case 'attack':
        // World Rule 疯狂抽卡：打出跳过后额外摸一张（换一张）
        if (effect.type === 'skip' && this.worldRuleId === 'mad-draw') {
          const c = this.deck.pop();
          if (c) {
            if (this.isExploding(c)) {
              const r = this.handleExplosion(player, c, events);
              if (r === 'suspend-defuse' || !player.alive) return 'ok';
            } else {
              player.hand.push(c);
              this.ev(events, { type: 'hand', sessionId: player.sessionId });
            }
          }
        }
        return 'ok'; // 回合结束语义在 finishTurn 统一处理

      case 'shuffle': {
        this.shuffle(this.deck);
        this.log(events, '牌堆被洗乱了 🌀');
        return 'ok';
      }

      case 'peek': {
        // future_queen 天眼强化：peek 至少看 5 张（乘法加倍时按加倍后的张数）
        const isFQ = player.characterId === 'future_queen';
        const wanted = isFQ ? Math.max(5, effect.count ?? 0) : (effect.count ?? 3);
        const n = Math.min(wanted, this.deck.length);
        const top = this.deck.slice(this.deck.length - n).reverse();
        if (isFQ && n > 0) {
          // future_queen 天眼强化：peek 升级为「查看5张+自由排列放回」
          this.pendingAlter = { sessionId: player.sessionId, cards: top };
          this.subPhase = 'awaiting-alter';
          this.ev(events, {
            type: 'private',
            sessionId: player.sessionId,
            message: { action: 'alterPrompt', cards: top.map((i) => this.defOf(i)) },
          });
          this.ev(events, { type: 'awaitingAlter' });
          return 'suspend-alter';
        }
        this.ev(events, {
          type: 'private',
          sessionId: player.sessionId,
          message: {
            action: 'peekDeck',
            cards: top.map((i) => this.defOf(i)),
            playId: play.playId,
          },
        });
        return 'ok';
      }

      case 'alterFuture': {
        const n = Math.min(effect.count ?? 3, this.deck.length);
        if (n === 0) return 'ok';
        const top = this.deck.slice(this.deck.length - n).reverse();
        this.pendingAlter = { sessionId: player.sessionId, cards: top };
        this.subPhase = 'awaiting-alter';
        this.ev(events, {
          type: 'private',
          sessionId: player.sessionId,
          message: { action: 'alterPrompt', cards: top.map((i) => this.defOf(i)) },
        });
        this.ev(events, { type: 'awaitingAlter' });
        return 'suspend-alter';
      }

      case 'stealRandom':
      case 'stealNamed': {
        const target = this.players.find((p) => p.sessionId === play.targetSessionId);
        if (!target || !target.alive || target.hand.length === 0) {
          this.log(events, `${target?.name ?? '目标'} 没有牌可被偷`);
          return 'ok';
        }
        if (this.tryImmuneSteal(target, events)) return 'ok';

        let idx: number;
        if (effect.type === 'stealRandom') {
          idx = Math.floor(this.rng() * target.hand.length);
        } else {
          idx = target.hand.findIndex((c) => c.cardId === effect.cardId);
          if (idx < 0) {
            // 公开日志不泄露目标持牌信息
            this.log(events, `${target.name} 没有对方想要的牌，偷取落空`);
            return 'ok';
          }
        }
        const [stolen] = target.hand.splice(idx, 1);
        player.hand.push(stolen!);
        this.ev(events, { type: 'hand', sessionId: target.sessionId });
        this.ev(events, { type: 'hand', sessionId: player.sessionId });
        this.log(events, `${player.name} 从 ${target.name} 那里偷走了 1 张牌 🤏`);
        objSteal(player, events);
        this.chaosRipple(events);
        return 'ok';
      }

      case 'peekHand': {
        const target = this.players.find((p) => p.sessionId === play.targetSessionId);
        if (!target) return 'ok';
        this.ev(events, {
          type: 'private',
          sessionId: player.sessionId,
          message: {
            action: 'peekHand',
            playerName: target.name,
            cards: target.hand.map((i) => this.defOf(i)),
          },
        });
        return 'ok';
      }

      case 'swapHand': {
        const target = this.players.find((p) => p.sessionId === play.targetSessionId);
        if (!target) return 'ok';
        const t = target.hand;
        target.hand = player.hand;
        player.hand = t;
        this.ev(events, { type: 'hand', sessionId: target.sessionId });
        this.ev(events, { type: 'hand', sessionId: player.sessionId });
        this.log(events, `${player.name} 与 ${target.name} 交换了手牌 🔄`);
        return 'ok';
      }

      case 'reverse': {
        this.direction = this.direction === 1 ? -1 : 1;
        this.log(events, `${player.name} 反转了出牌方向 🔁`);
        return 'ok';
      }

      case 'drawFromBottom': {
        // 结束回合并从牌堆底摸牌（结算挪到 finishTurn，保证爆炸/藏猫流程一致）
        return 'ok';
      }

      case 'selfDraw': {
        const count = effect.count ?? 1;
        for (let i = 0; i < count; i++) {
          const c = this.deck.pop();
          if (!c) break;
          if (this.isExploding(c)) {
            return this.handleExplosion(player, c, events);
          }
          player.hand.push(c);
          this.ev(events, { type: 'hand', sessionId: player.sessionId });
        }
        this.log(events, `${player.name} 额外摸了 ${count} 张牌`);
        return 'ok';
      }

      default:
        return 'ok';
    }
  }

  /** 秀英冰冻：冰冻中的玩家不受技能影响（技能无效，但冰冻 -1）。返回 true = 已挡下 */
  private frozenBlocksSkill(target: EnginePlayer, events: EngineEvent[], skillName: string): boolean {
    if (target.freezeLayers <= 0) return false;
    target.freezeLayers--;
    this.log(
      events,
      `🧊 ${target.name} 处于冰冻中，「${skillName}」没有产生效果（冰冻 -1，剩 ${target.freezeLayers} 层）`,
    );
    if (target.freezeLayers === 0) {
      this.log(events, `🧊 ${target.name} 解冻了！可以正常出牌和摸牌了`);
    }
    return true;
  }

  /** 秀英是否处于冰冻（无法出牌/摸牌；本回合被帮助过则视为可行动） */
  private isFrozen(p: EnginePlayer): boolean {
    return p.freezeLayers > 0 && !p.helpedThisTurn;
  }

  /**
   * 邪恶苹果头本人摸到爆炸苹果：悄悄放回牌堆（插在非顶位置，避免立刻又抽到）并额外摸 1 张。
   * 返回 true 表示已消化掉这张牌（调用方不要再按爆炸处理）。
   */
  private tryAppleConvert(player: EnginePlayer, c: CardInstance, events: EngineEvent[]): boolean {
    if (c.cardId !== 'exploding-apple' || player.characterId !== 'apple') return false;
    const pos = 1 + Math.floor(this.rng() * this.deck.length); // 1..len：不放回牌堆顶
    this.deck.splice(this.deck.length - Math.min(pos, this.deck.length), 0, c);
    this.ev(events, {
      type: 'private',
      sessionId: player.sessionId,
      message: { action: 'notice', text: '🍏 你摸到了爆炸苹果，悄悄把它塞回了牌堆，并再摸一张' },
    });
    this.grantDraw(player, 1, events);
    return true;
  }

  /** 秀英冰冻中被打上功能牌：冰冻 -1（卡牌效果照常生效） */
  private cardHitsFrozen(target: EnginePlayer | undefined, cardName: string, events: EngineEvent[]): void {
    if (!target || target.freezeLayers <= 0) return;
    target.freezeLayers--;
    this.log(
      events,
      `🧊 ${target.name} 被【${cardName}】命中，冰冻 -1（剩 ${target.freezeLayers} 层）`,
    );
    if (target.freezeLayers === 0) {
      this.log(events, `🧊 ${target.name} 解冻了！可以正常出牌和摸牌了`);
    }
  }

  /**
   * 数学老师「乘法」：按效果类型给出真正的双倍语义。
   * 返回 null 表示这张牌没有"触发两次"的空间（跳过/反转），不消耗标记。
   */
  private doubleEffects(player: EnginePlayer, effects: CardEffect[]): CardEffect[] | null {
    const out: CardEffect[] = [];
    for (const e of effects) {
      switch (e.type) {
        case 'attack':
          this.pendingAttackMult = 2; // 连击回合数 ×2（finishTurn 结算）
          out.push(e);
          break;
        case 'drawFromBottom':
          out.push({ ...e, count: (e.count ?? 1) * 2 });
          break;
        case 'selfDraw':
          out.push({ ...e, count: (e.count ?? 1) * 2 });
          break;
        case 'peek': {
          const base = player.characterId === 'future_queen' ? 5 : (e.count ?? 3);
          out.push({ ...e, count: base * 2 });
          break;
        }
        case 'alterFuture':
          out.push({ ...e, count: (e.count ?? 3) * 2 });
          break;
        case 'stealRandom':
        case 'stealNamed':
          out.push(e, e); // 偷两次
          break;
        case 'shuffle':
          out.push(e, e); // 洗两次
          break;
        default:
          // skip / reverse / peekHand / swapHand 等：没有"两次"的含义
          return null;
      }
    }
    return out;
  }

  /**
   * 额外的摸牌（不结束回合）：用于数学老师「加法」等授予式摸牌。
   * 走正常管线（混沌之触偷牌 / 爆炸猫挂起拆解 / 眼泪），受减法标记影响。
   */
  private grantDraw(player: EnginePlayer, count: number, events: EngineEvent[]): void {
    if (!player.alive || this.phase !== 'playing') return;
    let n = count;
    if (player.mathSubDraw > 0) {
      n = Math.max(0, n - player.mathSubDraw);
      player.mathSubDraw = 0;
    }
    // 猪王暴食：每次摸牌多摸一张
    if (player.characterId === 'pig_king' && player.fullTurns <= 0) n += 1;
    if (n <= 0) {
      this.log(events, `🧊 ${player.name} 因减法标记，这次一张牌都没摸到`);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (this.chaosDrawsActive) {
        this.chaosSteal(player, events);
        continue;
      }
      const c = this.deck.pop();
      if (!c) break;
      if (c.cardId === 'tear') {
        this.handleTearDrawn(player, c, events);
        return;
      }
      if (this.isExploding(c)) {
        if (this.tryAppleConvert(player, c, events)) continue;
        this.handleExplosion(player, c, events);
        return;
      }
      player.hand.push(c);
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
    }
  }

  /** bigEye 档案：其他玩家使用功能牌时积累档案（记在出牌者身上，上限 maxArchives） */
  private addArchive(playSessionId: string): void {    if (this.phase !== 'playing') return;
    const watcher = this.players.find((p) => p.characterId === 'bigEye' && p.alive);
    if (!watcher || watcher.sessionId === playSessionId) return;
    const p = this.players.find((x) => x.sessionId === playSessionId);
    if (!p) return;
    const skill = this.activeSkillOf(watcher, 'bigeye-expose');
    const max = skill?.effect.kind === 'bigEyeExpose' ? skill.effect.maxArchives : 4;
    if (p.archives < max) p.archives++;
  }

  /** chaos_queen 涟漪：有玩家因他人手牌数量变化 → 女王摸 1 张（每回合 1 次） */
  private chaosRipple(events: EngineEvent[]): void {
    if (this.phase !== 'playing') return;
    const cq = this.players.find(
      (p) => p.characterId === 'chaos_queen' && p.alive && !p.rippleUsedThisTurn,
    );
    if (!cq) return;
    const c = this.deck.pop();
    if (!c) return;
    if (c.cardId === 'tear' || this.isExploding(c)) {
      // 危险牌静默塞回随机位置、不消耗涟漪：避免在其他玩家结算中途挂起眼泪/拆解流程
      const pos = Math.floor(this.rng() * this.deck.length);
      this.deck.splice(this.deck.length - pos, 0, c);
      return;
    }
    cq.rippleUsedThisTurn = true;
    cq.hand.push(c);
    this.ev(events, { type: 'hand', sessionId: cq.sessionId });
    this.log(events, `🌀 涟漪：${cq.name} 感知到手牌变化，摸了 1 张牌`);
  }

  /** 铁壁骑士：被偷免疫 */
  private tryImmuneSteal(target: EnginePlayer, events: EngineEvent[]): boolean {
    const skill = this.skillOf(target, 'onStolenFrom');
    if (skill?.effect.kind !== 'immuneSteal') return false;
    const st = this.skillState(target, skill.id);
    if (st.passiveUsed >= skill.effect.times) return false;
    st.passiveUsed++;
    this.log(events, `${target.name} 的「${skill.name}」生效，偷牌无效 🛡️`);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 摸牌 / 爆炸 / 回合                                                  */
  /* ------------------------------------------------------------------ */

  /** 玩家主动结束回合：摸一张牌 */
  drawCard(sessionId: string): EngineEvent[] {
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    if (this.subPhase !== 'awaiting-action') return this.invalid(sessionId, '当前不能摸牌');
    const player = this.current();
    if (!player || player.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');

    const events: EngineEvent[] = [];

    // Pig King：消化完成的牌必须先处理，不能结束回合
    if (player.mustPlayIid) {
      return this.invalid(sessionId, '必须先处理消化获得的牌（打出或丢弃）');
    }

    // Pig King 饱腹：不能摸牌，直接结束回合（跳过摸牌，避免无牌可出时卡死）
    if (player.fullTurns > 0) {
      this.log(events, `🐷 ${player.name} 饱腹中，跳过摸牌结束回合`);
      return this.finishTurn(events);
    }

    // 秀英冰冻：无法出牌和摸牌，直接结束回合
    if (this.isFrozen(player)) {
      this.log(events, `🧊 ${player.name} 冰冻中（剩 ${player.freezeLayers} 层），跳过摸牌结束回合`);
      return this.finishTurn(events);
    }

    // Pig King 暴食：每次多摸 1 张
    let draws = this.worldRuleId === 'double-down' ? 2 : 1;
    if (player.characterId === 'pig_king') draws += 1;

    // 数学老师减法：下一次摸牌少摸 1 张（最少 0）
    if (player.mathSubDraw > 0) {
      draws = Math.max(0, draws - player.mathSubDraw);
      player.mathSubDraw = 0;
      if (draws === 0) {
        this.log(events, `📐 ${player.name} 受减法影响，这次一张牌都没摸到`);
        return this.finishTurn(events);
      }
    }

    // Pig King 饱腹解除后：必须连摸 3 张
    if (player.forcedDraws > 0) {
      draws = Math.max(draws, player.forcedDraws);
      player.forcedDraws = 0;
    }

    let drew = 0;
    while (drew < draws) {
      drew++;

      // chaos_queen 混沌之触：摸牌变为从随机玩家偷牌
      if (this.chaosDrawsActive) {
        const stealResult = this.chaosSteal(player, events);
        if (stealResult === 'dead') return events;
        if (drew >= draws) return this.finishTurn(events);
        continue;
      }

      const c = this.deck.pop();
      if (!c) break;

      // 眼泪牌：进入眼泪选择流程
      if (c.cardId === 'tear') {
        this.handleTearDrawn(player, c, events);
        return events; // 眼泪处理完后自动继续
      }

      if (this.isExploding(c)) {
        // 邪恶苹果头自己摸到爆炸苹果：放回牌堆 + 再摸一张
        if (this.tryAppleConvert(player, c, events)) {
          if (drew >= draws) return this.finishTurn(events);
          continue;
        }
        const r = this.handleExplosion(player, c, events);
        if (r === 'suspend-defuse' || !player.alive) return events;
        if (drew >= draws) return this.finishTurn(events);
        continue;
      }
      player.hand.push(c);
      this.ev(events, { type: 'hand', sessionId });
    }
    if (this.worldRuleId === 'double-down') {
      this.log(events, `${player.name} 双倍下注，摸了 2 张牌 🎰`);
    } else if (draws > 1) {
      this.log(events, `${player.name} 暴食发动，摸了 ${draws} 张牌 🐷`);
    } else {
      this.log(events, `${player.name} 摸了一张牌`);
    }
    objHand(player, events);
    return this.finishTurn(events);
  }

  /** chaos_queen 混沌之触：从随机存活玩家偷 1 张（返回 'dead' 如果玩家死了） */
  private chaosSteal(player: EnginePlayer, events: EngineEvent[]): 'ok' | 'dead' {
    const others = this.players.filter((p) => p.alive && p.sessionId !== player.sessionId && p.hand.length > 0);
    if (others.length === 0) {
      this.log(events, `${player.name} 的混沌摸牌无目标可偷`);
      return 'ok';
    }
    const victim = others[Math.floor(this.rng() * others.length)]!;
    const idx = Math.floor(this.rng() * victim.hand.length);
    const [stolen] = victim.hand.splice(idx, 1);
    if (!stolen) return 'ok';
    player.hand.push(stolen);
    this.ev(events, { type: 'hand', sessionId: victim.sessionId });
    this.ev(events, { type: 'hand', sessionId: player.sessionId });
    this.ev(events, {
      type: 'private',
      sessionId: victim.sessionId,
      message: { action: 'chaosDraw', fromName: player.name, cardName: this.defOf(stolen).name },
    });
    this.log(events, `🌀 混沌之触：${player.name} 从 ${victim.name} 手中夺取了 1 张牌`);
    this.chaosRipple(events);
    return 'ok';
  }

  /** 摸到眼泪牌：进入 awaiting-tear 子阶段 */
  private handleTearDrawn(player: EnginePlayer, tear: CardInstance, events: EngineEvent[]): void {
    const isNana = player.characterId === 'nana';
    if (isNana) {
      // Nana 摸到眼泪：不能拒绝，直接收取
      player.hand.push(tear);
      player.tearCount++;
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
      this.log(events, `💧 ${player.name} 收下了自己的眼泪（${player.tearCount}/3）`);
      if (player.tearCount >= 3) {
        player.permanentDead = true;
        player.alive = false;
        player.hand = [];
        this.deathOrder.push(player.sessionId);
        this.lastDeath = { sessionId: player.sessionId, name: player.name, at: Date.now() };
        this.log(events, `💀 ${player.name} 被眼泪彻底淹没了……（永久死亡）`);
        this.ev(events, { type: 'death', sessionId: player.sessionId });
        this.checkWin(events);
        if (this.current()?.sessionId === player.sessionId) {
          this.finishTurn(events);
        }
      } else {
        // 继续回合（相当于正常摸牌）
        this.finishTurn(events);
      }
      return;
    }
    // 其他玩家：弹出选择
    this.pendingTear = { sessionId: player.sessionId, tearIid: tear.iid };
    this.subPhase = 'awaiting-tear';
    const nana = this.players.find((p) => p.characterId === 'nana');
    this.ev(events, {
      type: 'private',
      sessionId: player.sessionId,
      message: {
        action: 'tearPrompt',
        isNana: false,
        nanaName: nana?.name ?? 'Nana',
      },
    });
    this.ev(events, { type: 'awaitingTear' });
    this.log(events, `💧 ${player.name} 摸到了 Nana 的眼泪……`);
  }

  /** 摸到爆炸猫：有拆解 → 挂起等待放回位置；没有 → 阵亡 */
  private handleExplosion(
    player: EnginePlayer,
    kitten: CardInstance,
    events: EngineEvent[],
  ): 'ok' | 'suspend-defuse' {
    const defuseIdx = player.hand.findIndex((c) => c.cardId === 'defuse');
    if (defuseIdx >= 0) {
      const [defuse] = player.hand.splice(defuseIdx, 1);
      this.discard.push(defuse!);
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
      this.pendingDefuse = { sessionId: player.sessionId, instanceId: kitten.iid, cardId: kitten.cardId, needsCard: false };
      this.subPhase = 'awaiting-defuse';
      this.log(events, `${player.name} 摸到了爆炸猫，打出拆解 🔧`);
      objDefuse(player, events);
      this.ev(events, {
        type: 'private',
        sessionId: player.sessionId,
        message: { action: 'promptDefuse', deckCount: this.deck.length },
      });
      this.ev(events, { type: 'awaitingDefuse' });
      return 'suspend-defuse';
    }

    // 香蕉女王：无拆解但覆盖期间手牌 ≥4 → 挂起等待「4 张香蕉兑换拆解」
    if (player.characterId === 'banana' && this.bananaOverlayTurns > 0 && player.hand.length >= 4) {
      this.pendingDefuse = { sessionId: player.sessionId, instanceId: kitten.iid, cardId: kitten.cardId, needsCard: true };
      this.subPhase = 'awaiting-defuse';
      this.log(events, `🍌 ${player.name} 摸到了爆炸猫！可以用 4 张香蕉兑换拆解……`);
      this.ev(events, {
        type: 'private',
        sessionId: player.sessionId,
        message: { action: 'promptDefuse', deckCount: this.deck.length, bananaSubstitute: true },
      });
      this.ev(events, { type: 'awaitingDefuse' });
      return 'suspend-defuse';
    }

    // 果奔猫：秘密藏起一张爆炸猫（手里已藏一张时再摸会当场爆炸）
    const holdsExploding = player.hand.some((c) => this.isExploding(c));
    const hasStreaking = player.hand.some((c) => c.cardId === 'streaking');
    if (hasStreaking && !holdsExploding) {
      player.hand.push(kitten);
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
      this.log(events, `${player.name} 摸了一张牌`); // 公开日志不泄露信息
      this.ev(events, {
        type: 'private',
        sessionId: player.sessionId,
        message: {
          action: 'notice',
          text: '🐱‍💨 果奔猫生效：爆炸猫已秘密藏进你的手牌！持有期间无法获胜，再摸到一张会当场爆炸。',
        },
      });
      return 'ok';
    }

    player.alive = false;
    // 手牌洗回牌堆（与日志文案一致，也避免死亡导致牌池流失）
    this.deck.push(...player.hand);
    player.hand = [];
    this.deathOrder.push(player.sessionId);
    this.lastDeath = { sessionId: player.sessionId, name: player.name, at: Date.now() };
    this.shuffle(this.deck);

    // 身上的邪恶苹果随人一起销毁（不会变成爆炸苹果）
    if (player.appleTurns > 0) {
      player.appleTurns = 0;
      player.appleFrom = '';
      this.log(events, `🍏 ${player.name} 出局，身上的邪恶苹果也烂掉了`);
    }

    // Nana：死亡后化作眼泪牌流入牌堆（非永久死亡时）
    if (player.characterId === 'nana' && !player.permanentDead) {
      const tearIid = newIid('tear');
      this.deck.push({ iid: tearIid, cardId: 'tear' });
      this.shuffle(this.deck);
      this.log(events, `💧 ${player.name} 化作一滴眼泪，流向了牌堆……`);
      this.log(events, `💥 ${player.name} 摸到了爆炸猫，出局！（等待眼泪……）`);
    } else {
      this.log(events, `💥 ${player.name} 摸到了爆炸猫，当场爆炸出局！手牌已洗回牌堆`);
    }
    this.ev(events, { type: 'death', sessionId: player.sessionId });

    if (this.checkWin(events)) return 'ok';
    if (this.current()?.sessionId === player.sessionId) {
      this.finishTurn(events);
    }
    return 'ok';
  }

  defusePosition(sessionId: string, position: number): EngineEvent[] {
    if (this.subPhase !== 'awaiting-defuse' || !this.pendingDefuse) {
      return this.invalid(sessionId, '现在没有拆解待结算');
    }
    if (this.pendingDefuse.sessionId !== sessionId) {
      return this.invalid(sessionId, '不是你的拆解');
    }
    if (this.pendingDefuse.needsCard) {
      return this.invalid(sessionId, '你没有拆解，需要用 4 张香蕉兑换 🍌');
    }
    if (!Number.isInteger(position) || position < 0 || position > this.deck.length) {
      return this.invalid(sessionId, '位置无效');
    }
    const events: EngineEvent[] = [];
    const kitten: CardInstance = { iid: this.pendingDefuse.instanceId, cardId: this.pendingDefuse.cardId };
    this.pendingDefuse = null;
    this.subPhase = 'awaiting-action';
    this.deck.splice(this.deck.length - position, 0, kitten);
    const name = this.players.find((p) => p.sessionId === sessionId)?.name;
    // 公开日志不泄露位置（放回位置只有拆解者本人知道）
    this.log(events, `${name} 把爆炸猫放回了牌堆的某个位置 🔧`);
    this.ev(events, { type: 'defuseResolved' });

    if (this.queue) return this.runQueue(events);
    return this.finishTurn(events);
  }

  /** 房间超时兜底：普通拆解放回顶；香蕉兑换待处理则自动用前 4 张手牌兑换 */
  autoDefuseOnTimeout(sessionId: string): EngineEvent[] {
    if (this.subPhase !== 'awaiting-defuse' || this.pendingDefuse?.sessionId !== sessionId) {
      return [];
    }
    if (this.pendingDefuse.needsCard) {
      const p = this.players.find((x) => x.sessionId === sessionId);
      if (p && p.hand.length >= 4) {
        const cost = p.hand.slice(0, 4).map((c) => c.iid);
        return this.handleBananaSubstitute(sessionId, { mode: 'defuse', costInstanceIds: cost, position: 0 });
      }
      return [];
    }
    return this.defusePosition(sessionId, 0);
  }

  alterFutureOrder(sessionId: string, order: number[]): EngineEvent[] {
    if (this.subPhase !== 'awaiting-alter' || !this.pendingAlter) {
      return this.invalid(sessionId, '现在没有重排待结算');
    }
    if (this.pendingAlter.sessionId !== sessionId) {
      return this.invalid(sessionId, '不是你的重排');
    }
    const n = this.pendingAlter.cards.length;
    const ok =
      Array.isArray(order) &&
      order.length === n &&
      new Set(order).size === n &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (!ok) return this.invalid(sessionId, '重排顺序无效');

    const events: EngineEvent[] = [];
    const cards = this.pendingAlter.cards;
    const newTop = order.map((i) => cards[i]!); // 新的顶 n 张（自顶向下）
    this.deck.splice(this.deck.length - n, n, ...[...newTop].reverse());
    this.pendingAlter = null;
    this.subPhase = 'awaiting-action';
    const name = this.players.find((p) => p.sessionId === sessionId)?.name;
    this.log(events, `${name} 重排了牌堆顶的未来 👁️‍🗨️`);
    this.ev(events, { type: 'alterResolved' });
    return this.runQueue(events);
  }

  /** 沿出牌方向找下一个存活玩家 */
  private nextAliveSessionId(): string | undefined {
    const n = this.turnOrder.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turnIndex + this.direction * step + n * 2) % n;
      const p = this.players.find((x) => x.sessionId === this.turnOrder[idx]);
      if (p?.alive) return p.sessionId;
    }
    return undefined;
  }

  private finishTurn(events: EngineEvent[]): EngineEvent[] {
    if (this.phase !== 'playing') return events;
    // 回合结束：未提交的命运改写/揭发点选/求助作废（冷却已扣，防止白嫖看牌）
    this.pendingFutureRewrite = null;
    this.pendingExpose = null;
    if (this.pendingHelp) {
      this.pendingHelp = null;
      this.ev(events, { type: 'helpResolved' });
    }

    const current = this.current();

    // 摸牌底：结束回合前从牌堆底摸 N 张（走统一的爆炸/藏猫结算；乘法可加倍）
    if (this.pendingEndDrawCount > 0 && current?.alive) {
      const n = this.pendingEndDrawCount;
      this.pendingEndDrawCount = 0;
      for (let i = 0; i < n; i++) {
        const c = this.deck.shift();
        if (!c) break;
        if (this.isExploding(c)) {
          if (this.tryAppleConvert(current, c, events)) continue;
          const r = this.handleExplosion(current, c, events);
          if (r === 'suspend-defuse' || !current.alive) return events;
          // streaking 藏猫 → 照常推进回合
        } else {
          current.hand.push(c);
          this.ev(events, { type: 'hand', sessionId: current.sessionId });
          this.log(events, `${current.name} 从牌堆底摸了一张牌`);
        }
      }
    }
    this.pendingEndDrawCount = 0;

    let transfer = 0;
    if (current) {
      current.turnsLeft--;
      transfer = Math.max(0, current.turnsLeft);
      current.turnsLeft = 1; // 重置，下次进入回合时再设置
    }

    const attack = this.pendingAttack;
    const attackMult = this.pendingAttackMult;
    this.pendingAttack = false;
    this.pendingAttackMult = 1;

    if (attack) {
      // 攻击转移：受害者承担 攻击者剩余回合 + 基础回合数（乘法双倍）
      const victimId = this.nextAliveSessionId();
      const victim = this.players.find((p) => p.sessionId === victimId);
      if (victim && victim.alive) {
        const base = (this.worldRuleId === 'overdrive' ? 4 : 2) * attackMult;
        victim.turnsLeft = transfer + base;
        this.turnIndex = this.turnOrder.indexOf(victim.sessionId);
        this.turnCount++;
        this.log(
          events,
          `${victim.name} 被攻击，要连续行动 ${victim.turnsLeft} 个回合 ⚡${attackMult > 1 ? '（乘法加倍）' : ''}`,
        );
        // 秀英冰冻：被攻击也算"被打上技能牌"，冰冻 -1
        this.cardHitsFrozen(victim, '攻击', events);
        this.runTurnStartSkills(victim, events);
        this.ev(events, { type: 'turnAdvanced' });
        return events;
      }
    }

    if (transfer > 0 && current?.alive) {
      // 没出攻击但还有连击（此前被攻击），本人继续
      current.turnsLeft = transfer;
      this.log(events, `${current.name} 的连击回合还剩 ${transfer} 个 ⚡`);
      this.runTurnStartSkills(current, events);
      this.ev(events, { type: 'turnAdvanced' });
      return events;
    }

    this.advanceToNextAlive(events);
    return events;
  }

  private advanceToNextAlive(events: EngineEvent[]): void {
    const n = this.turnOrder.length;
    if (n === 0) return;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turnIndex + this.direction * step + n * 2) % n;
      const p = this.players.find((x) => x.sessionId === this.turnOrder[idx]);
      if (p?.alive) {
        this.turnIndex = idx;
        p.turnsLeft = 1;
        this.turnCount++;
        this.runTurnStartSkills(p, events);
        this.ev(events, { type: 'turnAdvanced' });
        return;
      }
    }
  }

  private runTurnStartSkills(player: EnginePlayer, events: EngineEvent[]): void {
    // 冷却递减（所有技能的冷却在回合开始时-1）
    for (const [skillId, cd] of Object.entries(player.skillCooldowns)) {
      if (cd > 0) player.skillCooldowns[skillId] = cd - 1;
    }

    // chaos_queen 混沌之触：激活者回合开始时关闭
    if (this.chaosDrawsActive && this.chaosDrawsBy === player.sessionId) {
      this.chaosDrawsActive = false;
      this.chaosDrawsBy = '';
      this.log(events, '🌀 混沌之触效果消退了');
    }

    // Banana 大香蕉之怒：轮次制——所有存活玩家各经历一次回合开始即消退
    // （攻击/跳过的连击回合不额外消耗；中途有人死亡则提前结束）
    if (this.bananaOverlayTurns > 0) {
      if (this.bananaOverlaySeen.has(player.sessionId)) {
        // 轮次回绕：本轮所有存活玩家都行动过了
        this.bananaOverlayTurns--;
        this.bananaOverlaySeen = new Set();
        if (this.bananaOverlayTurns <= 0) {
          this.bananaOverlayTurns = 0;
          const banana = this.players.find((p) => p.characterId === 'banana');
          if (banana) banana.isAngry = false;
          this.log(events, '🍌 大香蕉之怒效果消退了');
        }
      }
      if (this.bananaOverlayTurns > 0) {
        this.bananaOverlaySeen.add(player.sessionId);
      }
    }

    // Pig King 消化周期
    if (player.digestion && player.alive) {
      player.digestion.turnsLeft--;
      if (player.digestion.turnsLeft <= 0) {
        const digested = player.digestion.card;
        player.digestion = null;
        player.hand.push(digested);
        player.mustPlayIid = digested.iid;
        player.digestCount++;
        this.ev(events, { type: 'hand', sessionId: player.sessionId });
        this.ev(events, {
          type: 'private',
          sessionId: player.sessionId,
          message: { action: 'digestReady', cardName: this.defOf(digested).name, instanceId: digested.iid },
        });
        // 公开日志不泄露消化获得的卡名（仅本人经私密消息得知）
        this.log(events, `🐷 ${player.name} 消化完成，获得了一张牌！`);

        // 检查饱腹
        const pigSkill = this.skillOf(player, 'active');
        if (pigSkill?.effect.kind === 'pigGluttony' && player.digestCount >= pigSkill.effect.fullAfterDigests) {
          player.fullTurns = pigSkill.effect.fullTurns;
          player.digestCount = 0;
          this.log(events, `🐷 ${player.name} 吃太饱了！${player.fullTurns} 回合内不能摸牌`);
          // 饱腹结束后需要连摸
          // 设置一个标记，在 fullTurns 到 0 时设置 forcedDraws
        }
      }
    }

    // Pig King 饱腹递减
    if (player.fullTurns > 0) {
      player.fullTurns--;
      if (player.fullTurns === 0) {
        const pigSkill = this.skillOf(player, 'active');
        if (pigSkill?.effect.kind === 'pigGluttony') {
          player.forcedDraws = 3; // 饱腹解除后必须连摸 3 张
          this.log(events, `🐷 ${player.name} 饿了！下一回合必须连摸 3 张牌`);
        }
      }
    }

    // chaos_queen 涟漪被动重置
    player.rippleUsedThisTurn = false;
    // v3：每回合重置的互动标记（秀英求助名单 / 荔枝次数）
    player.askedHelp = [];
    player.lycheeGivenThisTurn = 0;
    player.helpedThisTurn = false;

    // v4：邪恶苹果倒计时——存在 3 个回合后，第 4 个回合开始时变成爆炸苹果混入牌堆
    if (player.appleTurns > 0 && player.alive) {
      if (player.appleTurns === 1) {
        player.appleTurns = 0;
        player.appleFrom = '';
        const pos = Math.floor(this.rng() * (this.deck.length + 1));
        this.deck.splice(pos, 0, { iid: newIid('exploding-apple'), cardId: 'exploding-apple' });
        this.log(events, `🍏 ${player.name} 身上的邪恶苹果熟透了——它变成了爆炸苹果混进了牌堆！`);
      } else {
        player.appleTurns--;
        this.log(events, `🍏 ${player.name} 身上的邪恶苹果还剩 ${player.appleTurns} 回合（${player.appleTurns} 回合后变成爆炸苹果）`);
      }
    }

    // World Rule 传递快乐：随机一张传给下家
    if (this.worldRuleId === 'pass-joy' && player.alive && player.hand.length > 0) {
      const nextId = this.nextAliveSessionId();
      const next = this.players.find((p) => p.sessionId === nextId);
      if (next && next.sessionId !== player.sessionId) {
        const idx = Math.floor(this.rng() * player.hand.length);
        const [card] = player.hand.splice(idx, 1);
        next.hand.push(card!);
        this.ev(events, { type: 'hand', sessionId: player.sessionId });
        this.ev(events, { type: 'hand', sessionId: next.sessionId });
        // 公开日志不泄露传的什么牌
        this.log(events, `🎁 ${player.name} 传了一张牌给 ${next.name}（是…才不告诉你）`);
        this.chaosRipple(events);
      }
    }
    // World Rule 全员天眼：当前玩家看牌堆顶 1 张
    if (this.worldRuleId === 'all-seeing' && this.deck.length > 0) {
      const top = this.deck[this.deck.length - 1]!;
      this.ev(events, {
        type: 'private',
        sessionId: player.sessionId,
        message: { action: 'peekDeck', cards: [this.defOf(top)] },
      });
    }
    const skill = this.skillOf(player, 'turnStart');
    if (skill?.effect.kind === 'peekAtTurnStart') {
      const n = Math.min(skill.effect.count, this.deck.length);
      const top = this.deck.slice(this.deck.length - n).reverse();
      if (top.length > 0) {
        this.ev(events, {
          type: 'private',
          sessionId: player.sessionId,
          message: { action: 'peekDeck', cards: top.map((i) => this.defOf(i)) },
        });
      }
    }
  }

  private checkWin(events: EngineEvent[]): boolean {
    if (this.phase !== 'playing') return false;
    const alive = this.players.filter((p) => p.alive);
    const holdsHidden = (p: EnginePlayer) =>
      p.hand.some((c) => this.isExploding(c));
    /** Nana 可复活（非永久死亡且眼泪未满）时不判负 */
    const canRevive = (p: EnginePlayer) =>
      p.characterId === 'nana' && !p.permanentDead && p.tearCount < 3;

    if (alive.length === 0) {
      // 全灭（极罕见）：最后阵亡者为赢家（跳过可复活的 Nana）
      const dead = this.players.filter((p) => !p.alive);
      const revivable = dead.filter(canRevive);
      if (revivable.length > 0) return false; // Nana 还能复活，游戏继续
      const last = this.deathOrder[this.deathOrder.length - 1];
      return this.finishGame(last, events);
    }

    if (alive.length === 1) {
      const only = alive[0]!;
      // 果奔猫规则：藏有爆炸猫的独存者判负，胜者是最后阵亡者
      if (holdsHidden(only)) {
        const lastDead = this.deathOrder[this.deathOrder.length - 1];
        if (lastDead && lastDead !== only.sessionId) {
          return this.finishGame(lastDead, events);
        }
      }
      return this.finishGame(only.sessionId, events);
    }

    // 2+ 人存活：不提前结束（藏猫者仍在场，游戏继续）
    return false;
  }

  private finishGame(winnerSessionId: string | undefined, events: EngineEvent[]): boolean {
    this.phase = 'finished';
    this.subPhase = 'awaiting-action';
    this.winnerSessionId = winnerSessionId ?? '';
    const winner = this.players.find((p) => p.sessionId === this.winnerSessionId);
    if (winner) this.log(events, `🏆 ${winner.name} 获得胜利！`);
    this.ev(events, {
      type: 'gameEnd',
      winnerSessionId: this.winnerSessionId,
      objectives: objectiveReport(this.players),
    } as EngineEvent);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 主动技能                                                            */
  /* ------------------------------------------------------------------ */

  useSkill(sessionId: string, input: UseSkillInput): EngineEvent[] {
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    if (this.subPhase !== 'awaiting-action') return this.invalid(sessionId, '当前不能使用技能');
    const player = this.players.find((p) => p.sessionId === sessionId);
    if (!player || !player.alive) return this.invalid(sessionId, '你无法使用技能');
    if (this.current()?.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');

    const skill = this.activeSkillOf(player, input.skillId);
    if (!skill) return this.invalid(sessionId, '你没有这个主动技能');
    if (
      skill.effect.kind !== 'activeSteal' &&
      skill.effect.kind !== 'activeRecycle' &&
      skill.effect.kind !== 'activeSwap' &&
      skill.effect.kind !== 'bananaRage' &&
      skill.effect.kind !== 'pigGluttony' &&
      skill.effect.kind !== 'chaosWarp' &&
      skill.effect.kind !== 'chaosTouch' &&
      skill.effect.kind !== 'futureRewrite' &&
      skill.effect.kind !== 'voyageSwap' &&
      skill.effect.kind !== 'bigEyeExpose' &&
      skill.effect.kind !== 'mathOp' &&
      skill.effect.kind !== 'iceHelp' &&
      skill.effect.kind !== 'iceLychee' &&
      skill.effect.kind !== 'appleThrow'
    ) {
      return this.invalid(sessionId, '该技能不是主动技能');
    }
    const skillEffect = skill.effect;

    const events: EngineEvent[] = [];
    const st = this.skillState(player, skill.id);
    // uses 检查：仅对有 uses 属性的原型生效
    const usesVal = (skillEffect as { uses?: number }).uses;
    if (usesVal !== undefined && st.used >= usesVal) {
      return this.invalid(sessionId, '技能次数已用完');
    }

    const cost = input.costInstanceIds ?? [];
    const requiredCost = skillEffect.kind === 'activeSwap' ? 0 : (skillEffect as { costCards?: number }).costCards ?? 0;
    if (cost.length !== requiredCost) {
      if (requiredCost > 0) {
        return this.invalid(sessionId, `需要弃置 ${requiredCost} 张牌作为代价`);
      }
      // activeSwap 不需要代价牌
    }
    const costInstances: CardInstance[] = [];
    for (const id of cost) {
      const c = player.hand.find((x) => x.iid === id);
      if (!c) return this.invalid(sessionId, '代价牌不在你手中');
      costInstances.push(c);
    }

    if (skillEffect.kind === 'activeSteal') {
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家');
      }
      if (!input.wantCardId || !this.cardMap.has(input.wantCardId)) {
        return this.invalid(sessionId, '需要指定要偷的牌');
      }
      const idx = target.hand.findIndex((c) => c.cardId === input.wantCardId);
      if (idx < 0) return this.invalid(sessionId, '对方没有这张牌（技能未消耗）');

      player.hand = player.hand.filter((c) => !costInstances.some((x) => x.iid === c.iid));
      this.discard.push(...costInstances);
      st.used++;
      this.ev(events, { type: 'hand', sessionId });

      if (this.tryImmuneSteal(target, events)) {
        this.log(events, `${player.name} 发动「${skill.name}」，但被挡下了 🎭`);
        return events;
      }
      const [stolen] = target.hand.splice(idx, 1);
      player.hand.push(stolen!);
      this.ev(events, { type: 'hand', sessionId: target.sessionId });
      this.ev(events, { type: 'hand', sessionId });
      // 公开日志不泄露卡名；当事人经私密消息得知
      this.log(events, `${player.name} 发动「${skill.name}」，偷走了 ${target.name} 的 1 张牌 🦹`);
      this.ev(events, {
        type: 'private',
        sessionId: target.sessionId,
        message: { action: 'chaosDraw', fromName: player.name, cardName: this.defOf(stolen!).name },
      });
      this.chaosRipple(events);
      return events;
    }

    if (skillEffect.kind === 'activeRecycle') {
      const top = this.discard[this.discard.length - 1];
      if (!top) return this.invalid(sessionId, '弃牌堆是空的');

      const [recycled] = this.discard.splice(this.discard.length - 1, 1);
      player.hand = player.hand.filter((c) => !costInstances.some((x) => x.iid === c.iid));
      this.discard.push(...costInstances);
      player.hand.push(recycled!);
      st.used++;
      this.ev(events, { type: 'hand', sessionId });
      this.log(events, `${player.name} 发动「${skill.name}」，回收了弃牌堆顶的【${this.defOf(recycled!).name}】⚗️`);
      return events;
    }

    if (skillEffect.kind === 'activeSwap') {
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家');
      }
      // 交换全部手牌
      const tmp = player.hand;
      player.hand = target.hand;
      target.hand = tmp;
      st.used++;
      this.ev(events, { type: 'hand', sessionId });
      this.ev(events, { type: 'hand', sessionId: target.sessionId });
      this.log(
        events,
        `${player.name} 发动「${skill.name}」，与 ${target.name} 交换了全部手牌 ⚓（${player.hand.length} 张 ↔ ${target.hand.length} 张）`,
      );
      this.chaosRipple(events);
      // 回合立即结束
      this.finishTurn(events);
      return events;
    }

    // ---- v2：新角色技能 ----
    if (skillEffect.kind === 'bananaRage') {
      // Banana：大香蕉之怒（无拆解时才能发动；3 次/局，冷却 3 回合，覆盖期间禁止再发动）
      if (this.bananaOverlayTurns > 0) {
        return this.invalid(sessionId, '大香蕉之怒正在生效，无法再次发动');
      }
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `大香蕉之怒冷却中（剩 ${cd} 回合）`);
      if (player.hand.some((c) => c.cardId === 'defuse')) {
        return this.invalid(sessionId, '手中有拆解时不能发动大香蕉之怒');
      }
      this.bananaOverlayTurns = skillEffect.overlayTurns;
      // 轮次制：发动者本回合已开始，先记入本轮名单
      this.bananaOverlaySeen = new Set([sessionId]);
      player.isAngry = true;
      player.skillCooldowns[skill.id] = skill.cooldownTurns ?? 3;
      st.used++;
      // 洗乱全场存活玩家手牌：打断位置记忆，让"覆盖"真正生效
      for (const p of this.players) {
        if (!p.alive) continue;
        this.shuffle(p.hand);
        this.ev(events, { type: 'hand', sessionId: p.sessionId });
      }
      this.log(
        events,
        `🍌 ${player.name} 发动「${skill.name}」！全场手牌变成了愤怒香蕉并被打乱！（持续一轮：所有存活玩家各行动一次）`,
      );
      this.ev(events, { type: 'private', sessionId, message: { action: 'notice', text: '🍌 大香蕉之怒已发动！覆盖持续一轮：点击手牌只会选中，2 张=任意技能牌，4 张=1 拆解；同名猫组合不可用。' } });
      return events;
    }

    if (skillEffect.kind === 'mathOp') {
      // 数学老师：四则运算（各自独立冷却，不能指定自己）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `「${skill.name}」冷却中（剩 ${cd} 回合）`);
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家（不能指定自己）');
      }
      // 冰冻（秀英）不受技能影响：技能无效，但冰冻 -1
      if (this.frozenBlocksSkill(target, events, skill.name)) {
        player.skillCooldowns[skill.id] = skillEffect.cooldownTurns;
        return events;
      }
      player.skillCooldowns[skill.id] = skillEffect.cooldownTurns;
      switch (skillEffect.op) {
        case 'add': {
          this.log(events, `📐 ${player.name} 对 ${target.name} 使用「加法」，${target.name} 立即摸一张牌`);
          this.grantDraw(target, 1, events);
          break;
        }
        case 'sub': {
          target.mathSubDraw++;
          this.log(events, `📐 ${player.name} 对 ${target.name} 使用「减法」，其下次摸牌少摸一张`);
          break;
        }
        case 'mul': {
          target.mathMulNext++;
          this.log(events, `📐 ${player.name} 对 ${target.name} 使用「乘法」，其下一张功能牌触发两次`);
          break;
        }
        case 'div': {
          target.mathDivNext++;
          this.log(events, `📐 ${player.name} 对 ${target.name} 使用「除法」，其下一张功能牌无法触发`);
          break;
        }
      }
      return events;
    }

    if (skillEffect.kind === 'iceHelp') {
      // 秀英：救救老奶（冰冻时才能求助；等待被求助者回应）
      if (player.freezeLayers <= 0) {
        return this.invalid(sessionId, '已经解冻了，不需要求助');
      }
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `求助冷却中（剩 ${cd} 回合）`);
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家求助');
      }
      if (player.askedHelp.includes(target.sessionId)) {
        return this.invalid(sessionId, '本回合已经问过这位玩家了');
      }
      player.askedHelp.push(target.sessionId);
      this.pendingHelp = { ownerSessionId: sessionId, helperSessionId: target.sessionId };
      this.subPhase = 'awaiting-help';
      this.log(events, `🧊 ${player.name} 向 ${target.name} 求助：「救救我，孩子们！」`);
      this.ev(events, { type: 'private', sessionId: target.sessionId, message: { action: 'helpPrompt', fromName: player.name } });
      this.ev(events, { type: 'awaitingHelp' });
      return events;
    }

    if (skillEffect.kind === 'iceLychee') {
      // 秀英：乖孩子（解冻中或被帮助过的回合可以喂；每回合上限）
      if (this.isFrozen(player)) {
        return this.invalid(sessionId, '冰冻中无法喂荔枝（可先向其他玩家求助）');
      }
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家（不能喂自己）');
      }
      if (player.lycheeGivenThisTurn >= skillEffect.perTurn) {
        return this.invalid(sessionId, '本回合已经喂过荔枝了');
      }
      player.lycheeGivenThisTurn++;
      target.lychees++;
      this.log(events, `🍒 ${player.name} 喂给 ${target.name} 一颗荔枝（${target.lychees}/2）`);
      if (target.lychees >= 2) {
        target.lychees = 0;
        const plains = [...this.cardMap.values()].filter((c) => c.kind === 'plain' && c.comboable);
        if (plains.length > 0) {
          const picked = plains[Math.floor(this.rng() * plains.length)]!;
          target.hand.push({ iid: newIid(picked.id), cardId: picked.id });
          this.ev(events, { type: 'hand', sessionId: target.sessionId });
          this.log(events, `🍒 ${target.name} 集齐 2 颗荔枝，获得了一张普通小猫牌！`);
        }
      }
      return events;
    }

    if (skillEffect.kind === 'appleThrow') {
      // 邪恶苹果头：投掷邪恶苹果（每人最多 1 个；目标在自己回合内可吃掉）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `投掷苹果冷却中（剩 ${cd} 回合）`);
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家（不能扔自己）');
      }
      if (target.appleTurns > 0) {
        return this.invalid(sessionId, '这位玩家身上已经有邪恶苹果了');
      }
      target.appleTurns = 3;
      target.appleFrom = sessionId;
      player.skillCooldowns[skill.id] = skillEffect.cooldownTurns;
      this.log(events, `🍏 ${player.name} 朝 ${target.name} 扔了一个邪恶苹果！（3 回合内不吃就会变成爆炸苹果）`);
      this.ev(events, {
        type: 'private',
        sessionId: target.sessionId,
        message: { action: 'appleGiven', fromName: player.name, turns: 3 },
      });
      return events;
    }

    if (skillEffect.kind === 'pigGluttony') {
      // Pig King：吞噬（冷却制）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `吞噬冷却中（剩 ${cd} 回合）`);
      if (player.digestion) return this.invalid(sessionId, '正在消化中，不能吞噬');
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家');
      }
      // 冰冻（秀英）不受技能影响
      if (this.frozenBlocksSkill(target, events, skill.name)) {
        player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.digestTurns;
        return events;
      }
      const candidates = target.hand.filter((c) => c.cardId !== 'defuse');
      if (candidates.length === 0) {
        return this.invalid(sessionId, '对方没有可吞噬的牌（全是拆解）');
      }
      const eaten = candidates[Math.floor(this.rng() * candidates.length)]!;
      target.hand = target.hand.filter((c) => c.iid !== eaten.iid);
      player.digestion = { card: eaten, turnsLeft: skillEffect.digestTurns };
      player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.digestTurns;
      this.ev(events, { type: 'hand', sessionId: target.sessionId });
      this.log(
        events,
        `🐷 ${player.name} 吞噬了 ${target.name} 的一张牌，正在消化……（${skillEffect.digestTurns} 回合后可用）`,
      );
      return events;
    }

    if (skillEffect.kind === 'chaosWarp') {
      // chaos_queen：扭曲空间（反转出牌顺序）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `扭曲空间冷却中（剩 ${cd} 回合）`);
      this.direction = this.direction === 1 ? -1 : 1;
      player.skillCooldowns[skill.id] = skillEffect.cooldownTurns;
      this.log(events, `🌀 ${player.name} 发动「${skill.name}」，出牌顺序反转！`);
      return events;
    }

    if (skillEffect.kind === 'chaosTouch') {
      // chaos_queen：混沌之触（全场摸牌变为偷牌）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `混沌之触冷却中（剩 ${cd} 回合）`);
      this.chaosDrawsActive = true;
      this.chaosDrawsBy = sessionId;
      player.skillCooldowns[skill.id] = skillEffect.cooldownTurns;
      this.log(events, `🌀 ${player.name} 发动「${skill.name}」！接下来一轮所有摸牌变为夺取！`);
      this.ev(events, { type: 'private', sessionId, message: { action: 'chaosTouch', playerName: player.name } });
      return events;
    }

    if (skillEffect.kind === 'futureRewrite') {
      // future_queen：命运改写（看顶 5 张，等待 futureRewritePick）
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `命运改写冷却中（剩 ${cd} 回合）`);
      if (this.deck.length === 0) return this.invalid(sessionId, '牌堆是空的');
      if (player.hand.length === 0) return this.invalid(sessionId, '命运改写需要 1 张手牌来交换');
      const n = Math.min(skillEffect.peekCount, this.deck.length);
      const top = this.deck.slice(this.deck.length - n).reverse();
      this.pendingFutureRewrite = { sessionId, cards: top };
      player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.cooldownTurns;
      this.log(events, `🌠 ${player.name} 开始编织命运……（查看了牌堆顶 ${n} 张）`);
      this.ev(events, {
        type: 'private',
        sessionId,
        message: { action: 'futureRewrite', cards: top.map((i) => this.defOf(i)) },
      });
      return events;
    }

    if (skillEffect.kind === 'voyageSwap') {
      // Voyage：与指定玩家换 N 张（自己可指定交出哪 N 张，对方随机），回合立即结束
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `技能冷却中（剩 ${cd} 回合）`);
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家');
      }
      const n = skillEffect.count;
      if (player.hand.length < n || target.hand.length < n) {
        return this.invalid(sessionId, `双方手牌都需要至少 ${n} 张才能交换 ⚓`);
      }
      // 冰冻（秀英）不受技能影响
      if (this.frozenBlocksSkill(target, events, skill.name)) {
        player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.cooldownTurns;
        return events;
      }
      // 自己交出的牌：可指定（恰好 N 张、不重复、均在手中）；未指定则随机（机器人）
      const giveIds = input.costInstanceIds ?? [];
      let mine: CardInstance[];
      if (giveIds.length > 0) {
        if (giveIds.length !== n || new Set(giveIds).size !== n) {
          return this.invalid(sessionId, `需要指定 ${n} 张不重复的手牌交出 ⚓`);
        }
        mine = [];
        for (const id of giveIds) {
          const c = player.hand.find((x) => x.iid === id);
          if (!c) return this.invalid(sessionId, '指定的手牌不在你手中');
          mine.push(c);
        }
      } else {
        mine = this.pickRandomFrom(player.hand, n);
      }
      // 对方始终随机
      const theirs = this.pickRandomFrom(target.hand, n);
      const mineSet = new Set(mine.map((c) => c.iid));
      const theirsSet = new Set(theirs.map((c) => c.iid));
      player.hand = [...player.hand.filter((c) => !mineSet.has(c.iid)), ...theirs];
      target.hand = [...target.hand.filter((c) => !theirsSet.has(c.iid)), ...mine];
      player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.cooldownTurns;
      this.chaosRipple(events);
      this.ev(events, { type: 'hand', sessionId });
      this.ev(events, { type: 'hand', sessionId: target.sessionId });
      // 公开日志不泄露交换了什么牌
      this.log(events, `⚓ ${player.name} 发动「${skill.name}」，与 ${target.name} 交换了 ${n} 张手牌`);
      // 回合立即结束
      this.finishTurn(events);
      return events;
    }

    if (skillEffect.kind === 'bigEyeExpose') {
      // bigEye：揭发——按目标档案数执行查看/弃牌/抽牌，发动后档案清零
      const cd = player.skillCooldowns[skill.id] ?? 0;
      if (cd > 0) return this.invalid(sessionId, `揭发冷却中（剩 ${cd} 回合）`);
      const target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家');
      }
      if (target.archives < 2) {
        return this.invalid(sessionId, '该玩家的档案不足 2 个，无法揭发 👀');
      }
      // 冰冻（秀英）不受技能影响
      if (this.frozenBlocksSkill(target, events, skill.name)) {
        player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.cooldownTurns;
        return events;
      }
      const mode: 'view' | 'discard' | 'steal' = target.archives >= 4 ? 'steal' : target.archives === 3 ? 'discard' : 'view';
      player.skillCooldowns[skill.id] = skill.cooldownTurns ?? skillEffect.cooldownTurns;
      const archives = target.archives;
      target.archives = 0;
      this.log(events, `👀 ${player.name} 揭发了 ${target.name}！（${archives} 个档案）`);
      if (mode !== 'view') {
        this.pendingExpose = { sessionId, targetSessionId: target.sessionId, mode };
      }
      this.ev(events, {
        type: 'private',
        sessionId,
        message: {
          action: 'exposePrompt',
          targetName: target.name,
          cards: target.hand.map((c) => ({ instanceId: c.iid, def: this.defOf(c) })),
          mode,
        },
      });
      return events;
    }

    return this.invalid(sessionId, '该技能不是主动技能');
  }

  /* ------------------------------------------------------------------ */
  /* v2：五角色新消息处理                                                 */
  /* ------------------------------------------------------------------ */

  /** 眼泪选择：accept=true 时 giveInstanceId 为要喂给 Nana 的牌 */
  handleTearChoice(
    sessionId: string,
    input: { accept: boolean; giveInstanceId?: string },
  ): EngineEvent[] {
    if (this.subPhase !== 'awaiting-tear' || !this.pendingTear) {
      return this.invalid(sessionId, '现在没有眼泪待处理');
    }
    if (this.pendingTear.sessionId !== sessionId) {
      return this.invalid(sessionId, '不是你的眼泪');
    }
    const player = this.players.find((p) => p.sessionId === sessionId)!;
    const nana = this.players.find((p) => p.characterId === 'nana');
    const events: EngineEvent[] = [];

    // 先校验再消费 pendingTear：非法输入不吞眼泪，窗口保持可重试
    if (input.accept) {
      if (!nana || nana.permanentDead) {
        return this.invalid(sessionId, 'Nana 已无法复活，只能拒绝');
      }
      if (!input.giveInstanceId) {
        return this.invalid(sessionId, '需要选择一张要喂的牌');
      }
      if (!player.hand.some((c) => c.iid === input.giveInstanceId)) {
        return this.invalid(sessionId, '要给的牌不在你手中');
      }
    }

    // 校验通过，消费 pendingTear（眼泪牌不进手牌，直接在 pending 中）
    this.pendingTear = null;
    this.subPhase = 'awaiting-action';

    if (input.accept && input.giveInstanceId && nana && !nana.permanentDead) {
      // 选择喂给 Nana：弃 1 张手牌 → Nana 复活获得该牌
      const idx = player.hand.findIndex((c) => c.iid === input.giveInstanceId);
      const [given] = player.hand.splice(idx, 1);

      // Nana 复活（并从死亡序列中移除，保证 gameEnd 排名正确）
      nana.alive = true;
      nana.hand = [given!];
      this.deathOrder = this.deathOrder.filter((id) => id !== nana.sessionId);
      this.ev(events, { type: 'revive', sessionId: nana.sessionId });
      this.ev(events, { type: 'hand', sessionId: nana.sessionId });
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
      this.log(events, `💧 ${player.name} 喂了 Nana 一张牌，Nana 复活了！`);

      // 眼泪牌传递给下一位存活玩家（入其手牌）
      const nextAlive = this.nextAliveSessionId();
      const nextPlayer = this.players.find((p) => p.sessionId === nextAlive);
      if (nextPlayer && nextPlayer.sessionId !== player.sessionId) {
        nextPlayer.hand.push({ iid: newIid('tear'), cardId: 'tear' });
        this.ev(events, { type: 'hand', sessionId: nextPlayer.sessionId });
        if (nextPlayer.characterId === 'nana') {
          nextPlayer.tearCount++;
          this.log(events, `💧 眼泪流回了 Nana 手中（${nextPlayer.tearCount}/3）`);
          this.checkNanaTearDeath(nextPlayer, events);
        } else {
          this.log(events, `💧 眼泪流到了 ${nextPlayer.name} 手中`);
        }
      }
    } else {
      // 拒绝：额外摸 2 张牌，眼泪放回牌堆顶
      for (let i = 0; i < 2; i++) {
        const c = this.deck.pop();
        if (!c) break;
        if (this.isExploding(c)) {
          this.handleExplosion(player, c, events);
          return events;
        }
        player.hand.push(c);
      }
      this.deck.push({ iid: newIid('tear'), cardId: 'tear' });
      this.ev(events, { type: 'hand', sessionId: player.sessionId });
      this.log(events, `${player.name} 拒绝了眼泪，摸了 2 张牌，眼泪回到牌堆顶`);
    }

    // 恢复回合（摸到眼泪等于摸了牌，继续正常流程）
    return this.finishTurn(events);
  }

  /** Nana 眼泪死亡检查 */
  private checkNanaTearDeath(player: EnginePlayer, events: EngineEvent[]): void {
    const skill = this.skillOf(player, 'gameStart');
    const maxTears = skill?.effect.kind === 'nanaTear' ? skill.effect.maxTears : 3;
    if (player.tearCount >= maxTears) {
      player.permanentDead = true;
      player.alive = false;
      player.hand = [];
      this.deathOrder.push(player.sessionId);
      this.log(events, `💀 ${player.name} 被眼泪彻底淹没了……（永久死亡）`);
      this.ev(events, { type: 'death', sessionId: player.sessionId });
      this.checkWin(events);
    }
  }

  /** 复活玩家 */
  revivePlayer(sessionId: string, cards: CardInstance[], events: EngineEvent[]): void {
    const p = this.players.find((x) => x.sessionId === sessionId);
    if (!p || p.alive || p.permanentDead) return;
    p.alive = true;
    p.hand = cards;
    // 从死亡序列中移除
    this.deathOrder = this.deathOrder.filter((id) => id !== sessionId);
    this.ev(events, { type: 'revive', sessionId });
    this.ev(events, { type: 'hand', sessionId });
  }

  /** 香蕉货币替换（仅香蕉女王，大香蕉之怒覆盖期间） */
  handleBananaSubstitute(
    sessionId: string,
    input: {
      mode: 'defuse' | 'action';
      cardId?: string;
      costInstanceIds: string[];
      position?: number;
      targetSessionId?: string;
    },
  ): EngineEvent[] {
    const player = this.players.find((p) => p.sessionId === sessionId);
    if (!player || !player.alive) return this.invalid(sessionId, '你无法使用香蕉兑换');
    if (player.characterId !== 'banana') return this.invalid(sessionId, '只有香蕉女王能用香蕉兑换');
    if (this.bananaOverlayTurns <= 0) return this.invalid(sessionId, '大香蕉之怒未激活');

    const costCount = input.mode === 'defuse' ? 4 : 2;
    const cost = input.costInstanceIds ?? [];
    if (!Array.isArray(cost) || cost.length !== costCount || new Set(cost).size !== costCount) {
      return this.invalid(sessionId, `需要 ${costCount} 张不重复的手牌作为代价`);
    }
    const costInstances: CardInstance[] = [];
    for (const id of cost) {
      const c = player.hand.find((x) => x.iid === id);
      if (!c) return this.invalid(sessionId, '代价牌不在你手中');
      costInstances.push(c);
    }

    const events: EngineEvent[] = [];

    if (input.mode === 'defuse') {
      // 4 张香蕉 = 1 拆解（在等待拆解时发动）
      if (this.subPhase !== 'awaiting-defuse' || this.pendingDefuse?.sessionId !== sessionId) {
        return this.invalid(sessionId, '现在不需要拆解');
      }
      const position = input.position ?? 0;
      if (!Number.isInteger(position) || position < 0 || position > this.deck.length) {
        return this.invalid(sessionId, '位置无效');
      }
      player.hand = player.hand.filter((c) => !costInstances.some((x) => x.iid === c.iid));
      this.discard.push(...costInstances);
      const kitten: CardInstance = { iid: this.pendingDefuse.instanceId, cardId: this.pendingDefuse.cardId };
      this.pendingDefuse = null;
      this.subPhase = 'awaiting-action';
      this.deck.splice(this.deck.length - position, 0, kitten);
      this.ev(events, { type: 'hand', sessionId });
      this.log(events, `🍌 ${player.name} 用 4 张香蕉兑换了拆解！爆炸猫放回了牌堆某处 🔧`);
      this.ev(events, { type: 'defuseResolved' });
      if (this.queue) return this.runQueue(events);
      return this.finishTurn(events);
    }

    // 2 张香蕉 = 任意动作牌立即打出（走否认窗口）
    if (this.subPhase !== 'awaiting-action') return this.invalid(sessionId, '当前不能兑换');
    if (this.current()?.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');
    if (!input.cardId) return this.invalid(sessionId, '需要指定要兑换的动作牌');
    const def = this.cardMap.get(input.cardId);
    if (!def || def.kind !== 'action' || input.cardId === 'nope') {
      return this.invalid(sessionId, '只能兑换动作牌（不含否认）');
    }
    const needsTarget = def.effects.some(
      (e) =>
        e.type === 'stealRandom' ||
        e.type === 'stealNamed' ||
        e.type === 'peekHand' ||
        e.type === 'swapHand',
    );
    if (needsTarget) {
      const t = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!t || !t.alive || t.sessionId === sessionId) {
        return this.invalid(sessionId, '这张牌需要选择一名其他存活玩家作为目标');
      }
    }

    // 数学老师乘法：兑换出的动作牌同样吃双倍
    let exchangeEffects = def.effects;
    let exchangeMul = false;
    if (player.mathMulNext > 0) {
      const doubled = this.doubleEffects(player, exchangeEffects);
      if (doubled) {
        exchangeEffects = doubled;
        player.mathMulNext = 0;
        exchangeMul = true;
      }
    }

    player.hand = player.hand.filter((c) => !costInstances.some((x) => x.iid === c.iid));
    this.discard.push(...costInstances);
    this.ev(events, { type: 'hand', sessionId });

    const instance: CardInstance = { iid: newIid(input.cardId), cardId: input.cardId };
    const targetName = this.players.find((p) => p.sessionId === input.targetSessionId)?.name;
    this.log(
      events,
      `🍌 ${player.name} 用 2 张香蕉兑换，打出了【${def.name}】${targetName ? `→ ${targetName}` : ''}`,
    );
    if (exchangeMul) {
      this.log(events, `✖️ 乘法生效：【${def.name}】的效果触发了两次`);
    }
    // 秀英冰冻：被功能牌指定 → 冰冻 -1（卡牌效果照常生效）
    if (needsTarget) {
      this.cardHitsFrozen(
        this.players.find((p) => p.sessionId === input.targetSessionId),
        def.name,
        events,
      );
    }
    this.pendingPlay = {
      playId: `play-${++instanceSeq}`,
      sessionId,
      instances: [instance],
      combo: 'single',
      effects: exchangeEffects,
      targetSessionId: needsTarget ? input.targetSessionId : undefined,
      wantCardId: undefined,
      nopedBy: [],
    };
    this.lastPlay = {
      playId: this.pendingPlay.playId,
      bySessionId: sessionId,
      byName: player.name,
      cardIds: [instance.cardId],
      at: Date.now(),
      noped: false,
      targetSessionId: needsTarget ? input.targetSessionId : undefined,
    };
    this.subPhase = 'awaiting-nope';
    this.ev(events, { type: 'nopeWindowOpened' });
    this.addArchive(sessionId);
    if (!this.othersCanNope(sessionId)) {
      events.push(...this.resolveNopes());
    }
    return events;
  }

  /** Future女王命运改写：选 1 张立即生效 + 手牌替换 + 按序放回 */
  handleFutureRewrite(
    sessionId: string,
    input: {
      activateIdx: number;
      swapInstanceId: string;
      order: number[];
      targetSessionId?: string;
    },
  ): EngineEvent[] {
    const pending = this.pendingFutureRewrite;
    if (!pending || pending.sessionId !== sessionId) {
      return this.invalid(sessionId, '现在没有命运待改写');
    }
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    if (this.current()?.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');
    const player = this.players.find((p) => p.sessionId === sessionId)!;
    const n = pending.cards.length;

    const { activateIdx, swapInstanceId, order } = input;
    if (!Number.isInteger(activateIdx) || activateIdx < 0 || activateIdx >= n) {
      return this.invalid(sessionId, '生效牌选择无效');
    }
    const swapIdx = player.hand.findIndex((c) => c.iid === swapInstanceId);
    if (swapIdx < 0) return this.invalid(sessionId, '交换牌不在你手中');

    const activated = pending.cards[activateIdx]!;
    const def = this.defOf(activated);
    const needsTarget = def.effects.some(
      (e) =>
        e.type === 'stealRandom' ||
        e.type === 'stealNamed' ||
        e.type === 'peekHand' ||
        e.type === 'swapHand',
    );
    let target: EnginePlayer | undefined;
    if (needsTarget) {
      target = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!target || !target.alive || target.sessionId === sessionId) {
        return this.invalid(sessionId, `激活【${def.name}】需要选择一名其他存活玩家`);
      }
    }

    // 1) 摘走顶部 n 张；2) 激活牌生效；3) 手牌替换进去；4) 按选择顺序放回
    const candidates = [...pending.cards.filter((_, i) => i !== activateIdx)];
    const [swapCard] = player.hand.splice(swapIdx, 1);
    candidates.push(swapCard!);
    if (
      !Array.isArray(order) ||
      order.length !== candidates.length ||
      new Set(order).size !== candidates.length ||
      !order.every((i) => Number.isInteger(i) && i >= 0 && i < candidates.length)
    ) {
      // 撤销手牌摘取，等待重新提交
      player.hand.splice(swapIdx, 0, swapCard!);
      return this.invalid(sessionId, '放回顺序无效');
    }
    this.deck.splice(this.deck.length - n, n);
    const newTop = order.map((i) => candidates[i]!); // 自顶向下
    this.deck.push(...[...newTop].reverse());

    this.pendingFutureRewrite = null;
    const events: EngineEvent[] = [];
    this.ev(events, { type: 'hand', sessionId });
    const targetName = target?.name;
    this.log(
      events,
      `🌠 ${player.name} 改写了命运，激活了【${def.name}】！${targetName ? `→ ${targetName}` : ''}`,
    );

    // 激活牌立即生效（等同亲自打出；攻击/跳过/摸牌底语义在 finishTurn 收尾）
    const play: PendingPlay = {
      playId: `rewrite-${++instanceSeq}`,
      sessionId,
      instances: [activated],
      combo: 'single',
      effects: def.effects,
      targetSessionId: target?.sessionId,
      wantCardId: undefined,
      nopedBy: [],
    };
    this.discard.push(activated);
    this.lastPlay = {
      playId: play.playId,
      bySessionId: sessionId,
      byName: player.name,
      cardIds: [activated.cardId],
      at: Date.now(),
      noped: false,
      targetSessionId: target?.sessionId,
    };
    let suspended = false;
    for (const effect of def.effects) {
      if (this.phase !== 'playing' || !player.alive) break;
      const r = this.applyEffect(play, effect, events);
      if (r === 'suspend-defuse' || r === 'suspend-alter') {
        suspended = true;
        break;
      }
    }
    if (suspended || !player.alive || this.phase !== 'playing') return events;
    if (def.effects.some((e) => e.type === 'skip')) {
      return this.finishTurn(events); // 跳过：立即结束回合不摸牌
    }
    if (def.effects.some((e) => e.type === 'attack')) {
      this.pendingAttack = true; // finishTurn 转移连击
      return this.finishTurn(events);
    }
    return events;
  }

  /** Pig King：直接丢弃消化完成且必须处理的牌（白板/否认等无法正常打出时的出口） */
  handleDigestPlay(sessionId: string, input: { instanceId: string }): EngineEvent[] {
    if (this.phase !== 'playing' || this.subPhase !== 'awaiting-action') {
      return this.invalid(sessionId, '现在不能丢弃');
    }
    const player = this.current();
    if (!player || player.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');
    if (!player.mustPlayIid || player.mustPlayIid !== input.instanceId) {
      return this.invalid(sessionId, '只能丢弃消化获得的那张牌');
    }
    const idx = player.hand.findIndex((c) => c.iid === input.instanceId);
    if (idx < 0) return this.invalid(sessionId, '这张牌不在你手中');
    const [card] = player.hand.splice(idx, 1);
    this.discard.push(card!);
    player.mustPlayIid = null;
    const events: EngineEvent[] = [];
    this.ev(events, { type: 'hand', sessionId });
    this.log(events, `🐷 ${player.name} 丢弃了消化完成的牌`);
    return events;
  }

  /** bigEye 揭发点选：从目标手中弃掉（discard）或抽取（steal）一张牌 */
  /**
   * 秀英求助回应：被求助者同意（交一张牌，冰冻 -1，秀英本回合可正常行动）或拒绝（可继续问别人）。
   * 超时由房间层调用 autoRefuseHelp。
   */
  handleHelpRespond(
    sessionId: string,
    input: { accept: boolean; giveInstanceId?: string },
  ): EngineEvent[] {
    const pending = this.pendingHelp;
    if (!pending || pending.helperSessionId !== sessionId) {
      return this.invalid(sessionId, '现在没有向你发起的求助');
    }
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    const owner = this.players.find((p) => p.sessionId === pending.ownerSessionId);
    const helper = this.players.find((p) => p.sessionId === pending.helperSessionId);
    if (!owner || !helper) {
      this.pendingHelp = null;
      this.subPhase = 'awaiting-action';
      return this.invalid(sessionId, '求助双方已离场');
    }
    const events: EngineEvent[] = [];
    this.pendingHelp = null;
    this.subPhase = 'awaiting-action';
    this.ev(events, { type: 'helpResolved' });

    if (!input.accept) {
      this.log(events, `🧊 ${helper.name} 拒绝了 ${owner.name} 的求助`);
      this.ev(events, {
        type: 'private',
        sessionId: owner.sessionId,
        message: { action: 'helpResolved', accepted: false, helperName: helper.name },
      });
      return events;
    }

    const card = helper.hand.find((c) => c.iid === input.giveInstanceId);
    if (!card) {
      return this.invalid(sessionId, '请选择一张要交出的手牌');
    }
    helper.hand = helper.hand.filter((c) => c.iid !== card.iid);
    owner.hand.push(card);
    owner.freezeLayers = Math.max(0, owner.freezeLayers - 1);
    owner.helpedThisTurn = true; // 本回合可正常出牌/摸牌（即使仍有冰冻层）
    this.ev(events, { type: 'hand', sessionId: helper.sessionId });
    this.ev(events, { type: 'hand', sessionId: owner.sessionId });
    this.log(
      events,
      `🧊 ${helper.name} 帮助了 ${owner.name}（冰冻 -1，剩 ${owner.freezeLayers} 层），本回合可以正常行动`,
    );
    if (owner.freezeLayers === 0) {
      this.log(events, `🧊 ${owner.name} 解冻了！可以正常出牌和摸牌了`);
    }
    this.ev(events, {
      type: 'private',
      sessionId: owner.sessionId,
      message: { action: 'helpResolved', accepted: true, helperName: helper.name },
    });
    this.chaosRipple(events);
    return events;
  }

  /** 求助超时：视为拒绝（房间层计时调用） */
  autoRefuseHelp(): EngineEvent[] {
    const pending = this.pendingHelp;
    if (!pending) return [];
    return this.handleHelpRespond(pending.helperSessionId, { accept: false });
  }

  /** 邪恶苹果头：吃掉身上的邪恶苹果（自己回合内可用，交出一张手牌给投掷者） */
  handleAppleEat(sessionId: string, input: { giveInstanceId: string }): EngineEvent[] {
    const player = this.players.find((p) => p.sessionId === sessionId);
    if (!player || !player.alive) return this.invalid(sessionId, '你无法吃苹果');
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    if (this.subPhase !== 'awaiting-action' || this.current()?.sessionId !== sessionId) {
      return this.invalid(sessionId, '只能在自己回合吃苹果');
    }
    if (player.appleTurns <= 0) return this.invalid(sessionId, '你身上没有邪恶苹果');
    const card = player.hand.find((c) => c.iid === input.giveInstanceId);
    if (!card) return this.invalid(sessionId, '请选择一张要交出的手牌');

    const events: EngineEvent[] = [];
    const thrower = this.players.find((p) => p.sessionId === player.appleFrom && p.alive);
    player.hand = player.hand.filter((c) => c.iid !== card.iid);
    this.ev(events, { type: 'hand', sessionId });
    if (thrower) {
      thrower.hand.push(card);
      this.ev(events, { type: 'hand', sessionId: thrower.sessionId });
      this.log(events, `🍏 ${player.name} 吃掉了邪恶苹果，把一张手牌交给了 ${thrower.name}`);
    } else {
      this.discard.push(card);
      this.log(events, `🍏 ${player.name} 吃掉了邪恶苹果（投掷者已出局，牌进了弃牌堆）`);
    }
    player.appleTurns = 0;
    player.appleFrom = '';
    this.chaosRipple(events);
    return events;
  }

  handleExposePick(sessionId: string, input: { instanceId: string }): EngineEvent[] {
    const pending = this.pendingExpose;
    if (!pending || pending.sessionId !== sessionId) {
      return this.invalid(sessionId, '现在没有揭发待处理');
    }
    if (this.phase !== 'playing') return this.invalid(sessionId, '对局未开始或已结束');
    if (this.current()?.sessionId !== sessionId) return this.invalid(sessionId, '还没轮到你');
    const player = this.players.find((p) => p.sessionId === sessionId)!;
    const target = this.players.find((p) => p.sessionId === pending.targetSessionId);
    if (!target || !target.alive) {
      this.pendingExpose = null;
      return this.invalid(sessionId, '目标已出局');
    }
    const idx = target.hand.findIndex((c) => c.iid === input.instanceId);
    if (idx < 0) return this.invalid(sessionId, '这张牌不在对方手中');

    const [card] = target.hand.splice(idx, 1);
    this.pendingExpose = null;
    const events: EngineEvent[] = [];
    this.ev(events, { type: 'hand', sessionId: target.sessionId });
    if (pending.mode === 'discard') {
      this.discard.push(card!);
      this.log(events, `👀 ${player.name} 指定 ${target.name} 弃掉了一张牌`);
      this.ev(events, {
        type: 'private',
        sessionId: target.sessionId,
        message: { action: 'chaosDraw', fromName: player.name, cardName: this.defOf(card!).name },
      });
    } else {
      player.hand.push(card!);
      this.ev(events, { type: 'hand', sessionId });
      this.log(events, `👀 ${player.name} 从 ${target.name} 手中抽走了一张牌`);
      this.ev(events, {
        type: 'private',
        sessionId: target.sessionId,
        message: { action: 'chaosDraw', fromName: player.name, cardName: this.defOf(card!).name },
      });
    }
    return events;
  }

  /* ------------------------------------------------------------------ */
  /* 断线                                                                */
  /* ------------------------------------------------------------------ */

  setConnected(sessionId: string, connected: boolean): EngineEvent[] {
    const p = this.players.find((x) => x.sessionId === sessionId);
    if (p) p.connected = connected;
    return [];
  }

  /** 对局中掉线超时：判死 */
  killDisconnected(sessionId: string): EngineEvent[] {
    const p = this.players.find((x) => x.sessionId === sessionId);
    if (!p || !p.alive || this.phase !== 'playing') return [];
    const events: EngineEvent[] = [];
    p.alive = false;
    p.connected = false;
    this.deck.push(...p.hand);
    p.hand = [];
    this.shuffle(this.deck);
    this.deathOrder.push(sessionId);
    this.lastDeath = { sessionId, name: p.name, at: Date.now() };
    this.log(events, `${p.name} 掉线超时，遗憾出局`);
    this.ev(events, { type: 'death', sessionId });
    if (!this.checkWin(events) && this.current()?.sessionId === sessionId) {
      this.finishTurn(events);
    }
    return events;
  }
}
