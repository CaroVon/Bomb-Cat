import { Client, type Room } from '@colyseus/sdk';
import { useSyncExternalStore } from 'react';
import type { CardDef, ClientMessage, HandCard, ServerMessage } from '@bombcat/shared';
import { BUILTIN_CARD_MAP, cardName, formatMsg } from '@bombcat/shared';
import { getLang, tr } from '../i18n';
import { GAME_SERVER_URL } from './config';
import { joinOptions } from './identity';

export interface GameSnapshot {
  status: 'idle' | 'connecting' | 'in-room' | 'error';
  error: string | null;
  room: Room<any> | null;
  state: any;
  /** 用于强制重渲染的版本号 */
  version: number;
  hand: HandCard[];
  toast: { id: number; text: string; key?: string } | null;
  peek: { id: number; cards: CardDef[] } | null;
  peekHandInfo: { id: number; playerName: string; cards: CardDef[] } | null;
  alterPrompt: CardDef[] | null;
  defusePrompt: number | null;
  gameEnd: Extract<ServerMessage, { action: 'gameEnd' }> | null;
  reconnectHint: { roomId: string; token: string } | null;
  /** 最近收到的表情（id 用于去重触发动画） */
  lastEmote: { id: number; sessionId: string; name: string; emoji: string } | null;
  /** 我的秘密任务（开局私密下发） */
  myObjective: { defId: string; defName: string; description: string; targetName?: string } | null;
  /** 任务达成提示（id 去重） */
  objectiveDone: { id: number; defId: string; defName: string } | null;
  /** 眼泪牌提示（摸到 Nana 的眼泪时弹出） */
  tearPrompt: { id: number; isNana: boolean; nanaName: string } | null;
  /** Future女王命运改写：顶 N 张牌（等待提交选择） */
  futureRewritePrompt: CardDef[] | null;
  /** 拆解提示是否可用香蕉兑换（香蕉女王覆盖期且无真拆解） */
  defuseBanana: boolean;
  /** 大眼Nana揭发：目标牌面（view 关闭即结束；discard/steal 需点选一张） */
  exposePrompt: {
    id: number;
    targetName: string;
    cards: Array<{ instanceId: string; def: CardDef }>;
    mode: 'view' | 'discard' | 'steal';
  } | null;
  /** 秀英求助：收到求助请求（我是被求助者，需回应） */
  helpPrompt: { id: number; fromName: string } | null;
}

let snap: GameSnapshot = {
  status: 'idle',
  error: null,
  room: null,
  state: null,
  version: 0,
  hand: [],
  toast: null,
  peek: null,
  peekHandInfo: null,
  alterPrompt: null,
  defusePrompt: null,
  gameEnd: null,
  reconnectHint: null,
  lastEmote: null,
  myObjective: null,
  objectiveDone: null,
  tearPrompt: null,
  futureRewritePrompt: null,
  defuseBanana: false,
  exposePrompt: null,
  helpPrompt: null,
};

const listeners = new Set<() => void>();
let toastSeq = 0;
let modalSeq = 0;

function emit(): void {
  snap = { ...snap, version: snap.version + 1 };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): GameSnapshot {
  return snap;
}

export function useGame(): GameSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function showToast(text: string, key?: string): void {
  snap.toast = { id: ++toastSeq, text, key };
  emit();
  const id = snap.toast.id;
  setTimeout(() => {
    if (snap.toast?.id === id) {
      snap.toast = null;
      emit();
    }
  }, 3200);
}

const RECONNECT_KEY = 'bombcat:reconnect';

function saveReconnectHint(roomId: string, token: string): void {
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ roomId, token }));
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

function loadReconnectHint(): { roomId: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(RECONNECT_KEY);
    return raw ? (JSON.parse(raw) as { roomId: string; token: string }) : null;
  } catch {
    return null;
  }
}

function clearReconnectHint(): void {
  sessionStorage.removeItem(RECONNECT_KEY);
}

function attach(room: Room<any>): void {
  snap.room = room;
  snap.state = room.state ?? null;
  snap.status = 'in-room';
  snap.error = null;
  snap.gameEnd = null;
  if (room.roomId && room.reconnectionToken) {
    saveReconnectHint(room.roomId, room.reconnectionToken);
  }
  emit();

  room.onStateChange((s: unknown) => {
    snap.state = (s as typeof snap.state) ?? room.state ?? null;
    emit();
  });

  room.onMessage('hand', (msg: ServerMessage & { cards: HandCard[] }) => {
    if (msg.action === 'hand') {
      snap.hand = msg.cards;
      emit();
    }
  });
  room.onMessage('error', (msg: ServerMessage) => {
    if (msg.action === 'error') showToast(msg.msg ? formatMsg(getLang(), msg.msg) : formatMsg(getLang(), msg.message));
  });
  room.onMessage('notice', (msg: ServerMessage & { text: string }) => {
    if (msg.action === 'notice') showToast(msg.msg ? formatMsg(getLang(), msg.msg) : formatMsg(getLang(), msg.text), msg.msg?.k);
  });
  room.onMessage('peekDeck', (msg: ServerMessage & { cards: CardDef[] }) => {
    if (msg.action === 'peekDeck') {
      snap.peek = { id: ++modalSeq, cards: msg.cards };
      emit();
    }
  });
  room.onMessage('peekHand', (msg: ServerMessage & { playerName: string; cards: CardDef[] }) => {
    if (msg.action === 'peekHand') {
      snap.peekHandInfo = { id: ++modalSeq, playerName: msg.playerName, cards: msg.cards };
      emit();
    }
  });
  room.onMessage('alterPrompt', (msg: ServerMessage & { cards: CardDef[] }) => {
    if (msg.action === 'alterPrompt') {
      snap.alterPrompt = msg.cards;
      emit();
    }
  });
  room.onMessage('promptDefuse', (msg: ServerMessage & { deckCount: number; bananaSubstitute?: boolean }) => {
    if (msg.action === 'promptDefuse') {
      snap.defusePrompt = msg.deckCount;
      snap.defuseBanana = !!msg.bananaSubstitute;
      emit();
    }
  });
  room.onMessage('gameEnd', (msg: ServerMessage) => {
    if (msg.action === 'gameEnd') {
      snap.gameEnd = msg;
      emit();
    }
  });
  room.onMessage('emote', (msg: { sessionId: string; name: string; emoji: string }) => {
    snap.lastEmote = { id: Date.now() + Math.random(), ...msg };
    emit();
  });
  room.onMessage(
    'objective',
    (msg: { defId: string; defName: string; description: string; targetName?: string }) => {
      snap.myObjective = msg;
      emit();
    },
  );
  room.onMessage('objectiveDone', (msg: { defId: string; defName: string }) => {
    snap.objectiveDone = { id: Date.now() + Math.random(), ...msg };
    emit();
  });
  room.onMessage('tearPrompt', (msg: { isNana: boolean; nanaName: string }) => {
    snap.tearPrompt = { id: Date.now() + Math.random(), ...msg };
    emit();
  });
  room.onMessage('digestReady', (msg: { cardName: string; cardId?: string; instanceId: string }) => {
    showToast(tr('toast.digest', { card: msg.cardId ? cardName(msg.cardId, getLang()) : msg.cardName }));
  });
  room.onMessage('chaosDraw', (msg: { fromName: string; cardName: string; cardId?: string }) => {
    showToast(
      tr('toast.chaosDraw', {
        from: msg.fromName,
        card: msg.cardId ? cardName(msg.cardId, getLang()) : msg.cardName,
      }),
    );
  });
  room.onMessage('chaosTouch', (msg: { playerName: string }) => {
    showToast(tr('toast.chaosTouch', { name: msg.playerName }));
  });
  room.onMessage('futureRewrite', (msg: { cards: CardDef[] }) => {
    snap.futureRewritePrompt = msg.cards;
    emit();
  });
  room.onMessage(
    'exposePrompt',
    (msg: { targetName: string; cards: Array<{ instanceId: string; def: CardDef }>; mode: 'view' | 'discard' | 'steal' }) => {
      snap.exposePrompt = { id: ++modalSeq, ...msg };
      emit();
    },
  );
  /* ---- v3：数学老师 / 秀英 ---- */
  room.onMessage('helpPrompt', (msg: { fromName: string }) => {
    snap.helpPrompt = { id: ++modalSeq, fromName: msg.fromName };
    emit();
  });
  room.onMessage('helpResolved', (msg: { accepted: boolean; helperName?: string }) => {
    snap.helpPrompt = null;
    showToast(
      msg.accepted
        ? tr('toast.helpAccepted', { name: msg.helperName ?? tr('toast.someone') })
        : tr('toast.helpRejected', { name: msg.helperName ?? tr('toast.someone') }),
    );
    emit();
  });
  /* ---- v4：邪恶苹果头 ---- */
  room.onMessage('appleGiven', (msg: { fromName: string; turns: number }) => {
    showToast(tr('toast.apple', { name: msg.fromName, turns: msg.turns }));
  });

  room.onLeave((code) => {
    if (code === 1000) {
      clearReconnectHint();
    }
    snap.room = null;
    snap.state = null;
    snap.hand = [];
    snap.status = 'idle';
    snap.alterPrompt = null;
    snap.defusePrompt = null;
    snap.futureRewritePrompt = null;
    snap.defuseBanana = false;
    emit();
  });
  room.onError?.((code: number, message?: string) => {
    snap.error = tr('err.connection', { code, message: message ?? '' });
    snap.status = 'error';
    emit();
  });
}

export async function createRoom(
  name: string,
  options?: { bots?: number; run?: boolean; runBonuses?: string[]; extraExploding?: number },
): Promise<void> {
  snap.status = 'connecting';
  snap.error = null;
  emit();
  try {
    const client = new Client(GAME_SERVER_URL);
    const room = await client.create('game', { ...(await joinOptions(name)), ...options });
    attach(room);
  } catch (e) {
    snap.status = 'error';
    snap.error = e instanceof Error ? e.message : String(e);
    emit();
    throw e;
  }
}

/** 快速匹配：优先并入进行中的快速房，否则新建（15s 凑不满补 AI） */
export async function quickMatch(name: string): Promise<void> {
  snap.status = 'connecting';
  snap.error = null;
  emit();
  try {
    const client = new Client(GAME_SERVER_URL);
    const room = await client.joinOrCreate('game', { ...(await joinOptions(name)), quick: true });
    attach(room);
  } catch (e) {
    snap.status = 'error';
    snap.error = e instanceof Error ? e.message : String(e);
    emit();
    throw e;
  }
}

export async function joinRoom(code: string, name: string): Promise<void> {
  snap.status = 'connecting';
  snap.error = null;
  emit();
  try {
    const client = new Client(GAME_SERVER_URL);
    const room = await client.joinById(
      code.trim().toUpperCase(),
      await joinOptions(name),
    );
    attach(room);
  } catch (e) {
    snap.status = 'error';
    snap.error = e instanceof Error ? tr('err.joinFailed', { message: e.message }) : String(e);
    emit();
    throw e;
  }
}

export async function tryReconnect(hint?: { roomId: string; token: string }): Promise<boolean> {
  const h = hint ?? snap.reconnectHint ?? loadReconnectHint();
  if (!h) return false;
  try {
    const client = new Client(GAME_SERVER_URL);
    const room = await client.reconnect(h.roomId, h.token);
    snap.reconnectHint = null;
    attach(room);
    return true;
  } catch {
    clearReconnectHint();
    return false;
  }
}

/** 页面加载时自动恢复中断的对局（刷新/误关标签页） */
export async function autoReconnect(): Promise<boolean> {
  const h = loadReconnectHint();
  if (!h) return false;
  const ok = await tryReconnect(h);
  if (!ok) return false;
  // 等待首份状态到达（最多 ~1.5s），便于调用方判断该回牌桌还是房间
  for (let i = 0; i < 15 && !snap.state?.phase; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/** 当前对局阶段（lobby | playing | finished），未连接时为空串 */
export function snapPhase(): string {
  return snap.state?.phase ?? '';
}

export function leaveRoom(): void {
  snap.room?.leave(true);
  snap.room = null;
  snap.state = null;
  snap.hand = [];
  snap.status = 'idle';
  snap.reconnectHint = null;
  snap.gameEnd = null;
  clearReconnectHint();
  emit();
}

export function sendAct(message: ClientMessage): void {
  snap.room?.send('act', message);
}

export function sendEmote(emoji: string): void {
  snap.room?.send('emote', { emoji });
}

export function sendTearChoice(accept: boolean, giveInstanceId?: string): void {
  snap.tearPrompt = null;
  emit();
  snap.room?.send('act', { action: 'tearChoice', accept, giveInstanceId });
}

export function clearTearPrompt(): void {
  snap.tearPrompt = null;
  emit();
}

/** 香蕉女王兑换（4 张=拆解 / 3 张=任意动作牌） */
export function sendBananaSubstitute(
  mode: 'defuse' | 'action',
  costInstanceIds: string[],
  extra?: { cardId?: string; position?: number; targetSessionId?: string },
): void {
  snap.room?.send('act', {
    action: 'bananaSubstitute',
    mode,
    costInstanceIds,
    cardId: extra?.cardId,
    position: extra?.position,
    targetSessionId: extra?.targetSessionId,
  });
}

/** Future女王命运改写提交 */
export function sendFutureRewritePick(input: {
  activateIdx: number;
  swapInstanceId: string;
  order: number[];
  targetSessionId?: string;
}): void {
  snap.futureRewritePrompt = null;
  emit();
  snap.room?.send('act', { action: 'futureRewritePick', ...input });
}

export function clearFutureRewritePrompt(): void {
  if (snap.futureRewritePrompt !== null) {
    snap.futureRewritePrompt = null;
    emit();
  }
}

/** 猪王：直接丢弃消化完成的牌 */
export function sendDigestPlay(instanceId: string): void {
  snap.room?.send('act', { action: 'digestPlay', instanceId });
}

/** 大眼Nana：揭发点选（弃/抽目标一张牌） */
export function sendExposePick(instanceId: string): void {
  snap.exposePrompt = null;
  emit();
  snap.room?.send('act', { action: 'exposePick', instanceId });
}

export function clearExposePrompt(): void {
  if (snap.exposePrompt !== null) {
    snap.exposePrompt = null;
    emit();
  }
}

/** 秀英求助：回应（同意需给出一张手牌） */
export function sendHelpRespond(accept: boolean, giveInstanceId?: string): void {
  snap.helpPrompt = null;
  emit();
  snap.room?.send('act', { action: 'helpRespond', accept, giveInstanceId });
}

/** 邪恶苹果头：吃掉身上的邪恶苹果（交出一张手牌给投掷者） */
export function sendAppleEat(giveInstanceId: string): void {
  snap.room?.send('act', { action: 'appleEat', giveInstanceId });
}

export function clearPeek(id: number): void {
  if (snap.peek?.id === id) {
    snap.peek = null;
    emit();
  }
}

export function clearPeekHand(id: number): void {
  if (snap.peekHandInfo?.id === id) {
    snap.peekHandInfo = null;
    emit();
  }
}

export function clearDefusePrompt(): void {
  if (snap.defusePrompt !== null) {
    snap.defusePrompt = null;
    emit();
  }
}

export function clearAlterPrompt(): void {
  if (snap.alterPrompt !== null) {
    snap.alterPrompt = null;
    emit();
  }
}

export function clearGameEnd(): void {
  snap.gameEnd = null;
  emit();
}

/* ---------------- 状态派生工具 ---------------- */

/** 合并内置 + 本局自定义卡定义 */
export function buildCardMap(state: any): Map<string, CardDef> {
  const map = new Map(BUILTIN_CARD_MAP);
  if (state?.customCardsJson) {
    for (const json of state.customCardsJson.toArray?.() ?? state.customCardsJson) {
      try {
        const def = JSON.parse(json) as CardDef;
        map.set(def.id, def);
      } catch {
        /* 忽略坏数据 */
      }
    }
  }
  return map;
}

export function playerCount(state: any): number {
  let n = 0;
  state?.players?.forEach?.(() => {
    n++;
  });
  return n;
}

export function eachPlayer(state: any, fn: (p: any) => void): void {
  state?.players?.forEach?.(fn);
}

export function stateLog(state: any): string[] {
  const log = state?.log;
  if (!log) return [];
  return (log.toArray?.() ?? log) as string[];
}

export function turnOrderList(state: any): string[] {
  const t = state?.turnOrder;
  return (t?.toArray?.() ?? t ?? []) as string[];
}

export function nopeCardIds(state: any): string[] {
  const t = state?.nopeCardIds;
  return (t?.toArray?.() ?? t ?? []) as string[];
}

export function nopeNopedBy(state: any): string[] {
  const t = state?.nopeNopedBy;
  return (t?.toArray?.() ?? t ?? []) as string[];
}

export function lastPlayCardIds(state: any): string[] {
  const t = state?.lastPlayCards;
  return (t?.toArray?.() ?? t ?? []) as string[];
}

export function discardTopIds(state: any): string[] {
  const t = state?.discardTopIds;
  return (t?.toArray?.() ?? t ?? []) as string[];
}
