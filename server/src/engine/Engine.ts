import {
  BUILTIN_CARD_MAP,
  BUILTIN_CHARACTERS,
  CLASSIC_DECK,
  MAX_PLAYERS,
  defuseTotal,
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
  PendingPlay,
  PlayCardInput,
  SubPhase,
  UseSkillInput,
} from './types';

let instanceSeq = 0;
const newIid = (cardId: string): string => `${cardId}#${++instanceSeq}`;

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
  /** 结束回合时的摸牌来源（摸牌底语义） */
  private pendingEndDraw: 'bottom' | null = null;
  /** 本轮出牌携带的攻击（targeted=指定目标，null=沿方向下一位） */
  private pendingAttack: { targeted: string | null } | null = null;

  winnerSessionId = '';
  deathOrder: string[] = [];
  logLines: string[] = [];

  /** 最近一次出牌（可视化用：中央舞台展示"谁打了什么牌"） */
  lastPlay: {
    playId: string;
    bySessionId: string;
    byName: string;
    cardIds: string[];
    at: number;
    noped: boolean;
  } | null = null;

  /** 最近一次阵亡（可视化用：爆炸演出） */
  lastDeath: { sessionId: string; name: string; at: number } | null = null;

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

  current(): EnginePlayer | undefined {
    return this.players.find((p) => p.sessionId === this.turnOrder[this.turnIndex]);
  }

  defOf(instance: CardInstance): CardDef {
    return this.cardMap.get(instance.cardId)!;
  }

  handOf(sessionId: string): CardInstance[] {
    return this.players.find((p) => p.sessionId === sessionId)?.hand ?? [];
  }

  private skillOf(player: EnginePlayer, trigger: SkillDef['trigger']): SkillDef | undefined {
    const ch = this.characterMap.get(player.characterId);
    return ch?.skills.find((s) => s.trigger === trigger);
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

  startGame(hostSessionId: string, deckDef: DeckDef | null): EngineEvent[] {
    if (this.phase !== 'lobby') return this.invalid(hostSessionId, '对局已在进行');
    if (hostSessionId !== this.hostSessionId) {
      return this.invalid(hostSessionId, '只有房主能开始游戏');
    }
    const deck = deckDef ?? CLASSIC_DECK;
    const n = this.players.length;
    if (n < 2) return this.invalid(hostSessionId, '至少需要 2 名玩家');

    const result = validateDeck(deck, n);
    if (!result.ok) {
      return this.invalid(hostSessionId, `卡组不合法：${result.errors.join('；')}`);
    }
    this.deckDef = deck;
    this.cardMap = new Map(BUILTIN_CARD_MAP);
    for (const c of deck.customCards) this.cardMap.set(c.id, c);

    const pool: CardInstance[] = [];
    for (const [cardId, count] of Object.entries(deck.counts)) {
      for (let i = 0; i < count; i++) pool.push({ iid: newIid(cardId), cardId });
    }
    this.shuffle(pool);

    // 动作牌至少要够：每人 3 张 + 爆炸猫 + 剩余拆解
    const defuseLeft = Math.max(0, defuseTotal(n) - n);
    const exploding = n - 1;
    if (pool.length < exploding + defuseLeft + n * 3) {
      return this.invalid(hostSessionId, '卡组牌太少，无法支撑这么多玩家');
    }
    // 发牌数按人数自适应（≤6 人发 6 张，人多牌少时自动缩减）
    const dealCount = Math.min(6, Math.floor((pool.length - exploding - defuseLeft) / n));

    this.players.forEach((p) => {
      p.hand = [{ iid: newIid('defuse'), cardId: 'defuse' }];
      for (let i = 0; i < dealCount; i++) {
        p.hand.push(pool.pop()!);
      }
      p.alive = true;
      p.turnsLeft = 1;
      p.skillState = {};
    });

    for (let i = 0; i < defuseLeft; i++) pool.push({ iid: newIid('defuse'), cardId: 'defuse' });
    for (let i = 0; i < n - 1; i++) pool.push({ iid: newIid('exploding'), cardId: 'exploding' });
    this.deck = this.shuffle(pool);
    this.discard = [];

    this.turnOrder = this.players.map((p) => p.sessionId);
    this.turnIndex = Math.floor(this.rng() * this.turnOrder.length);
    this.direction = 1;
    this.phase = 'playing';
    this.subPhase = 'awaiting-action';
    this.winnerSessionId = '';
    this.deathOrder = [];
    this.turnCount = 0;

    const events: EngineEvent[] = [];
    this.players.forEach((p) => this.ev(events, { type: 'hand', sessionId: p.sessionId }));

    const first = this.current()!;
    this.log(events, `游戏开始！卡组【${this.deckDef.name}】，${n} 名玩家，${first.name} 先手（牌堆 ${this.deck.length} 张）`);

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

    const instance = player.hand.find((c) => c.iid === input.instanceId);
    if (!instance) return this.invalid(sessionId, '手中没有这张牌');
    const def = this.defOf(instance);

    if (def.kind === 'defuse') return this.invalid(sessionId, '拆解会在摸到爆炸猫时自动使用');
    if (instance.cardId === 'nope') return this.invalid(sessionId, '否认牌只能在别人出牌的 8 秒窗口内打出');
    if (def.kind === 'exploding') return this.invalid(sessionId, '爆炸猫不能主动打出');

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

    const needsTarget = effects.some(
      (e) =>
        e.type === 'stealRandom' ||
        e.type === 'stealNamed' ||
        e.type === 'peekHand' ||
        e.type === 'swapHand' ||
        e.type === 'targetedAttack',
    );
    if (needsTarget) {
      const t = this.players.find((p) => p.sessionId === input.targetSessionId);
      if (!t || !t.alive || t.sessionId === sessionId) {
        return this.invalid(sessionId, '需要选择一名其他存活玩家作为目标');
      }
    }

    player.hand = player.hand.filter((c) => !instances.some((i) => i.iid === c.iid));

    const events: EngineEvent[] = [];
    this.ev(events, { type: 'hand', sessionId });

    const cardNames = instances.map((i) => this.defOf(i).name).join('+');
    const targetName = this.players.find((p) => p.sessionId === input.targetSessionId)?.name;
    this.log(events, `${player.name} 打出【${cardNames}】${targetName ? `→ ${targetName}` : ''}`);

    this.pendingPlay = {
      playId: `play-${++instanceSeq}`,
      sessionId,
      instances,
      combo,
      effects,
      targetSessionId: needsTarget ? input.targetSessionId : undefined,
      wantCardId,
      nopedBy: [],
    };
    this.lastPlay = {
      playId: this.pendingPlay.playId,
      bySessionId: sessionId,
      byName: player.name,
      cardIds: instances.map((i) => i.cardId),
      at: Date.now(),
      noped: false,
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
      (e) =>
        e.type === 'skip' ||
        e.type === 'attack' ||
        e.type === 'targetedAttack' ||
        e.type === 'drawFromBottom',
    );
    this.pendingEndDraw = pending.effects.some((e) => e.type === 'drawFromBottom')
      ? 'bottom'
      : null;
    if (pending.effects.some((e) => e.type === 'targetedAttack')) {
      this.pendingAttack = { targeted: pending.targetSessionId ?? null };
    } else if (pending.effects.some((e) => e.type === 'attack')) {
      this.pendingAttack = { targeted: null };
    } else {
      this.pendingAttack = null;
    }
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
      case 'targetedAttack':
        return 'ok'; // 回合结束语义在 finishTurn 统一处理

      case 'shuffle': {
        this.shuffle(this.deck);
        this.log(events, '牌堆被洗乱了 🌀');
        return 'ok';
      }

      case 'peek': {
        const n = Math.min(effect.count ?? 3, this.deck.length);
        const top = this.deck.slice(this.deck.length - n).reverse();
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
        const n = Math.min(3, this.deck.length);
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
            this.log(
              events,
              `${target.name} 没有【${this.cardMap.get(effect.cardId ?? '')?.name ?? effect.cardId}】，偷取落空`,
            );
            return 'ok';
          }
        }
        const [stolen] = target.hand.splice(idx, 1);
        player.hand.push(stolen!);
        this.ev(events, { type: 'hand', sessionId: target.sessionId });
        this.ev(events, { type: 'hand', sessionId: player.sessionId });
        this.log(events, `${player.name} 从 ${target.name} 那里偷走了 1 张牌 🤏`);
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
          if (c.cardId === 'exploding') {
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
    const c = this.deck.pop();
    if (!c) return this.invalid(sessionId, '牌堆空了');

    if (c.cardId === 'exploding') {
      const r = this.handleExplosion(player, c, events);
      // 拆解挂起 / 已阵亡（内部已推进回合）；藏猫 → 照常结束回合
      if (r === 'suspend-defuse' || !player.alive) return events;
      return this.finishTurn(events);
    }
    player.hand.push(c);
    this.ev(events, { type: 'hand', sessionId });
    this.log(events, `${player.name} 摸了一张牌`);
    return this.finishTurn(events);
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
      this.pendingDefuse = { sessionId: player.sessionId, instanceId: kitten.iid };
      this.subPhase = 'awaiting-defuse';
      this.log(events, `${player.name} 摸到了爆炸猫，打出拆解 🔧`);
      this.ev(events, {
        type: 'private',
        sessionId: player.sessionId,
        message: { action: 'promptDefuse', deckCount: this.deck.length },
      });
      this.ev(events, { type: 'awaitingDefuse' });
      return 'suspend-defuse';
    }

    // 果奔猫：秘密藏起一张爆炸猫（手里已藏一张时再摸会当场爆炸）
    const holdsExploding = player.hand.some((c) => c.cardId === 'exploding');
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
    player.hand = [];
    this.deathOrder.push(player.sessionId);
    this.lastDeath = { sessionId: player.sessionId, name: player.name, at: Date.now() };
    this.shuffle(this.deck);
    this.log(events, `💥 ${player.name} 摸到了爆炸猫，当场爆炸出局！手牌已洗回牌堆`);
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
    if (!Number.isInteger(position) || position < 0 || position > this.deck.length) {
      return this.invalid(sessionId, '位置无效');
    }
    const events: EngineEvent[] = [];
    const kitten: CardInstance = { iid: this.pendingDefuse.instanceId, cardId: 'exploding' };
    this.pendingDefuse = null;
    this.subPhase = 'awaiting-action';
    this.deck.splice(this.deck.length - position, 0, kitten);
    const name = this.players.find((p) => p.sessionId === sessionId)?.name;
    this.log(events, `${name} 把爆炸猫放回了牌堆第 ${position} 张（0=牌堆顶）`);
    this.ev(events, { type: 'defuseResolved' });

    if (this.queue) return this.runQueue(events);
    return this.finishTurn(events);
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

    const current = this.current();

    // 摸牌底：结束回合前从牌堆底摸一张（走统一的爆炸/藏猫结算）
    if (this.pendingEndDraw && current?.alive) {
      this.pendingEndDraw = null;
      const c = this.deck.shift();
      if (c) {
        if (c.cardId === 'exploding') {
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
    this.pendingEndDraw = null;

    let transfer = 0;
    if (current) {
      current.turnsLeft--;
      transfer = Math.max(0, current.turnsLeft);
      current.turnsLeft = 1; // 重置，下次进入回合时再设置
    }

    const attack = this.pendingAttack;
    this.pendingAttack = null;

    if (attack) {
      // 攻击转移：受害者承担 攻击者剩余回合 + 2
      const victimId = attack.targeted ?? this.nextAliveSessionId();
      const victim = this.players.find((p) => p.sessionId === victimId);
      if (victim && victim.alive) {
        victim.turnsLeft = transfer + 2;
        this.turnIndex = this.turnOrder.indexOf(victim.sessionId);
        this.turnCount++;
        this.log(events, `${victim.name} 被攻击，要连续行动 ${victim.turnsLeft} 个回合 ⚡`);
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
      p.hand.some((c) => c.cardId === 'exploding');

    if (alive.length === 0) {
      // 全灭（极罕见）：最后阵亡者为赢家
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
    this.ev(events, { type: 'gameEnd', winnerSessionId: this.winnerSessionId });
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

    const skill = this.skillOf(player, 'active');
    if (!skill || skill.id !== input.skillId) return this.invalid(sessionId, '你没有这个主动技能');
    if (skill.effect.kind !== 'activeSteal' && skill.effect.kind !== 'activeRecycle') {
      return this.invalid(sessionId, '该技能不是主动技能');
    }
    const skillEffect = skill.effect;

    const events: EngineEvent[] = [];
    const st = this.skillState(player, skill.id);
    if (st.used >= skillEffect.uses) return this.invalid(sessionId, '技能次数已用完');

    const cost = input.costInstanceIds ?? [];
    if (cost.length !== skillEffect.costCards) {
      return this.invalid(sessionId, `需要弃置 ${skillEffect.costCards} 张牌作为代价`);
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
      this.log(
        events,
        `${player.name} 发动「${skill.name}」，偷走了 ${target.name} 的【${this.cardMap.get(input.wantCardId)?.name}】🦹`,
      );
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

    return this.invalid(sessionId, '该技能不是主动技能');
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
