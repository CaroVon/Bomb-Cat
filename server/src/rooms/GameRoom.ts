import { Room, type Client, type Delayed } from 'colyseus';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  NOPE_WINDOW_MS,
  validateBuild,
  validateDeck,
  WORLD_RULE_MAP,
  BUILTIN_CARD_MAP,
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

  maxClients = MAX_PLAYERS;
  patchRate = 50;

  private engine = new GameEngine();
  private pendingDeck: DeckDef | null = null;
  private nopeTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: Delayed | null = null;
  private botTimer: Delayed | null = null;
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
        this.sendError(client, e instanceof Error ? e.message : '服务器内部错误');
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

    // 人机练习：稍候补 bot 并自动开局
    if (this.roomMode.bots && this.roomMode.bots > 0) {
      this.clock.setTimeout(() => {
        if (this.engine.phase !== 'lobby') return;
        this.addBots(this.roomMode.bots!);
        this.autoStart();
      }, 500);
    } else if (this.roomMode.quick) {
      // 快速匹配：15 秒内凑不满 2 人则补 bot 开局
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
    // 否认窗口有独立的 8 秒计时，不叠回合计时
    if (this.engine.subPhase === 'awaiting-nope') {
      this.state.turnEndsAt = 0;
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

  private autoActOnTimeout(): void {
    const e = this.engine;
    if (e.phase !== 'playing') return;
    const cur = e.current();
    if (!cur || !cur.connected) {
      // 当前玩家掉线：交给重连判死流程，不替他行动
      this.armTurnTimer();
      return;
    }
    if (e.subPhase === 'awaiting-action') {
      this.process(e.drawCard(cur.sessionId)); // 超时自动摸牌结束回合
    } else if (e.subPhase === 'awaiting-defuse' && e.pendingDefuse?.sessionId === cur.sessionId) {
      this.process(e.defusePosition(cur.sessionId, 0)); // 放回牌堆顶
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
          this.sendPrivate(sid, { action: 'error', message: '对局已开始' });
          break;
        }
        const v = validateBuild(message.cardIds, this.buildCardPool());
        if (!v.ok) {
          this.sendPrivate(sid, { action: 'error', message: `构筑不合法：${v.error}` });
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
          this.sendPrivate(sid, { action: 'error', message: '只有房主能设置卡组' });
          break;
        }
        if (this.engine.phase !== 'lobby') {
          this.sendPrivate(sid, { action: 'error', message: '对局已开始' });
          break;
        }
        if (message.deck === null) {
          this.pendingDeck = null;
          this.state.deckName = '经典卡组';
          break;
        }
        const size = JSON.stringify(message.deck).length;
        if (size > 64 * 1024) {
          this.sendPrivate(sid, { action: 'error', message: '卡组数据过大' });
          break;
        }
        const result = validateDeck(
          message.deck,
          Math.max(MIN_PLAYERS, this.engine.players.length),
        );
        if (!result.ok) {
          this.sendPrivate(sid, {
            action: 'error',
            message: `卡组不合法：${result.errors.join('；')}`,
          });
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
          }),
        );
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
          this.sendPrivate(e.sessionId, e.message);
          break;
        case 'invalid':
          this.sendPrivate(e.sessionId, { action: 'error', message: e.message });
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

  private sendError(client: Client, message: string): void {
    client.send('error', { action: 'error', message });
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
    s.lastPlayNoped = lp?.noped ?? false;
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
    GameRoom.syncArray(s.log, e.logLines.slice(-30));

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

      // 主动技能剩余次数
      const ch = e.characterMap.get(ep.characterId);
      const active = ch?.skills.find((sk) => sk.trigger === 'active');
      if (active) {
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
