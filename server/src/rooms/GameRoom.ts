import { Room, type Client, type Delayed } from 'colyseus';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  NOPE_WINDOW_MS,
  validateBuild,
  validateDeck,
  WORLD_RULE_MAP,
  BUILTIN_CARD_MAP,
  formatMsg,
  type LocMsg,
  type ClientMessage,
  type DeckDef,
  type HandCard,
  type ServerMessage,
} from '@bombcat/shared';
import { GameEngine } from '../engine/Engine.js';
import { decide } from '../ai/BotBrain.js';
import type { EngineEvent } from '../engine/types.js';
import type { VerifiedUser } from '../auth.js';
import { GameState, PlayerState } from '../schema/state.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const activeCodes = new Set<string>();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!activeCodes.has(code)) {
      activeCodes.add(code);
      return code;
    }
  }
  throw new Error('无法生成房间码');
}

/** 回合决策计时（炉石 75s/Master Duel 决策走表原则；测试可覆盖 GameRoom.turnTimeoutMs） */
const TURN_TIMEOUT_MS = 45_000;

/** 表情白名单（预设制：社交层可控毒，EK2 同款思路） */
const EMOTE_ALLOWLIST = ['😂', '😭', '😱', '😡', '👍', '👎', '❤️', '🎉', '💀', '🤔', '😼', '😸'];

export class GameRoom extends Room<{ state: GameState }> {
  /** 回合计时毫秒数（测试可覆盖） */
  static turnTimeoutMs = TURN_TIMEOUT_MS;
  /** 机器人思考间隔毫秒（测试可覆盖） */
  static botDelayMs = 1500;
  /** 否认窗口毫秒（测试可覆盖；未来可做房间快速模式开关） */
  static nopeWindowMs = NOPE_WINDOW_MS;
  /** 秀英求助回应窗口毫秒（测试可覆盖） */
  static helpWindowMs = 15_000;
  /** 懒懒羊醒来选梦窗口毫秒（测试可覆盖；超时自动留下第一张） */
  static dreamWindowMs = 20_000;

  maxClients = MAX_PLAYERS;
  patchRate = 100;

  private engine = new GameEngine();
  private pendingDeck: DeckDef | null = null;
  private nopeTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: Delayed | null = null;
  private botTimer: Delayed | null = null;
  private helpTimer: Delayed | null = null;
  private dreamTimer: Delayed | null = null;
  /** 机器人玩家的 sessionId 集合 */
  private botIds = new Set<string>();
  /** 机器人通过 peek 获得的牌堆顶记忆（不作弊读牌） */
  private botKnown: string[] | null = null;
  /** 房间模式：{ bots: n } 人机练习；{ quick: true } 快速匹配；{ run, runBonuses, extraExploding } 无尽挑战 */
  private roomMode: {
    bots?: number;
    quick?: boolean;
    run?: boolean;
    runBonuses?: string[];
    extraExploding?: number;
  } = {};
  private quickStarted = false;
  /** 人机练习/无尽挑战：bot 是否已随首位真人加入 */
  private botsSeeded = false;
  /** 玩家个人构筑（sessionId -> 10 张 cardId） */
  private pendingBuilds: Record<string, string[]> = {};

  onCreate(
    options: { bots?: number; quick?: boolean; run?: boolean; runBonuses?: string[]; extraExploding?: number } = {},
  ): void {
    const code = generateRoomCode();
    this.roomId = code;
    this.setState(new GameState());
    this.state.roomCode = code;
    this.roomMode = options ?? {};
    void this.setPrivate(true); // 只通过房间码加入，不进公开列表

    this.onMessage('act', (client: Client, message: ClientMessage) => {
      try {
        this.handleAction(client, message);
      } catch (e) {
        if (e instanceof Error) this.sendError(client, 'room.errorRaw', { text: e.message });
        else this.sendError(client, 'room.internalError');
      }
    });

    // 表情：预设白名单广播（不进引擎，不影响对局）
    this.onMessage('emote', (client: Client, msg: { emoji?: string }) => {
      const emoji = typeof msg?.emoji === 'string' ? msg.emoji : '';
      if (!EMOTE_ALLOWLIST.includes(emoji)) return;
      const p = this.engine.players.find((x) => x.sessionId === client.sessionId);
      if (!p) return;
      this.broadcast('emote', { sessionId: client.sessionId, name: p.name, emoji });
    });

    // 人机练习 / 无尽挑战：等首位真人加入后再补 bot（直接延时会在慢网络下让 bot 抢走房主）
    // 快速匹配：15 秒内凑不满 2 人则补 bot 开局
    if (this.roomMode.quick) {
      this.clock.setTimeout(() => {
        if (this.engine.phase !== 'lobby') return;
        if (this.engine.players.length < 2) this.addBots(2);
        this.autoStart();
      }, 15_000);
    }
  }

  async onAuth(_client: Client, options: any): Promise<VerifiedUser> {
    return this.verifyIdentity(options ?? {});
  }

  // auth.ts 的逻辑内联封装（便于子类化/测试替换）
  protected verifyIdentity(options: any): Promise<VerifiedUser> {
    return import('../auth.js').then((m) => m.verifyJoinIdentity(options));
  }

  onJoin(client: Client): void {
    const auth = client.auth as VerifiedUser;
    const events = this.engine.addPlayer(client.sessionId, auth.userId, auth.name);
    events.push(...this.engine.setConnected(client.sessionId, true));
    this.process(events);

    // 人机练习：首位真人入座后补 bot（无尽挑战补完自动开局）
    if (
      !this.botsSeeded &&
      this.roomMode.bots &&
      this.roomMode.bots > 0 &&
      this.engine.phase === 'lobby'
    ) {
      this.botsSeeded = true;
      this.addBots(this.roomMode.bots);
      if (this.roomMode.run) this.autoStart();
    }

    if (this.engine.phase === 'playing') {
      this.sendHand(client.sessionId);
    }
    this.sync();

    // 快速匹配：凑够 2 名真人后 3 秒开局
    if (this.roomMode.quick && !this.quickStarted && this.engine.phase === 'lobby') {
      const humans = this.engine.players.filter((p) => !this.botIds.has(p.sessionId)).length;
      if (humans >= 2) {
        this.quickStarted = true;
        this.clock.setTimeout(() => this.autoStart(), 3000);
      }
    }
  }

  onDrop(client: Client): void {
    // 非自愿掉线：给 60 秒重连窗口（对局中）/ 20 秒（大厅）
    const seconds = this.engine.phase === 'playing' ? 60 : 20;
    this.process(this.engine.setConnected(client.sessionId, false));
    void this.allowReconnection(client, seconds)
      .then((reconnected) => {
        this.process(this.engine.setConnected(client.sessionId, true));
        if (this.engine.phase === 'playing') this.sendHand(client.sessionId);
        this.sync();
        void reconnected;
      })
      .catch(() => {
        if (this.engine.phase === 'playing') {
          this.process(this.engine.killDisconnected(client.sessionId));
        } else {
          this.process(this.engine.removePlayer(client.sessionId));
        }
        this.sync();
      });
  }

  onLeave(client: Client, code?: number): void {
    // 主动退出（code 1000）：对局中视同认输出局
    if (code === 1000) {
      if (this.engine.phase === 'playing') {
        this.process(this.engine.killDisconnected(client.sessionId));
      } else {
        this.process(this.engine.removePlayer(client.sessionId));
      }
      this.sync();
    }
  }

  onDispose(): void {
    if (this.nopeTimer) clearTimeout(this.nopeTimer);
    this.turnTimer?.clear();
    this.botTimer?.clear();
    this.helpTimer?.clear();
    this.dreamTimer?.clear();
    activeCodes.delete(this.state.roomCode);
  }

  /* ------------------------------------------------------------------ */
  /* 回合计时器（服务端权威；超时自动行动，不判负）                        */
  /* ------------------------------------------------------------------ */

  private armTurnTimer(): void {
    this.turnTimer?.clear();
    this.turnTimer = null;
    if (this.engine.phase !== 'playing') {
      this.state.turnEndsAt = 0;
      return;
    }
    // 否认窗口有独立的 8 秒计时；命运改写是技能的延伸交互，同样暂停回合计时给思考时间
    if (this.engine.subPhase === 'awaiting-nope' || this.engine.futureRewritePending) {
      this.state.turnEndsAt = 0;
      return;
    }
    // 秀英求助：等待被求助者回应期间暂停回合计时（有独立的 15 秒回应窗口）
    if (this.engine.helpPending) {
      this.state.turnEndsAt = 0;
      this.armHelpTimer();
      return;
    }
    // 懒懒羊选梦：暂停回合计时（独立的选梦窗口；机器人很快自动选）
    if (this.engine.dreamPending) {
      this.state.turnEndsAt = 0;
      this.armDreamTimer();
      return;
    }
    this.state.turnEndsAt = this.clock.currentTime + GameRoom.turnTimeoutMs;
    this.turnTimer = this.clock.setTimeout(() => {
      this.turnTimer = null;
      this.autoActOnTimeout();
    }, GameRoom.turnTimeoutMs);
    // 机器人行动循环（bot 思考间隔 < 回合超时，正常情况下由 bot 先行动）
    this.armBotLoop();
  }

  /** 秀英求助回应窗口计时（超时自动拒绝） */
  private armHelpTimer(): void {
    this.helpTimer?.clear();
    this.helpTimer = null;
    if (!this.engine.helpPending) return;
    this.helpTimer = this.clock.setTimeout(() => {
      this.helpTimer = null;
      this.process(this.engine.autoRefuseHelp());
      this.sync();
      this.armTurnTimer();
    }, GameRoom.helpWindowMs);
  }

  /** 懒懒羊选梦窗口计时：真人超时自动留下第一张；机器人短延时按启发式选 */
  private armDreamTimer(): void {
    this.dreamTimer?.clear();
    this.dreamTimer = null;
    const pending = this.engine.pendingDreamInfo;
    if (!pending) return;
    const isBot = this.botIds.has(pending.sessionId);
    const delay = isBot ? GameRoom.botDelayMs * (0.5 + Math.random() * 0.5) : GameRoom.dreamWindowMs;
    this.dreamTimer = this.clock.setTimeout(() => {
      this.dreamTimer = null;
      const cur = this.engine.pendingDreamInfo;
      if (!cur) return;
      if (isBot) {
        const d = decide(this.engine, cur.sessionId, this.botKnown);
        if (d?.kind === 'dreamPick') {
          this.process(this.engine.dreamPick(cur.sessionId, { cardId: d.cardId, giveTo: d.giveTo }));
        } else {
          this.process(this.engine.autoDreamPick());
        }
      } else {
        this.process(this.engine.autoDreamPick());
      }
      this.sync();
      this.armTurnTimer();
    }, delay);
  }

  /** 机器人回应求助：手牌 ≥3 张时较可能同意，交出手里价值最低的一张 */
  private scheduleBotHelpResponse(botSessionId: string): void {
    const delay = GameRoom.botDelayMs * (0.5 + Math.random() * 0.5);
    this.clock.setTimeout(() => {
      const pending = this.engine.pendingHelpInfo;
      if (!pending || pending.helperSessionId !== botSessionId) return;
      const bot = this.engine.players.find((p) => p.sessionId === botSessionId);
      if (!bot || !bot.alive || bot.hand.length === 0) {
        this.process(this.engine.handleHelpRespond(botSessionId, { accept: false }));
        this.sync();
        this.armTurnTimer();
        return;
      }
      // 简单启发式：手里牌多就更愿意帮忙；给出价值最低的一张（普通猫优先）
      // 上车邀请：牌堆越危险越愿意付车费换一次免摸牌
      const isRide = pending.kind === 'ride';
      const alive = this.engine.players.filter((p) => p.alive).length;
      const danger = (alive + 2) / Math.max(this.engine.deck.length, 1);
      const willing = isRide
        ? bot.hand.length >= 2 && Math.random() < Math.min(0.9, 0.25 + danger * 2)
        : bot.hand.length >= 3 && Math.random() < 0.7;
      if (!willing) {
        this.process(this.engine.handleHelpRespond(botSessionId, { accept: false }));
      } else {
        const plain = bot.hand.find((c) => this.engine.cardMap.get(c.cardId)?.kind === 'plain');
        const give = plain ?? bot.hand[bot.hand.length - 1]!;
        this.process(
          this.engine.handleHelpRespond(botSessionId, { accept: true, giveInstanceId: give.iid }),
        );
      }
      this.sync();
      this.armTurnTimer();
    }, delay);
  }

  private autoActOnTimeout(): void {    const e = this.engine;
    if (e.phase !== 'playing') return;
    // 秀英求助：超时视为拒绝
    if (e.helpPending) {
      this.process(e.autoRefuseHelp());
      this.sync();
      this.armTurnTimer();
      return;
    }
    // 懒懒羊选梦：超时自动留下第一张
    if (e.dreamPending) {
      this.process(e.autoDreamPick());
      this.sync();
      this.armTurnTimer();
      return;
    }
    const cur = e.current();
    if (!cur || !cur.connected) {
      // 当前玩家掉线：交给重连判死流程，不替他行动
      this.armTurnTimer();
      return;
    }
    if (e.subPhase === 'awaiting-action') {
      // 猪王必须打出消化牌：超时自动丢弃，避免卡死
      if (cur.mustPlayIid) {
        this.process(e.handleDigestPlay(cur.sessionId, { instanceId: cur.mustPlayIid }));
      } else {
        this.process(e.drawCard(cur.sessionId)); // 超时自动摸牌结束回合
      }
    } else if (e.subPhase === 'awaiting-defuse') {
      // 拆解超时：放回牌堆顶（香蕉兑换待处理则自动用前 4 张兑换）
      this.process(e.autoDefuseOnTimeout(cur.sessionId));
    } else if (e.subPhase === 'awaiting-tear') {
      // 眼泪选择超时：自动拒绝（摸 2 张，眼泪回堆顶）
      const tearOwner = e.pendingTear?.sessionId ?? cur.sessionId;
      this.process(e.handleTearChoice(tearOwner, { accept: false }));
    } else if (
      e.subPhase === 'awaiting-alter' &&
      e.pendingAlter?.sessionId === cur.sessionId
    ) {
      const n = e.pendingAlter.cards.length;
      this.process(e.alterFutureOrder(cur.sessionId, Array.from({ length: n }, (_, i) => i)));
    }
    this.sync();
    this.armTurnTimer();
  }

  /* ------------------------------------------------------------------ */
  /* AI 机器人（规则打分；与真人共用 actAs 入口，不作弊读牌）             */
  /* ------------------------------------------------------------------ */

  private static BOT_NAMES = ['AI·咪宝', 'AI·橘座', 'AI·雪球', 'AI·大橘', 'AI·煤球'];

  private addBots(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.engine.players.length >= MAX_PLAYERS) break;
      const name =
        GameRoom.BOT_NAMES[this.botIds.size % GameRoom.BOT_NAMES.length] ??
        `AI·${this.botIds.size + 1}`;
      const sid = `bot:${Date.now().toString(36)}:${i}:${Math.floor(Math.random() * 1e4)}`;
      this.botIds.add(sid);
      this.process(this.engine.addPlayer(sid, '', name));
    }
    this.sync();
  }

  private autoStart(): void {
    if (this.engine.phase !== 'lobby' || this.engine.players.length < 2) return;
    this.actAs(this.engine.hostSessionId, { action: 'startGame' });
  }

  private armBotLoop(): void {
    this.botTimer?.clear();
    this.botTimer = null;
    if (this.engine.phase !== 'playing') return;
    const cur = this.engine.current();
    if (!cur || !this.botIds.has(cur.sessionId)) return;
    if (this.engine.subPhase === 'awaiting-nope') return; // 否认窗口与 bot 无关
    const delay = GameRoom.botDelayMs * (0.7 + Math.random() * 0.6);
    this.botTimer = this.clock.setTimeout(() => {
      this.botTimer = null;
      this.botAct();
    }, delay);
  }

  private botAct(): void {
    const e = this.engine;
    const cur = e.current();
    if (!cur || !this.botIds.has(cur.sessionId) || e.phase !== 'playing') return;
    const decision = decide(e, cur.sessionId, this.botKnown);
    if (!decision) return;
    if (decision.kind === 'draw') {
      this.actAs(cur.sessionId, { action: 'draw' });
    } else if (decision.kind === 'defuse') {
      this.actAs(cur.sessionId, { action: 'defusePosition', position: decision.position });
    } else if (decision.kind === 'alter') {
      this.actAs(cur.sessionId, { action: 'alterFuture', order: decision.order });
    } else if (decision.kind === 'bananaAction') {
      // 香蕉女王：覆盖期间用 2 张香蕉兑换技能牌
      this.actAs(cur.sessionId, {
        action: 'bananaSubstitute',
        mode: 'action',
        cardId: decision.cardId,
        costInstanceIds: decision.costInstanceIds,
      });
    } else if (decision.kind === 'iceHelp') {
      // 秀英：冰冻中向其他玩家求助
      const helpSkillId =
        e.characterMap.get(cur.characterId)?.skills.find((s) => s.effect.kind === 'iceHelp')?.id ??
        'ice-help';
      this.actAs(cur.sessionId, {
        action: 'useSkill',
        skillId: helpSkillId,
        targetSessionId: decision.targetSessionId,
      });
    } else if (decision.kind === 'driverSkill') {
      // 司机小贾：上车 / 变道
      this.actAs(cur.sessionId, {
        action: 'useSkill',
        skillId: decision.skillId,
        targetSessionId: decision.targetSessionId,
      });
    } else if (decision.kind === 'juliaSkill') {
      // Julia 姐：建仓 / 平仓
      this.actAs(cur.sessionId, {
        action: 'useSkill',
        skillId: decision.skillId,
        investInstanceIds: decision.investInstanceIds,
      });
    } else if (decision.kind === 'sheepDream') {
      // 懒懒羊：数羊
      this.actAs(cur.sessionId, { action: 'useSkill', skillId: decision.skillId });
    } else if (decision.kind === 'dreamPick') {
      this.actAs(cur.sessionId, { action: 'dreamPick', cardId: decision.cardId, giveTo: decision.giveTo });
    } else if (decision.kind === 'butcherCleave') {
      // 屠夫：剔骨封锁
      this.actAs(cur.sessionId, {
        action: 'useSkill',
        skillId: decision.skillId,
        targetSessionId: decision.targetSessionId,
      });
    } else if (decision.kind === 'appleEat') {
      // 邪恶苹果头：吃掉身上的苹果
      this.actAs(cur.sessionId, { action: 'appleEat', giveInstanceId: decision.giveInstanceId });
    } else {
      const playedCardId = String(decision.instanceId.split('#')[0]);
      this.actAs(cur.sessionId, {
        action: 'playCard',
        instanceId: decision.instanceId,
        comboInstanceIds: decision.comboInstanceIds,
        targetSessionId: decision.targetSessionId,
        wantCardId: decision.wantCardId,
      });
      // bot 打出洗牌/攻击/跳过后，记忆中的顶牌已失效或被跳过
      if (playedCardId === 'shuffle' || playedCardId === 'attack' || playedCardId === 'skip') {
        this.botKnown = null;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 消息分发                                                            */
  /* ------------------------------------------------------------------ */

  private handleAction(client: Client, message: ClientMessage): void {
    this.actAs(client.sessionId, message);
  }

  /** 统一行动入口（真人消息与机器人共用；错误回给有连接的一方，bot 自动忽略） */
  private actAs(sid: string, message: ClientMessage): void {
    switch (message.action) {
      case 'startGame': {
        // 普通联机房：真人不足 fillTo 时自动补机器人到目标人数（练习/快速匹配/无尽模式不受影响）
        if (!this.roomMode.bots && !this.roomMode.quick && !this.roomMode.run) {
          const fillTo = Math.min(Math.max(message.fillTo ?? 0, 0), MAX_PLAYERS);
          if (fillTo >= 2 && this.engine.players.length < fillTo) {
            this.addBots(fillTo - this.engine.players.length);
          }
        }
        const events = this.engine.startGame(sid, this.pendingDeck, {
          builds: this.pendingBuilds,
          runBonuses: this.roomMode.run ? { [sid]: this.roomMode.runBonuses ?? [] } : undefined,
          extraExploding: this.roomMode.run ? this.roomMode.extraExploding : undefined,
        });
        this.process(events);
        break;
      }
      case 'setBuild': {
        if (this.engine.phase !== 'lobby') {
          this.sendRoomError(sid, 'room.gameStarted');
          break;
        }
        const v = validateBuild(message.cardIds, this.buildCardPool());
        if (!v.ok) {
          this.sendRoomError(sid, 'room.buildInvalid', { error: v.error ?? '' });
          break;
        }
        this.pendingBuilds[sid] = message.cardIds;
        this.sync();
        break;
      }
      case 'setCharacter': {
        this.process(this.engine.setCharacter(sid, message.characterId));
        break;
      }
      case 'setDeck': {
        if (sid !== this.engine.hostSessionId) {
          this.sendRoomError(sid, 'room.hostOnlyDeck');
          break;
        }
        if (this.engine.phase !== 'lobby') {
          this.sendRoomError(sid, 'room.gameStarted');
          break;
        }
        if (message.deck === null) {
          this.pendingDeck = null;
          this.state.deckName = '经典卡组';
          break;
        }
        const size = JSON.stringify(message.deck).length;
        if (size > 64 * 1024) {
          this.sendRoomError(sid, 'room.deckTooLarge');
          break;
        }
        const result = validateDeck(
          message.deck,
          Math.max(MIN_PLAYERS, this.engine.players.length),
        );
        if (!result.ok) {
          this.sendRoomError(sid, 'room.deckInvalid', { errors: result.errors.join('；') });
          break;
        }
        this.pendingDeck = message.deck;
        this.state.deckName = message.deck.name;
        this.broadcast('deckChanged', message.deck.name);
        break;
      }
      case 'playCard': {
        this.process(
          this.engine.playCard(sid, {
            instanceId: message.instanceId,
            comboInstanceIds: message.comboInstanceIds,
            targetSessionId: message.targetSessionId,
            wantCardId: message.wantCardId,
            asNope: message.asNope,
          }),
        );
        break;
      }
      case 'draw': {
        this.process(this.engine.drawCard(sid));
        break;
      }
      case 'defusePosition': {
        this.process(this.engine.defusePosition(sid, message.position));
        break;
      }
      case 'alterFuture': {
        this.process(this.engine.alterFutureOrder(sid, message.order));
        break;
      }
      case 'useSkill': {
        this.process(
          this.engine.useSkill(sid, {
            skillId: message.skillId,
            costInstanceIds: message.costInstanceIds,
            targetSessionId: message.targetSessionId,
            wantCardId: message.wantCardId,
            investInstanceIds: message.investInstanceIds,
          }),
        );
        break;
      }
      case 'dreamPick': {
        this.process(this.engine.dreamPick(sid, { cardId: message.cardId, giveTo: message.giveTo }));
        break;
      }
      case 'tearChoice': {
        this.process(this.engine.handleTearChoice(sid, message));
        break;
      }
      case 'bananaSubstitute': {
        this.process(this.engine.handleBananaSubstitute(sid, message));
        break;
      }
      case 'futureRewritePick': {
        this.process(this.engine.handleFutureRewrite(sid, message));
        break;
      }
      case 'digestPlay': {
        this.process(this.engine.handleDigestPlay(sid, message));
        break;
      }
      case 'exposePick': {
        this.process(this.engine.handleExposePick(sid, message));
        break;
      }
      case 'helpRespond': {
        this.process(this.engine.handleHelpRespond(sid, message));
        break;
      }
      case 'appleEat': {
        this.process(this.engine.handleAppleEat(sid, message));
        break;
      }
      default: {
        const never: never = message;
        void never;
      }
    }
    this.sync();
    this.armTurnTimer();
  }

  /* ------------------------------------------------------------------ */
  /* 引擎事件处理                                                         */
  /* ------------------------------------------------------------------ */

  private process(events: EngineEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hand':
          this.sendHand(e.sessionId);
          break;
        case 'private':
          // bot 的看牌结果转为记忆（不作弊：只记 peek 得到的信息）
          if (
            this.botIds.has(e.sessionId) &&
            (e.message as { action?: string }).action === 'peekDeck'
          ) {
            this.botKnown = (e.message as { cards?: { id: string }[] }).cards?.map(
              (c) => c.id,
            ) ?? null;
          }
          // 求助请求发给 bot：延时自动应答（规则启发式，非作弊）
          if (
            this.botIds.has(e.sessionId) &&
            (e.message as { action?: string }).action === 'helpPrompt'
          ) {
            this.scheduleBotHelpResponse(e.sessionId);
          }
          this.sendPrivate(e.sessionId, e.message);
          break;
        case 'invalid':
          this.sendPrivate(e.sessionId, { action: 'error', message: e.message, msg: e.msg });
          break;
        case 'nopeWindowOpened': {
          this.state.nopeEndsAt = Date.now() + GameRoom.nopeWindowMs;
          this.turnTimer?.clear(); // 否认窗口期暂停回合计时
          this.turnTimer = null;
          this.state.turnEndsAt = 0;
          if (this.nopeTimer) clearTimeout(this.nopeTimer);
          this.nopeTimer = setTimeout(() => {
            this.nopeTimer = null;
            this.process(this.engine.resolveNopes());
            this.sync();
            this.armTurnTimer();
          }, GameRoom.nopeWindowMs);
          break;
        }
        case 'nopeWindowClosed': {
          if (this.nopeTimer) {
            clearTimeout(this.nopeTimer);
            this.nopeTimer = null;
          }
          this.state.nopeEndsAt = 0;
          break;
        }
        case 'awaitingHelp':
          break;
        case 'helpResolved': {
          this.helpTimer?.clear();
          this.helpTimer = null;
          break;
        }
        case 'dreamResolved': {
          this.dreamTimer?.clear();
          this.dreamTimer = null;
          break;
        }
        case 'gameEnd': {
          const winner = this.engine.players.find(
            (p) => p.sessionId === this.engine.winnerSessionId,
          );
          const places = new Map<string, number>();
          if (winner) places.set(winner.sessionId, 1);
          [...this.engine.deathOrder].reverse().forEach((sid, i) => {
            if (!places.has(sid)) places.set(sid, i + 2);
          });
          const msg: ServerMessage = {
            action: 'gameEnd',
            winnerName: winner?.name ?? '',
            ranking: this.engine.players
              .map((p) => ({
                sessionId: p.sessionId,
                name: p.name,
                place: places.get(p.sessionId) ?? this.engine.players.length,
              }))
              .sort((a, b) => a.place - b.place),
            objectives: e.objectives,
          };
          this.broadcast('gameEnd', msg);
          break;
        }
        default:
          break; // log/turnAdvanced 等通过 schema 同步
      }
    }
  }

  private sendHand(sessionId: string): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;
    const cards: HandCard[] = this.engine.handOf(sessionId).map((i) => ({
      instanceId: i.iid,
      def: this.engine.defOf(i),
    }));
    this.sendPrivate(sessionId, { action: 'hand', cards });
  }

  private sendPrivate(sessionId: string, message: ServerMessage): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;
    client.send(message.action, message);
  }

  private sendError(client: Client, k: string, p?: LocMsg['p']): void {
    const msg: LocMsg = p ? { k, p } : { k };
    client.send('error', { action: 'error', message: formatMsg('zh', msg), msg });
  }

  /** 房间级报错：message=中文原文（兼容），msg=可本地化消息 */
  private sendRoomError(sessionId: string, k: string, p?: LocMsg['p']): void {
    const msg: LocMsg = p ? { k, p } : { k };
    this.sendPrivate(sessionId, { action: 'error', message: formatMsg('zh', msg), msg });
  }

  /* ------------------------------------------------------------------ */
  /* 状态同步                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 逐项对齐数组内容。不用 splice(0, n, ...) 全量替换——
   * 大范围 splice 在增量编码时行为不可靠（实测客户端会丢条目）。
   */
  private static syncArray(arr: any, target: readonly string[]): void {
    while (arr.length > target.length) arr.pop();
    for (let i = 0; i < target.length; i++) {
      const v = target[i]!;
      if (i < arr.length) {
        if (arr[i] !== v) arr[i] = v;
      } else {
        arr.push(v);
      }
    }
  }

  /** 构筑可用卡池（内置 + 房主自定义） */
  private buildCardPool(): Map<string, import('@bombcat/shared').CardDef> {
    const pool = new Map(BUILTIN_CARD_MAP);
    if (this.pendingDeck) {
      for (const c of this.pendingDeck.customCards) pool.set(c.id, c);
    }
    return pool;
  }

  private sync(): void {
    const s = this.state;
    const e = this.engine;
    s.phase = e.phase;
    s.subPhase = e.subPhase;
    s.hostSessionId = e.hostSessionId;
    s.deckName = this.pendingDeck ? this.pendingDeck.name : e.phase === 'lobby' ? '经典卡组' : e.deckDef.name;
    // World Rule
    const rule = WORLD_RULE_MAP.get(e.worldRuleId);
    s.worldRuleId = e.worldRuleId;
    s.worldRuleName = rule?.name ?? '';
    s.worldRuleDesc = rule?.description ?? '';
    s.worldRuleEmoji = rule?.emoji ?? '';
    // v2：全局效果修饰器
    s.bananaOverlayTurns = e.bananaOverlayTurns;
    s.chaosDrawsActive = e.chaosDrawsActive;
    s.tearPendingBy = e.pendingTear?.sessionId ?? '';
    s.helpPendingBy = e.pendingHelpInfo?.helperSessionId ?? '';
    s.helpOwnerId = e.pendingHelpInfo?.ownerSessionId ?? '';
    s.dreamBy = e.pendingDreamInfo?.sessionId ?? '';
    s.turnIndex = e.turnIndex;
    s.direction = e.direction;
    s.deckCount = e.deck.length;
    s.discardCount = e.discard.length;
    s.discardTopCardId = e.discard.length ? e.discard[e.discard.length - 1]!.cardId : '';
    s.winnerSessionId = e.winnerSessionId;
    s.defuseBy = e.pendingDefuse?.sessionId ?? '';
    s.alterBy = e.pendingAlter?.sessionId ?? '';
    GameRoom.syncArray(s.discardTopIds, e.discard.slice(-8).map((i) => i.cardId));

    const lp = e.lastPlay;
    s.lastPlayBy = lp?.byName ?? '';
    s.lastPlayById = lp?.bySessionId ?? '';
    GameRoom.syncArray(s.lastPlayCards, lp?.cardIds ?? []);
    s.lastPlayAt = lp?.at ?? 0;
    s.laneSwapA = e.laneSwap?.a ?? '';
    s.laneSwapB = e.laneSwap?.b ?? '';
    s.laneSwapSeq = e.laneSwap?.seq ?? 0;
    s.lastPlayNoped = lp?.noped ?? false;
    s.lastPlayTargetId = lp?.targetSessionId ?? '';
    s.lastPlayTargetName =
      e.players.find((p) => p.sessionId === lp?.targetSessionId)?.name ?? '';
    s.lastDeathBy = e.lastDeath?.name ?? '';
    s.lastDeathAt = e.lastDeath?.at ?? 0;

    // 回合顺序
    GameRoom.syncArray(s.turnOrder, e.turnOrder);

    // 否认窗口
    const p = e.pendingPlay;
    s.nopeActive = !!p && e.subPhase === 'awaiting-nope';
    s.nopePlayId = p?.playId ?? '';
    s.nopePlayBy = p?.sessionId ?? '';
    GameRoom.syncArray(s.nopeCardIds, p ? p.instances.map((i) => i.cardId) : []);
    s.nopeTargetId = p?.targetSessionId ?? '';
    GameRoom.syncArray(s.nopeNopedBy, p?.nopedBy ?? []);

    // 自定义卡
    if (e.phase !== 'lobby') {
      GameRoom.syncArray(s.customCardsJson, e.deckDef.customCards.map((c) => JSON.stringify(c)));
    }

    // 日志
    // 同步编码后的 LocMsg（客户端按语言渲染；旧客户端可 decodeMsg 失败时原样显示）
    GameRoom.syncArray(s.log, e.logMsgs.slice(-30));

    // 玩家
    const seen = new Set<string>();
    for (const ep of e.players) {
      seen.add(ep.sessionId);
      let ps = s.players.get(ep.sessionId);
      if (!ps) {
        ps = new PlayerState();
        s.players.set(ep.sessionId, ps);
      }
      ps.sessionId = ep.sessionId;
      ps.userId = ep.userId;
      ps.name = ep.name;
      ps.characterId = ep.characterId;
      ps.handCount = ep.hand.length;
      ps.alive = ep.alive;
      ps.connected = ep.connected;
      ps.turnsLeft = ep.turnsLeft;
        ps.isHost = ep.sessionId === e.hostSessionId;
        ps.buildReady = !!this.pendingBuilds[ep.sessionId];

        // v2：新状态同步（消化中的卡名是隐藏信息，不进公开 schema；消化完成经 digestReady 私密告知）
        ps.isAngry = ep.isAngry;
        ps.permanentDead = ep.permanentDead;
        ps.fullTurns = ep.fullTurns;
        ps.digestCount = ep.digestCount;
        ps.digestionTurns = ep.digestion?.turnsLeft ?? 0;
        ps.mustPlayIid = ep.mustPlayIid ?? '';
        ps.archives = ep.archives;
        // v3：数学老师 / 秀英
        ps.mathSubDraw = ep.mathSubDraw;
        ps.mathMulNext = ep.mathMulNext;
        ps.mathDivNext = ep.mathDivNext;
        ps.freezeLayers = ep.freezeLayers;
        ps.helpedThisTurn = ep.helpedThisTurn;
        ps.lychees = ep.lychees;
        ps.lycheeGiven = ep.lycheeGivenThisTurn;
        ps.appleTurns = ep.appleTurns;
        ps.boneStacks = ep.boneStacks;
        ps.fares = ep.fares;
        ps.luckCharges = ep.luckCharges;
        ps.freeRide = ep.freeRide;
        ps.lockedBy = ep.lockedBy;
        ps.portfolioCount = ep.portfolio.length;
        ps.portfolioTurns = ep.portfolioTurns;
        ps.market = ep.market;
        ps.asleep = ep.asleep;
        ps.sleepwalk = ep.sleepwalk;
        ps.deferredDraw = ep.deferredDraw;
        for (const [sid, cd] of Object.entries(ep.butcherTargetCd)) {
          if (ps.butcherTargetCd.get(sid) !== cd) ps.butcherTargetCd.set(sid, cd);
        }
        GameRoom.syncArray(ps.askedHelp, ep.askedHelp);
        GameRoom.syncArray(ps.askedRide, ep.askedRide);

        // 技能冷却同步
        for (const [skillId, cd] of Object.entries(ep.skillCooldowns)) {
          if (ps.skillCooldowns.get(skillId) !== cd) {
            ps.skillCooldowns.set(skillId, cd);
          }
        }

      // 主动技能剩余次数（一个角色可能有多个主动技，如混沌女王）
      const ch = e.characterMap.get(ep.characterId);
      for (const active of ch?.skills.filter((sk) => sk.trigger === 'active') ?? []) {
        const used = ep.skillState[active.id]?.used ?? 0;
        const effect = active.effect as { uses?: number };
        const left = Math.max(0, (effect.uses ?? 1) - used);
        if (ps.skillUsesLeft.get(active.id) !== left) {
          ps.skillUsesLeft.set(active.id, left);
        }
      }
    }
    for (const key of s.players.keys()) {
      if (!seen.has(key)) s.players.delete(key);
    }
  }
}
