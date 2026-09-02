import { Room, type Client } from 'colyseus';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  NOPE_WINDOW_MS,
  validateDeck,
  type ClientMessage,
  type DeckDef,
  type HandCard,
  type ServerMessage,
} from '@bombcat/shared';
import { GameEngine } from '../engine/Engine.js';
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

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  patchRate = 50;

  private engine = new GameEngine();
  private pendingDeck: DeckDef | null = null;
  private nopeTimer: ReturnType<typeof setTimeout> | null = null;

  onCreate(): void {
    const code = generateRoomCode();
    this.roomId = code;
    this.setState(new GameState());
    this.state.roomCode = code;
    void this.setPrivate(true); // 只通过房间码加入，不进公开列表

    this.onMessage('act', (client: Client, message: ClientMessage) => {
      try {
        this.handleAction(client, message);
      } catch (e) {
        this.sendError(client, e instanceof Error ? e.message : '服务器内部错误');
      }
    });
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
    activeCodes.delete(this.state.roomCode);
  }

  /* ------------------------------------------------------------------ */
  /* 消息分发                                                            */
  /* ------------------------------------------------------------------ */

  private handleAction(client: Client, message: ClientMessage): void {
    const sid = client.sessionId;
    switch (message.action) {
      case 'startGame': {
        const events = this.engine.startGame(sid, this.pendingDeck);
        if (events.some((e) => e.type === 'invalid')) {
          this.process(events);
        } else {
          this.process(events);
        }
        break;
      }
      case 'setCharacter': {
        this.process(this.engine.setCharacter(sid, message.characterId));
        break;
      }
      case 'setDeck': {
        if (sid !== this.engine.hostSessionId) {
          this.sendError(client, '只有房主能设置卡组');
          break;
        }
        if (this.engine.phase !== 'lobby') {
          this.sendError(client, '对局已开始');
          break;
        }
        if (message.deck === null) {
          this.pendingDeck = null;
          this.state.deckName = '经典卡组';
          break;
        }
        const size = JSON.stringify(message.deck).length;
        if (size > 64 * 1024) {
          this.sendError(client, '卡组数据过大');
          break;
        }
        const result = validateDeck(
          message.deck,
          Math.max(MIN_PLAYERS, this.engine.players.length),
        );
        if (!result.ok) {
          this.sendError(client, `卡组不合法：${result.errors.join('；')}`);
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
          this.sendPrivate(e.sessionId, e.message);
          break;
        case 'invalid':
          this.sendPrivate(e.sessionId, { action: 'error', message: e.message });
          break;
        case 'nopeWindowOpened': {
          this.state.nopeEndsAt = Date.now() + NOPE_WINDOW_MS;
          if (this.nopeTimer) clearTimeout(this.nopeTimer);
          this.nopeTimer = setTimeout(() => {
            this.nopeTimer = null;
            this.process(this.engine.resolveNopes());
            this.sync();
          }, NOPE_WINDOW_MS);
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

  private sync(): void {
    const s = this.state;
    const e = this.engine;
    s.phase = e.phase;
    s.subPhase = e.subPhase;
    s.hostSessionId = e.hostSessionId;
    s.deckName = this.pendingDeck ? this.pendingDeck.name : e.phase === 'lobby' ? '经典卡组' : e.deckDef.name;
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
