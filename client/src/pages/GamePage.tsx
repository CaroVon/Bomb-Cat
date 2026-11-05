import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BUILTIN_CHARACTERS,
  RUN_BONUS_MAP,
  cardText,
  charText,
  formatMsg,
  objectiveText,
  runBonusText,
  worldRuleText,
  type CardDef,
  type HandCard,
} from '@bombcat/shared';
import {
  buildCardMap,
  clearAlterPrompt,
  clearFutureRewritePrompt,
  clearGameEnd,
  clearPeek,
  clearPeekHand,
  eachPlayer,
  lastPlayCardIds,
  leaveRoom,
  sendAct,
  sendBananaSubstitute,
  sendDigestPlay,
  sendEmote,
  sendExposePick,
  sendFutureRewritePick,
  clearExposePrompt,
  sendHelpRespond,
  sendAppleEat,
  sendTearChoice,
  clearTearPrompt,
  sendDreamPick,
  clearDreamPrompt,
  clearBombSense,
  stateLog,
  turnOrderList,
  useGame,
  type GameSnapshot,
} from '../lib/game';
import { activeSkinMap } from '../lib/skins';
import { portraitUrl } from '../lib/portraits';
import { animMs, getSettings, setSetting } from '../lib/settings';
import { sfx } from '../lib/sound';
import { explodeAt, winCelebration } from '../lib/fx';
import { recordMatch } from '../lib/stats';
import { advanceStage, endRun, loadRun, offerBonuses } from '../lib/run';
import { CardView, setSkinMap } from '../components/CardView';
import Modal from '../components/Modal';
import {
  TableSeat,
  fmtSigned,
  getSeatPositions,
  marketTone,
  type TableSeatData,
} from '../components/table/TableSeat';
import { CHARACTER_RPG } from '@bombcat/shared';
import { HandFan, type FanCard } from '../components/table/HandFan';
import { Stage, type StageShow } from '../components/table/Stage';
import { DiscardPile, DrawPile } from '../components/table/Piles';
import { BoomBanner, FlashOverlay, TurnBanner } from '../components/table/Effects';
import { useI18n } from '../i18n';
import LangToggle from '../i18n/LangToggle';

function cardNeedsTarget(def: CardDef): boolean {
  return def.effects.some(
    (e) =>
      e.type === 'stealRandom' ||
      e.type === 'stealNamed' ||
      e.type === 'peekHand' ||
      e.type === 'swapHand',
  );
}

/** 表情选项（与服务端白名单一致） */
const EMOTE_CHOICES = ['😂', '😭', '😱', '😡', '👍', '👎', '❤️', '🎉', '💀', '🤔', '😼', '😸'];

/**
 * 外层守卫：没有房间/状态时只显示「连接中」（并在空闲时回大厅）。
 * 牌桌本体 GameTable 只在 state 与 room 都存在时挂载——它内部有大量 hook，
 * 不能放在提前 return 之后调用，否则状态在对局中丢失（断线等）时会触发 React 的 hook 数量错误。
 */
export default function GamePage() {
  const game = useGame();
  const { t } = useI18n();
  const navigate = useNavigate();
  const room = game.room;
  useEffect(() => {
    if (!room && game.status === 'idle') navigate('/lobby');
  }, [room, game.status, navigate]);
  if (!game.state || !room) {
    return (
      <div className="page">
        <p className="muted">{t('game.connecting')}</p>
      </div>
    );
  }
  return <GameTable />;
}

function GameTable() {
  const game = useGame();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const state = game.state;
  const room = game.room;

  const [selected, setSelected] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<
    | { kind: 'play'; combo: string[]; wantCardId?: string }
    | { kind: 'skill'; wantCardId?: string }
    | null
  >(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [ruleDetailOpen, setRuleDetailOpen] = useState(false);
  const [objOpen, setObjOpen] = useState(false);
  const [bonusChoices, setBonusChoices] = useState<string[] | null>(null);
  /** 当前需要选择目标的主动技 id（Pig King 吞噬等） */
  const [skillTargetPicker, setSkillTargetPicker] = useState<string | null>(null);
  /** Voyage 换牌第二步：选自己要交出的 3 张牌 */
  const [voyageGive, setVoyageGive] = useState<{
    skillId: string;
    targetSessionId: string;
    targetName: string;
  } | null>(null);
  /** Julia：建仓 / 平仓 / 查看持仓弹窗 */
  const [investOpen, setInvestOpen] = useState(false);
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  /** 邪恶苹果头：吃苹果弹窗（选一张手牌交出） */
  const [appleEatOpen, setAppleEatOpen] = useState(false);
  /** 日志面板（默认折叠，避免遮挡右上座位） */
  const [logOpen, setLogOpen] = useState(false);
  /** 香蕉女王 3 张兑换弹窗 */
  const [bananaExchangeOpen, setBananaExchangeOpen] = useState(false);
  /** 座位表情气泡：sessionId -> {emoji, id} */
  const [emoteBubbles, setEmoteBubbles] = useState<Record<string, { emoji: string; id: number }>>({});
  const [settings, setSettingsState] = useState(getSettings());
  const celebratedRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pendingPlay = useRef<HandCard | null>(null);

  useEffect(() => {
    setSkinMap(activeSkinMap());
  }, []);

  useEffect(() => {
    if (!room && game.status === 'idle') navigate('/lobby');
  }, [room, game.status, navigate]);

  const cardMap = useMemo(() => buildCardMap(state), [state?.customCardsJson]);
  const myId = room?.sessionId ?? '';
  const log = useMemo(() => stateLog(state), [game.version, state]);

  /* ---------------- 派生数据（先于使用它们的 effect） ---------------- */

  const players: any[] = useMemo(() => {
    const list: any[] = [];
    eachPlayer(state, (p: any) => list.push(p));
    return list;
  }, [game.version, state]);

  const currentId = useMemo(
    () => turnOrderList(state)[state?.turnIndex ?? 0] as string | undefined,
    [game.version, state],
  );

  const playersRef = useRef(players);
  playersRef.current = players;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  /* ---------------- 舞台 / 爆炸 / 横幅（可视化状态机） ---------------- */

  const [stage, setStage] = useState<StageShow | null>(null);
  /** 正在被目标型效果指定的座位（1.6s 金色脉冲） */
  const [targetedId, setTargetedId] = useState('');
  const seenPlay = useRef(0);
  useEffect(() => {
    const at = state?.lastPlayAt ?? 0;
    if (at && at !== seenPlay.current) {
      seenPlay.current = at;
      const defs = lastPlayCardIds(state)
        .map((id) => cardMap.get(id))
        .filter(Boolean) as CardDef[];
      setStage({
        id: at,
        byName: state.lastPlayBy ?? '',
        cards: defs,
        noped: state.lastPlayNoped ?? false,
        targetName: (state.lastPlayTargetName as string) || undefined,
      });
      const tid = (state.lastPlayTargetId as string) || '';
      if (tid) {
        setTargetedId(tid);
        window.setTimeout(() => setTargetedId((cur) => (cur === tid ? '' : cur)), 1600);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.lastPlayAt]);

  // 被否认 → 盖章
  useEffect(() => {
    setStage((s) =>
      s && state?.lastPlayNoped && !s.noped && state?.lastPlayAt === s.id
        ? { ...s, noped: true }
        : s,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.lastPlayNoped]);

  // 否认窗口剩余秒数由 <NopeCountBadge> 自计时显示（不牵动整页）
  const nopeEndsAt = (state?.nopeEndsAt ?? 0) as number;

  // 停留时长与"是否需要他人响应"挂钩（EK2 教训）：否认窗口期持续展示，否则 ~1.6s
  useEffect(() => {
    if (!stage) return;
    if (state?.nopeActive) return;
    const t = setTimeout(() => setStage(null), animMs(1600));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage?.id, state?.nopeActive, state?.lastPlayNoped, settings.fastAnim]);

  // 舞台倒计时（否认窗口中，自计时）
  const stageWithCountdown = useMemo(
    () =>
      stage
        ? { ...stage, countdownEndsAt: state?.nopeActive ? nopeEndsAt : undefined }
        : null,
    [stage, state?.nopeActive, nopeEndsAt],
  );

  const [boom, setBoom] = useState<{ key: number; name: string } | null>(null);
  const seenDeath = useRef(0);
  useEffect(() => {
    const at = state?.lastDeathAt ?? 0;
    if (at && at !== seenDeath.current) {
      seenDeath.current = at;
      setBoom({ key: at, name: state.lastDeathBy ?? '' });
      sfx('boom');
      // 从阵亡者座位迸发碎片（找不到座位则从中央）
      const el = document.querySelector(`[data-seat="${state.lastDeathById ?? ''}"]`);
      const rect = el?.getBoundingClientRect();
      if (rect) {
        explodeAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        explodeAt(window.innerWidth / 2, window.innerHeight / 3);
      }
      const timer = setTimeout(() => setBoom(null), animMs(1500));
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.lastDeathAt]);

  // 表情气泡（2.5s 后消散；可屏蔽）
  useEffect(() => {
    const e = game.lastEmote;
    if (!e) return;
    if (!getSettings().emotes) return;
    sfx('emote');
    setEmoteBubbles((prev) => ({ ...prev, [e.sessionId]: { emoji: e.emoji, id: e.id } }));
    const t = setTimeout(() => {
      setEmoteBubbles((prev) => {
        const next = { ...prev };
        delete next[e.sessionId];
        return next;
      });
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.lastEmote?.id]);

  // 技能触发反馈标签（预言家看牌/铁壁挡偷/果奔藏猫 → 中央光效 2s）
  const [skillFlash, setSkillFlash] = useState<{ id: number; text: string } | null>(null);
  const seenNotice = useRef(0);
  useEffect(() => {
    const notices = game.toast;
    if (!notices) return;
    const text = notices.text;
    const isSkillNotice =
      notices.key === 'note.streaking' ||
      text.includes('果奔猫生效') || text.includes('铁壁') || text.includes('回响');
    if (isSkillNotice) {
      setSkillFlash({ id: Date.now(), text: text.split(/。|\. /)[0] ?? text });
      sfx('skill');
      const t = setTimeout(() => setSkillFlash(null), 2000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.toast?.id]);

  // 出牌音效
  useEffect(() => {
    if (stage) sfx('card');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage?.id]);

  // 非法操作提示音
  useEffect(() => {
    if (game.toast) sfx('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.toast?.id]);

  // 胜利庆祝（只放一次）+ 战绩记录 + 无尽挑战推进
  const gameEnded = !!game.gameEnd;
  useEffect(() => {
    if (gameEnded && !celebratedRef.current) {
      celebratedRef.current = true;
      sfx('win');
      winCelebration();
      const end = game.gameEnd;
      const mine = end?.ranking.find((r) => r.sessionId === myId);
      if (end && mine) {
        void recordMatch({
          place: mine.place,
          playerCount: end.ranking.length,
          deckName: state?.deckName ?? '经典卡组',
          characterId: me?.characterId ?? 'none',
        });
      }
      // 无尽挑战：获胜 → 三选一增益；失败 → run 结束
      const run = loadRun();
      if (run && end) {
        if (end.winnerName && mine?.place === 1) {
          setBonusChoices(offerBonuses(run.bonuses));
        } else {
          const summary = endRun();
          window.setTimeout(() => {
            window.alert(`🔥 ${t('game.runOver', { stage: summary.stage, best: summary.best })}`);
          }, 1200);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameEnded]);

  const [banner, setBanner] = useState<{ text: string; gold: boolean } | null>(null);
  const seenTurn = useRef<string | null>(null);
  useEffect(() => {
    const cur = currentIdRef.current;
    if (cur && seenTurn.current !== cur && state?.phase === 'playing') {
      seenTurn.current = cur;
      const name = playersRef.current.find((p: any) => p.sessionId === cur)?.name ?? '';
      const gold = cur === myId;
      setBanner({ text: gold ? t('game.yourTurnBanner') : t('game.theirTurnBanner', { name }), gold });
      if (gold) sfx('turn');
      const timer = setTimeout(() => setBanner(null), animMs(1500));
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, state?.phase, myId]);

  // 拆解/重排弹窗关闭逻辑
  useEffect(() => {
    if (state?.subPhase === 'awaiting-alter' && state?.alterBy === myId) return;
    const t = setTimeout(() => clearAlterPrompt(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.subPhase, state?.alterBy, game.version]);

  // Julia：回合切换 / 离开行动阶段时收起建仓、平仓弹窗（避免下回合自动重开）
  useEffect(() => {
    if (state?.subPhase === 'awaiting-action' && currentId === myId) return;
    setInvestOpen(false);
    setCashoutOpen(false);
  }, [state?.subPhase, currentId, myId]);

  // 懒懒羊：梦境选择阶段结束（超时自动选 / 已提交）→ 关闭弹窗
  useEffect(() => {
    if (!game.dreamPrompt) return;
    if (state?.subPhase === 'awaiting-dream' && state?.dreamBy === myId) return;
    const t = setTimeout(() => clearDreamPrompt(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.subPhase, state?.dreamBy, game.dreamPrompt?.id]);

  /* ---------------- 派生数据（非 hook 部分） ---------------- */

  // 外层 GamePage 已保证 state/room 存在；这里只为类型收窄（同一快照下不会触发，hook 顺序因此恒定）
  if (!state || !room) return null;

  const me = players.find((p) => p.sessionId === myId);
  const others = players.filter((p) => p.sessionId !== myId);
  const isMyTurn = currentId === myId && state.phase === 'playing';
  const canAct = isMyTurn && state.subPhase === 'awaiting-action' && me?.alive;
  /** 屠夫封锁：不能使用主动技与功能牌（拆解除外） */
  const myLocked = !!(me as any)?.lockedBy;
  /** 屠夫：我对某目标的剩余剔骨冷却 */
  const butcherCdOf = (sid: string): number =>
    ((me as any)?.butcherTargetCd?.get?.(sid) ?? (me as any)?.butcherTargetCd?.[sid] ?? 0) as number;
  /** 司机小贾：可以邀请上车的人（存活、没冰冻、有手牌、不在车上、本回合没问过） */
  const askedRide = ((me as any)?.askedRide?.toArray?.() ?? (me as any)?.askedRide ?? []) as string[];
  const canInviteRide = (p: any): boolean =>
    !!p.alive &&
    p.sessionId !== myId &&
    (p.freezeLayers ?? 0) <= 0 &&
    (p.handCount ?? 0) > 0 &&
    !p.freeRide &&
    !askedRide.includes(p.sessionId);
  /** 司机小贾：变道——按出牌顺序列出存活玩家，以及每人当前方向上的下家 */
  const turnIds = turnOrderList(state) as string[];
  const laneOrder: any[] = turnIds
    .map((sid) => players.find((p) => p.sessionId === sid))
    .filter((p) => p && p.alive);
  const laneNextOf = (sid: string): any => {
    const n = turnIds.length;
    let i = turnIds.indexOf(sid);
    const dir = (state?.direction as number) === -1 ? -1 : 1;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      const p = players.find((x) => x.sessionId === turnIds[i]);
      if (p?.alive && p.sessionId !== sid) return p;
    }
    return undefined;
  };

  const myHand: HandCard[] = game.hand;
  const myChar = BUILTIN_CHARACTERS.find((c) => c.id === me?.characterId);
  const myCharText = myChar ? charText(myChar, lang) : null;
  /** 技能名/描述（按语言） */
  const skillText = (sk: { id: string; name: string; description: string }) =>
    myCharText ? myCharText.skill(sk.id, { name: sk.name, description: sk.description }) : sk;
  const ruleText = state.worldRuleId ? worldRuleText(state.worldRuleId as string, lang) : null;
  const ruleName = ruleText?.name ?? (state.worldRuleName as string);
  const ruleDesc = ruleText?.description ?? (state.worldRuleDesc as string);
  const deckLabel = state.deckName === '经典卡组' ? t('game.classicDeck') : (state.deckName as string);
  const objName = (o: { defId: string; defName: string }) => objectiveText(o.defId, lang)?.name ?? o.defName;
  const activeSkills = useMemo(
    () => myChar?.skills.filter((s) => s.trigger === 'active') ?? [],
    [myChar],
  );
  /** 用于旧版 SkillDialog 的首个有代价主动技 */
  const activeSkill = activeSkills.find(
    (s) =>
      s.effect.kind === 'activeSteal' || s.effect.kind === 'activeRecycle' || s.effect.kind === 'activeSwap',
  );
  const skillUsesLeft = activeSkill
    ? (me?.skillUsesLeft?.get?.(activeSkill.id) ?? me?.skillUsesLeft?.[activeSkill.id] ?? 0)
    : 0;

  const selectedCards = myHand.filter((c) => selected.includes(c.instanceId));
  /** 有效组合：全部为可组普通猫，且（同名 或 含万能猫通配） */
  const selectedSamePlain =
    selectedCards.length >= 2 &&
    selectedCards.every((c) => c.def.kind === 'plain' && c.def.comboable) &&
    (new Set(selectedCards.map((c) => c.def.id)).size === 1 ||
      selectedCards.some((c) => c.def.feral));

  const playable = useMemo(() => {
    const set = new Set<string>();
    if (!canAct || myLocked) return set;
    // 猪王：消化牌未处理时只能打那张牌
    const must = (me as any)?.mustPlayIid as string | undefined;
    if (must) {
      set.add(must);
      return set;
    }
    const counts = new Map<string, number>();
    myHand.forEach((c) => counts.set(c.def.id, (counts.get(c.def.id) ?? 0) + 1));
    const plains = myHand.filter((c) => c.def.kind === 'plain' && c.def.comboable);
    const hasFeral = plains.some((c) => c.def.feral);
    myHand.forEach((c) => {
      if (c.def.kind === 'defuse' || c.def.id === 'nope' || c.def.kind === 'streaking') return;
      // 羊毛毯：被动牌，不能主动打出
      if (c.def.id === 'dream-fleece') return;
      if (c.def.kind === 'plain') {
        // 同名 >=2，或有万能猫且场上普通猫 >=2
        if ((counts.get(c.def.id) ?? 0) >= 2 || (hasFeral && plains.length >= 2)) {
          set.add(c.instanceId);
        }
      } else {
        set.add(c.instanceId);
      }
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct, game.hand, game.version]);

  const myNope = myHand.find((c) => c.def.id === 'nope');
  const nopedBy = (state.nopeNopedBy?.toArray?.() ?? state.nopeNopedBy ?? []) as string[];
  const canNope =
    state.nopeActive &&
    !!myNope &&
    !myLocked &&
    !(me as any)?.asleep &&
    state.nopePlayBy !== myId &&
    nopedBy[nopedBy.length - 1] !== myId &&
    me?.alive;

  const fanCards: FanCard[] = myHand;

  // 覆盖期间手牌遮名；香蕉女王的兑换入口
  const bananaOverlay = state.bananaOverlayTurns > 0;
  const iAmBanana = me?.characterId === 'banana';

  /* ---------------- 交互 ---------------- */

  function toggleSelect(instanceId: string) {
    setSelected((prev) =>
      prev.includes(instanceId) ? prev.filter((i) => i !== instanceId) : [...prev, instanceId],
    );
  }

  const onCardClick = useCallback(
    (card: HandCard) => {
      if (!canAct) return;
      // 大香蕉之怒覆盖期间：女王点手牌只会选中（选中的牌用于兑换）；其他人盲打
      if (bananaOverlay) {
        if (iAmBanana) {
          toggleSelect(card.instanceId);
          return;
        }
        playSingle(card);
        return;
      }
      if (card.def.kind === 'plain') {
        toggleSelect(card.instanceId);
        return;
      }
      if (cardNeedsTarget(card.def)) {
        setTargetMode({ kind: 'play', combo: [] });
        pendingPlay.current = card;
        return;
      }
      playSingle(card);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canAct, targetMode, playSingle, bananaOverlay, iAmBanana],
  );

  function playSingle(card: HandCard, targetSessionId?: string, combo: string[] = []) {
    sendAct({
      action: 'playCard',
      instanceId: card.instanceId,
      comboInstanceIds: combo.length ? combo : undefined,
      targetSessionId,
      wantCardId: targetMode?.wantCardId,
    });
    setSelected([]);
    setTargetMode(null);
  }

  function confirmTarget(targetSessionId: string) {
    const mode = targetMode;
    setTargetMode(null);
    if (!mode) return;
    if (mode.kind === 'play') {
      if (mode.combo.length > 0) {
        sendAct({
          action: 'playCard',
          instanceId: mode.combo[0]!,
          comboInstanceIds: mode.combo.slice(1),
          targetSessionId,
          wantCardId: mode.wantCardId,
        });
      } else if (pendingPlay.current) {
        sendAct({
          action: 'playCard',
          instanceId: pendingPlay.current.instanceId,
          targetSessionId,
        });
      }
      pendingPlay.current = null;
      setSelected([]);
    } else if (mode.kind === 'skill' && activeSkill) {
      sendAct({
        action: 'useSkill',
        skillId: activeSkill.id,
        costInstanceIds: selectedRef.current,
        targetSessionId,
        wantCardId: mode.wantCardId,
      });
      setSelected([]);
    }
  }

  const bounceId =
    stage && Date.now() - (state.lastPlayAt ?? 0) < 1200 ? (state.lastPlayById as string) : '';

  const turnEndsAt = (state.turnEndsAt ?? 0) as number;

  /* ---------------- 渲染 ---------------- */

  // 座位位置表按对手数缓存（稳定引用，避免 TableSeat memo 失效）
  const seatPositions = useMemo(() => getSeatPositions(others.length), [others.length]);
  /**
   * 对手座位按「出牌顺序」排列：从本机玩家的下家开始，沿当前方向依次排开。
   * 这样变道 / 反转后座位会跟着移动，顺位角标 1 永远是你的下家。
   */
  const seatedOthers = useMemo(() => {
    const ids = turnOrderList(state) as string[];
    const n = ids.length;
    const dir = (state?.direction as number) === -1 ? -1 : 1;
    const start = ids.indexOf(myId ?? '');
    if (start < 0 || n === 0) return others;
    const ordered: any[] = [];
    for (let k = 1; k < n; k++) {
      const sid = ids[(start + dir * k + n * k) % n];
      const p = others.find((o) => o.sessionId === sid);
      if (p) ordered.push(p);
    }
    for (const p of others) if (!ordered.includes(p)) ordered.push(p);
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.version, state, myId, others.length]);
  const orderNoOf = useMemo(() => {
    const m = new Map<string, number>();
    let k = 0;
    for (const p of seatedOthers) if (p.alive) m.set(p.sessionId, ++k);
    return m;
  }, [seatedOthers]);

  /* 司机小贾变道：序号变化 → 全场提示 + 两个座位高亮 */
  const [swappedIds, setSwappedIds] = useState<string[]>([]);
  const laneSeqSeen = useRef<number | null>(null);
  useEffect(() => {
    const seq = (state?.laneSwapSeq as number) ?? 0;
    if (laneSeqSeen.current === null) {
      laneSeqSeen.current = seq; // 进房/重连时不回放旧的变道
      return;
    }
    if (seq === laneSeqSeen.current) return;
    laneSeqSeen.current = seq;
    const a = players.find((p) => p.sessionId === state.laneSwapA);
    const b = players.find((p) => p.sessionId === state.laneSwapB);
    if (!a || !b) return;
    setSwappedIds([a.sessionId, b.sessionId]);
    setSkillFlash({ id: Date.now(), text: t('game.laneFlash', { a: a.name, b: b.name }) });
    sfx('skill');
    const tm = setTimeout(() => {
      setSwappedIds([]);
      setSkillFlash(null);
    }, 2200);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.laneSwapSeq]);

  // 香蕉女王的兑换入口（覆盖期间 2 张手牌 = 任意技能牌）
  const canBananaAction =
    canAct && bananaOverlay && iAmBanana && myHand.length >= 2 && !me?.mustPlayIid;
  // 秀英：冰冻状态（本回合被帮助过则可正常行动）
  const iAmXiuying = me?.characterId === 'xiuying';
  const myFrozenNow = !!me?.freezeLayers && me.freezeLayers > 0 && !me.helpedThisTurn;
  const helpWaiting = state.helpOwnerId === myId && !!state.helpPendingBy;
  // 猪王：必须先处理消化牌
  const myMustPlay = (me?.mustPlayIid as string) || '';
  // Julia：持仓 / 大盘（大盘存在 Julia 本人身上；有人持仓时顶栏显示）
  const myPortfolioCount = ((me as any)?.portfolioCount ?? 0) as number;
  const myMarket = ((me as any)?.market ?? 0) as number;
  const marketHolder = players.find((p) => ((p as any).portfolioCount ?? 0) > 0);
  const marketValue = ((marketHolder as any)?.market ?? 0) as number;
  const investableCards = myHand.filter(
    (c) => c.def.kind !== 'exploding' && c.def.kind !== 'streaking' && c.def.kind !== 'tear',
  );
  const investSkill = activeSkills.find((s) => s.effect.kind === 'juliaInvest');
  const investEffect = investSkill?.effect.kind === 'juliaInvest' ? investSkill.effect : null;
  // 懒懒羊：别人正在挑梦境牌
  const dreamWaitingName =
    state.subPhase === 'awaiting-dream' && state.dreamBy && state.dreamBy !== myId
      ? (players.find((p) => p.sessionId === state.dreamBy)?.name ?? t('game.opponent'))
      : '';

  return (
    <div
      className={`table-root ${boom ? 'is-shaking' : ''} ${
        state.bananaOverlayTurns > 0 ? 'banana-overlay-active' : ''
      }`}
    >
      <FlashOverlay boomKey={boom?.key ?? 0} />
      {/* Banana 覆盖提示 */}
      {state.bananaOverlayTurns > 0 && (
        <div className="banana-banner">
          🍌 {t('game.bananaRage', { n: state.bananaOverlayTurns })}
          <span className="banana-banner-sub">
            {iAmBanana ? t('game.bananaSubQueen') : t('game.bananaSubOther')}
          </span>
        </div>
      )}
      {/* 混沌之触提示 */}
      {state.chaosDrawsActive && (
        <div className="chaos-active-indicator">🌀 {t('game.chaosActive')}</div>
      )}
      {/* 回合超时红色 vignette（最后 10 秒，自计时） */}
      {isMyTurn && me?.alive && state.phase === 'playing' && turnEndsAt > 0 && (
        <TurnVignette endsAt={turnEndsAt} />
      )}
      {/* 技能触发反馈 */}
      <AnimatePresence>
        {skillFlash && (
          <motion.div
            key={skillFlash.id}
            className="skill-flash"
            initial={{ opacity: 0, scale: 0.8, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            {skillFlash.text}
          </motion.div>
        )}
      </AnimatePresence>
      <TurnBanner text={banner?.text ?? null} gold={banner?.gold ?? false} />
      <BoomBanner name={boom?.name ?? null} />

      {/* 对手席（围绕桌面分布） */}
      <div className="table-opponents">
        {seatedOthers.map((p, idx) => {
          const pos = seatPositions[idx] ?? { top: '0%', left: '50%' };
          return (
            <TableSeat
              key={p.sessionId}
              seat={p as TableSeatData}
              isCurrent={p.sessionId === currentId}
              bounced={p.sessionId === bounceId}
              timerEndsAt={p.sessionId === currentId ? turnEndsAt : null}
              emote={emoteBubbles[p.sessionId] ?? null}
              position={pos}
              targeted={p.sessionId === targetedId}
              handCount={p.handCount as number}
              alive={!!p.alive}
              connected={!!p.connected}
              turnsLeft={(p.turnsLeft as number) ?? 1}
              digestionTurns={(p.digestionTurns as number) ?? 0}
              fullTurns={(p.fullTurns as number) ?? 0}
              archives={(p.archives as number) ?? 0}
              mathSubDraw={(p.mathSubDraw as number) ?? 0}
              mathMulNext={(p.mathMulNext as number) ?? 0}
              mathDivNext={(p.mathDivNext as number) ?? 0}
              freezeLayers={(p.freezeLayers as number) ?? 0}
              lychees={(p.lychees as number) ?? 0}
              appleTurns={(p.appleTurns as number) ?? 0}
              boneStacks={(p.boneStacks as number) ?? 0}
              locked={!!p.lockedBy}
              luckCharges={(p.luckCharges as number) ?? 0}
              freeRide={!!p.freeRide}
              portfolioCount={(p.portfolioCount as number) ?? 0}
              market={(p.market as number) ?? 0}
              asleep={!!p.asleep}
              sleepwalk={!!p.sleepwalk}
              deferredDraw={(p.deferredDraw as number) ?? 0}
              orderNo={orderNoOf.get(p.sessionId)}
              swapped={swappedIds.includes(p.sessionId)}
            />
          );
        })}
      </div>

      {/* 我的角色展示（手牌区左上角） */}
      {me && (
        <div className="my-char-badge" style={{ ['--theme' as string]: (CHARACTER_RPG[me.characterId] ?? CHARACTER_RPG['none']!).themeColor }}>
          <div
            className="my-char-portrait"
            style={{ backgroundImage: `url(${portraitUrl(me.characterId)})` }}
          />
          <div className="my-char-info">
            <span className="my-char-name">{myCharText?.name ?? t('table.noChar')}</span>
            <span className="my-char-player">{me.name}</span>
            {!me.alive && <span className="my-char-dead">💀 {t('table.out')}</span>}
            {!!me.digestionTurns && me.digestionTurns > 0 && (
              <span className="seat-status-badge is-digest" title={t('game.b.digestT')}>
                🐷 {t('game.b.digest')} ×{me.digestionTurns}
              </span>
            )}
            {!!me.fullTurns && me.fullTurns > 0 && (
              <span className="seat-status-badge is-full" title={t('game.b.fullT')}>
                🥱 {t('game.b.full')} ×{me.fullTurns}
              </span>
            )}
            {myMustPlay && (
              <span className="seat-status-badge is-must" title={t('game.b.mustT')}>
                ⚠️ {t('game.b.must')}
              </span>
            )}
            {!!me.archives && me.archives > 0 && (
              <span className="seat-status-badge is-archive" title={t('game.b.archiveT')}>
                👁{t('game.b.archive')} {me.archives}
              </span>
            )}
            {!!me.freezeLayers && me.freezeLayers > 0 && (
              <span className="seat-status-badge is-frozen" title={t('game.b.frozenT')}>
                ❄️ {t('game.b.frozen')} ×{me.freezeLayers}
              </span>
            )}
            {!!me.mathSubDraw && me.mathSubDraw > 0 && (
              <span className="seat-status-badge is-mathsub" title={t('game.b.subT')}>
                ➖ {t('game.b.sub')} ×{me.mathSubDraw}
              </span>
            )}
            {!!me.mathMulNext && me.mathMulNext > 0 && (
              <span className="seat-status-badge is-mathmul" title={t('game.b.mulT')}>
                ✖️ {t('game.b.mul')} ×{me.mathMulNext}
              </span>
            )}
            {!!me.mathDivNext && me.mathDivNext > 0 && (
              <span className="seat-status-badge is-mathdiv" title={t('game.b.divT')}>
                ➗ {t('game.b.div')} ×{me.mathDivNext}
              </span>
            )}
            {!!me.lychees && me.lychees > 0 && (
              <span className="seat-status-badge is-lychee" title={t('table.st.lychee')}>
                🍒 {t('game.b.lychee')} {me.lychees}/2
              </span>
            )}
            {!!me.appleTurns && me.appleTurns > 0 && (
              <span className="seat-status-badge is-apple" title={t('game.b.appleT')}>
                🍏 {t('game.b.apple')} ×{me.appleTurns}
              </span>
            )}
            {me.characterId === 'butcher' && (
              <span className="seat-status-badge is-bone" title={t('game.b.boneT')}>
                🔪 {t('game.b.bone')} {(me as any).boneStacks ?? 0}/5
              </span>
            )}
            {myLocked && (
              <span className="seat-status-badge is-locked" title={t('game.b.lockedT')}>
                🔒 {t('game.b.locked')}
              </span>
            )}
            {me.characterId === 'driver' && (
              <>
                <span className="seat-status-badge is-luck" title={t('game.b.fareT')}>
                  🚕 {t('game.b.fare')} {((me as any).fares ?? 0) % 3}/3
                </span>
                <span className="seat-status-badge is-luck" title={t('game.b.fareT')}>
                  🍀 {t('game.b.luck')} ×{(me as any).luckCharges ?? 0}
                </span>
              </>
            )}
            {!!(me as any).freeRide && (
              <span className="seat-status-badge is-ride" title={t('game.b.rideT')}>
                🚕 {t('game.b.ride')}
              </span>
            )}
            {myPortfolioCount > 0 && (
              <>
                <button
                  type="button"
                  className="seat-status-badge is-portfolio is-btn"
                  title={t('game.b.portfolioT')}
                  onClick={() => setPortfolioOpen(true)}
                >
                  💼 {t('game.b.portfolio', { k: myPortfolioCount, t: (me as any).portfolioTurns ?? 0 })}
                </button>
                <span
                  className={`seat-status-badge is-market ${marketTone(myMarket)}`}
                  title={t('game.b.marketT')}
                >
                  📈 {t('game.b.market')} {fmtSigned(myMarket)}
                </span>
              </>
            )}
            {!!(me as any).asleep && (
              <span className="seat-status-badge is-asleep" title={t('game.b.asleepT')}>
                💤 {t('game.b.asleep')}
              </span>
            )}
            {!!(me as any).sleepwalk && (
              <span className="seat-status-badge is-sleepwalk" title={t('game.b.sleepwalkT')}>
                🚶 {t('game.b.sleepwalk')}
              </span>
            )}
            {((me as any).deferredDraw ?? 0) > 0 && (
              <span className="seat-status-badge is-snooze" title={t('game.b.snoozeT')}>
                🛌 +{(me as any).deferredDraw}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 中央牌桌 */}
      <main className="table-center-v2">
        <DrawPile count={state.deckCount} />
        <Stage show={stageWithCountdown} />
        <DiscardPile
          topIds={(state.discardTopIds?.toArray?.() ?? state.discardTopIds ?? []) as string[]}
          total={state.discardCount}
          cardMap={cardMap}
        />
      </main>

      {/* 状态条 */}
      <div className="statusline">
        {me && emoteBubbles[me.sessionId] && (
          <span className="self-emote" key={emoteBubbles[me.sessionId]!.id}>
            {emoteBubbles[me.sessionId]!.emoji}
          </span>
        )}
        {state.worldRuleName && (
          <button
            className="rule-chip"
            title={ruleDesc}
            onClick={() => setRuleDetailOpen(true)}
          >
            {state.worldRuleEmoji} {ruleName}
          </button>
        )}
        {game.myObjective && !game.objectiveDone && (
          <button className="obj-chip" onClick={() => setObjOpen(true)} title={t('game.objTitle')}>
            🎯 {objName(game.myObjective)}
          </button>
        )}
        {game.objectiveDone && <span className="obj-chip is-done">🎯 {objName(game.objectiveDone)} ✓</span>}
        {marketHolder && (
          <span className={`market-chip ${marketTone(marketValue)}`} title={t('game.b.marketT')}>
            📈 {t('game.b.market')} {fmtSigned(marketValue)}
          </span>
        )}
        <span className={`status-turn ${isMyTurn ? 'is-mine' : ''}`}>
          {state.phase === 'finished'
            ? `🏆 ${t('game.finished')}`
            : isMyTurn
              ? me?.alive
                ? t('game.yourTurn')
                : t('game.spectating')
              : t('game.waitingFor', { name: players.find((p) => p.sessionId === currentId)?.name ?? '' })}
        </span>
        <span className="muted status-deck">{deckLabel}</span>
        <span className="muted status-dir">
          {state.direction === 1 ? `↻ ${t('game.cw')}` : `↺ ${t('game.ccw')}`}
        </span>
        <span className="muted status-me">
          {myChar?.emoji} {myCharText?.name ?? t('table.noChar')}
          {me && !me.alive ? ` · 👻 ${t('game.spectating')}` : ''}
        </span>
        <LangToggle className="status-lang" />
      </div>

      {/* 行动条 */}
      <div className="actionbar">
        <button
          className={`action-main ${canAct ? 'is-active' : ''}`}
          disabled={!canAct || !!myMustPlay || helpWaiting}
          title={
            myFrozenNow
              ? t('game.drawFrozenT')
              : me?.fullTurns > 0
                ? t('game.drawFullT')
                : myMustPlay
                  ? t('game.drawMustT')
                  : undefined
          }
          onClick={() => sendAct({ action: 'draw' })}
        >
          {myFrozenNow
            ? t('game.endFrozen')
            : me?.fullTurns > 0
              ? t('game.endFull')
              : t('game.endDraw')}
          {isMyTurn && turnEndsAt > 0 && <TurnCountBadge endsAt={turnEndsAt} />}
        </button>

        {/* 猪王：直接丢弃消化完成的牌 */}
        {canAct && myMustPlay && (
          <button
            className="action-skill"
            title={t('game.discardDigestT')}
            onClick={() => sendDigestPlay(myMustPlay)}
          >
            🐷 {t('game.discardDigest')}
          </button>
        )}

        {/* 香蕉女王：2 张香蕉兑换任意技能牌（选中的手牌自动带入代价） */}
        {canBananaAction && (
          <button
            className="action-skill"
            title={t('game.bananaSwapT')}
            onClick={() => setBananaExchangeOpen(true)}
          >
            🍌×2 {t('game.bananaSwap')}
          </button>
        )}

        {/* 邪恶苹果头：吃掉身上的邪恶苹果 */}
        {canAct && (me?.appleTurns ?? 0) > 0 && (
          <button
            className="action-skill"
            title={t('game.eatAppleT')}
            onClick={() => setAppleEatOpen(true)}
          >
            🍏 {t('game.eatApple')} ×{me.appleTurns}
          </button>
        )}

        {canNope && (
          <button
            className="action-nope"
            onClick={() => myNope && sendAct({ action: 'playCard', instanceId: myNope.instanceId, asNope: true })}
          >
            {t('game.nope')}<NopeCountBadge endsAt={nopeEndsAt} />
          </button>
        )}

        {/* 表情轮盘 */}
        <div className="emote-wrap">
          <button className="action-emote" onClick={() => setEmoteOpen((v) => !v)} title={t('game.emote')}>
            😼
          </button>
          {emoteOpen && (
            <div className="emote-wheel">
              {EMOTE_CHOICES.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    sendEmote(e);
                    setEmoteOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 设置开关：音效 / 表情 / 动画速度 */}
        <button
          className={`action-toggle ${settings.sound ? 'is-on' : ''}`}
          title={settings.sound ? t('game.soundOn') : t('game.soundOff')}
          onClick={() => {
            setSetting('sound', !settings.sound);
            setSettingsState(getSettings());
          }}
        >
          {settings.sound ? '🔊' : '🔇'}
        </button>
        <button
          className={`action-toggle ${settings.emotes ? 'is-on' : ''}`}
          title={settings.emotes ? t('game.emotesOn') : t('game.emotesOff')}
          onClick={() => {
            setSetting('emotes', !settings.emotes);
            setSettingsState(getSettings());
          }}
        >
          {settings.emotes ? '💬' : '🚫'}
        </button>
        <button
          className={`action-toggle ${settings.fastAnim ? 'is-on' : ''}`}
          title={settings.fastAnim ? t('game.anim2x') : t('game.anim1x')}
          onClick={() => {
            setSetting('fastAnim', !settings.fastAnim);
            setSettingsState(getSettings());
          }}
        >
          {settings.fastAnim ? '⏩' : '▶️'}
        </button>

        {canAct && !bananaOverlay && !myFrozenNow && selectedSamePlain && selectedCards.length === 2 && (
          <button
            className="action-combo"
            onClick={() =>
              setTargetMode({
                kind: 'play',
                combo: selected.map((s) => myHand.find((c) => c.instanceId === s)!.instanceId),
              })
            }
          >
            {t('game.pairSteal')}
          </button>
        )}
        {canAct && !bananaOverlay && !myFrozenNow && selectedSamePlain && selectedCards.length === 3 && (
          <NamedComboButton
            cardMap={cardMap}
            onPick={(cardId) =>
              setTargetMode({
                kind: 'play',
                combo: selected.map((s) => myHand.find((c) => c.instanceId === s)!.instanceId),
                wantCardId: cardId,
              })
            }
          />
        )}

        {/* 多主动技按钮：为新原型（无代价直接发动 / 仅需目标）分别处理 */}
        {canAct &&
          activeSkills
            .filter((s) => s.effect.kind !== 'activeSteal' && s.effect.kind !== 'activeRecycle' && s.effect.kind !== 'activeSwap')
            .map((skill) => {
              const cd = me?.skillCooldowns?.get?.(skill.id) ?? me?.skillCooldowns?.[skill.id] ?? 0;
              const usesLeft = me?.skillUsesLeft?.get?.(skill.id) ?? me?.skillUsesLeft?.[skill.id] ?? 0;
              const kind = skill.effect.kind;
              const needsNoCost =
                kind === 'bananaRage' ||
                kind === 'chaosWarp' ||
                kind === 'chaosTouch' ||
                kind === 'futureRewrite' ||
                kind === 'sheepDream';
              const needsTargetOnly =
                kind === 'pigGluttony' ||
                kind === 'voyageSwap' ||
                kind === 'bigEyeExpose' ||
                kind === 'mathOp' ||
                kind === 'iceHelp' ||
                kind === 'iceLychee' ||
                kind === 'appleThrow' ||
                kind === 'butcherCleave' ||
                kind === 'driverRide' ||
                kind === 'driverLane';
              const eligibleTargets =
                kind === 'bigEyeExpose'
                  ? others.filter((p) => p.alive && (p.archives ?? 0) >= 2)
                  : kind === 'iceHelp'
                    ? others.filter(
                        (p) =>
                          p.alive &&
                          !((me?.askedHelp?.toArray?.() ?? me?.askedHelp ?? []) as string[]).includes(
                            p.sessionId,
                          ),
                      )
                    : kind === 'appleThrow'
                      ? others.filter((p) => p.alive && ((p.appleTurns ?? 0) as number) === 0)
                      : kind === 'butcherCleave'
                        ? others.filter((p) => p.alive && butcherCdOf(p.sessionId) <= 0)
                        : kind === 'driverRide'
                          ? others.filter((p) => canInviteRide(p))
                          : [];
              const aliveCount = players.filter((p) => p.alive).length;
              const boneCost = skill.effect.kind === 'butcherCleave' ? skill.effect.cost : 0;
              const bones = ((me as any)?.boneStacks ?? 0) as number;
              const disabled =
                myLocked ||
                cd > 0 ||
                (kind === 'butcherCleave' && (bones < boneCost || eligibleTargets.length === 0)) ||
                (kind === 'bananaRage' && (usesLeft <= 0 || bananaOverlay)) ||
                (kind === 'pigGluttony' && !!(me as any)?.digestion) ||
                (kind === 'bigEyeExpose' && eligibleTargets.length === 0) ||
                // 秀英：冰冻时才可求助；解冻后才可喂荔枝（每回合 1 颗）
                (kind === 'iceHelp' && (!myFrozenNow || eligibleTargets.length === 0)) ||
                (kind === 'iceLychee' && (myFrozenNow || !!me?.lycheeGiven)) ||
                (kind === 'appleThrow' && eligibleTargets.length === 0) ||
                (kind === 'driverRide' && eligibleTargets.length === 0) ||
                (kind === 'driverLane' && aliveCount < 3) ||
                (kind === 'juliaInvest' && (myPortfolioCount > 0 || investableCards.length === 0)) ||
                (kind === 'juliaCashout' && myPortfolioCount <= 0);
              const sk = skillText(skill);
              const title = myLocked
                ? t('game.sk.locked')
                : kind === 'butcherCleave' && bones < boneCost
                  ? t('game.sk.noBones', { n: bones, cost: boneCost })
                  : kind === 'butcherCleave' && eligibleTargets.length === 0
                    ? t('game.sk.allCd')
                    : kind === 'bananaRage' && bananaOverlay
                  ? t('game.sk.rageActive')
                  : kind === 'iceHelp' && !myFrozenNow
                    ? t('game.sk.helpFrozenOnly')
                    : kind === 'iceLychee' && myFrozenNow
                      ? t('game.sk.lycheeThawed')
                      : kind === 'appleThrow' && eligibleTargets.length === 0
                        ? t('game.sk.allApples')
                        : kind === 'driverRide' && eligibleTargets.length === 0
                          ? t('game.sk.noRiders')
                          : kind === 'driverLane' && aliveCount < 3
                            ? t('game.sk.laneFew')
                            : kind === 'juliaInvest' && myPortfolioCount > 0
                              ? t('game.sk.holding')
                              : kind === 'juliaInvest' && investableCards.length === 0
                                ? t('game.sk.noInvestable')
                                : kind === 'juliaCashout' && myPortfolioCount <= 0
                                  ? t('game.sk.noPosition')
                                  : sk.description;
              return (
                <button
                  key={skill.id}
                  className="action-skill"
                  disabled={disabled}
                  title={title}
                  onClick={() => {
                    if (needsNoCost) {
                      sendAct({ action: 'useSkill', skillId: skill.id });
                    } else if (needsTargetOnly) {
                      setSkillTargetPicker(skill.id);
                    } else if (kind === 'juliaInvest') {
                      setInvestOpen(true);
                    } else if (kind === 'juliaCashout') {
                      setCashoutOpen(true);
                    }
                  }}
                >
                  {sk.name}
                  {cd > 0 && <span className="skill-cooldown">CD{cd}</span>}
                  {kind === 'butcherCleave'
                    ? ` 🔪${bones}/${boneCost}`
                    : // 只有带次数上限（uses）的技能才显示剩余次数；冷却制技能同步值恒为 1，不显示
                      'uses' in skill.effect && usesLeft > 0 && ` ×${usesLeft}`}
                </button>
              );
            })}

        {/* 旧版主动技（有代价流程的） */}
        {canAct && !myLocked && activeSkill && skillUsesLeft > 0 && (
          <button className="action-skill" onClick={() => setSkillOpen(true)}>
            {myChar!.emoji} {skillText(activeSkill).name} ×{skillUsesLeft}
          </button>
        )}

        {selected.length > 0 && (
          <button className="muted action-clear" onClick={() => setSelected([])}>
            {t('game.clearSel', { n: selected.length })}
          </button>
        )}
      </div>

      {/* 手牌（自己是效果目标时顶部提示脉冲） */}
      <footer className={`handzone ${targetedId === myId && me?.alive ? 'is-targeted' : ''}`}>
        {me && !me.alive && state.phase === 'playing' && (
          <div className="spectate-note">👻 {t('game.spectateNote')}</div>
        )}
        <HandFan
          cards={fanCards}
          interactive={!!canAct && !myFrozenNow}
          selected={selected}
          playable={playable}
          onCardClick={onCardClick}
          masked={bananaOverlay}
          mustPlayIid={myMustPlay || undefined}
        />
      </footer>

      {/* 日志（默认折叠，避免遮挡右上角座位） */}
      {logOpen ? (
        <aside className="log-panel is-open">
          <button className="log-close" onClick={() => setLogOpen(false)}>
            × {t('game.collapse')}
          </button>
          {log.slice(-30).map((line, i) => (
            <div className="log-line" key={i}>{formatMsg(lang, line)}</div>
          ))}
        </aside>
      ) : (
        <button className="log-toggle" onClick={() => setLogOpen(true)} title={t('game.logT')}>
          📜 {t('game.log')}
        </button>
      )}

      {/* Toast */}
      {game.toast && <div className="toast">{game.toast.text}</div>}

      {/* 看牌堆 */}
      <Modal
        open={!!game.peek}
        title={`🔮 ${t('game.peekTitle')}`}
        onClose={() => clearPeek(game.peek!.id)}
        footer={
          <button className="primary" onClick={() => clearPeek(game.peek!.id)}>
            {t('game.gotIt')}
          </button>
        }
      >
        <div className="h-row">
          {(game.peek?.cards ?? []).map((c, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <CardView def={c} size="hand" masked={bananaOverlay} />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('game.nth', { n: i + 1 })}</div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 看手牌 */}
      <Modal
        open={!!game.peekHandInfo}
        title={`👁️ ${t('game.handOf', { name: game.peekHandInfo?.playerName ?? '' })}`}
        onClose={() => clearPeekHand(game.peekHandInfo!.id)}
      >
        <div className="h-row">
          {(game.peekHandInfo?.cards ?? []).map((c, i) => (
            <CardView key={i} def={c} size="mini" masked={bananaOverlay} />
          ))}
          {(game.peekHandInfo?.cards?.length ?? 0) === 0 && (
            <span className="muted">{t('game.noHand')}</span>
          )}
        </div>
      </Modal>

      {/* 选择目标 */}
      <Modal open={!!targetMode} title={t('game.pickTarget')}>
        <div className="h-row">
          {others
            .filter((p) => p.alive)
            .map((p) => (
              <button key={p.sessionId} className="primary" onClick={() => confirmTarget(p.sessionId)}>
                {p.name}{t('game.cardsParen', { n: p.handCount })}
              </button>
            ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => { setTargetMode(null); pendingPlay.current = null; }}>{t('game.cancel')}</button>
        </div>
      </Modal>

      {/* 拆解位置（schema 驱动；香蕉女王无真拆解时走香蕉兑换） */}
      <DefuseModal
        open={
          state.phase === 'playing' &&
          state.subPhase === 'awaiting-defuse' &&
          state.defuseBy === myId
        }
        deckCount={state.deckCount}
        bananaMode={
          game.defuseBanana &&
          iAmBanana &&
          myHand.length >= 4 &&
          !myHand.some((c) => c.def.id === 'defuse')
        }
      />

      {/* 香蕉女王：2 张香蕉兑换任意动作牌 */}
      <BananaExchangeModal
        open={bananaExchangeOpen}
        cardMap={cardMap}
        hand={myHand}
        others={others.filter((p) => p.alive)}
        initialCost={selected}
        onClose={() => setBananaExchangeOpen(false)}
      />

      {/* Future女王：命运改写 */}
      <FutureRewriteModal
        cards={game.futureRewritePrompt}
        hand={myHand}
        others={others.filter((p) => p.alive)}
      />

      {/* 重排未来 */}
      <AlterModal cards={game.alterPrompt} />

      {/* 技能面板 */}
      <Modal open={skillOpen} title={`${myChar?.emoji} ${activeSkill ? skillText(activeSkill).name : ''}`} onClose={() => setSkillOpen(false)}>
        {activeSkill && (
          <SkillDialog
            description={myCharText?.description ?? ''}
            costCards={
              (activeSkill.effect as { kind: string }).kind === 'activeSwap'
                ? 0
                : (activeSkill.effect as { costCards: number }).costCards
            }
            needsTarget={
              (activeSkill.effect as { kind: string }).kind === 'activeSteal' ||
              (activeSkill.effect as { kind: string }).kind === 'activeSwap'
            }
            needsNamed={(activeSkill.effect as { named?: boolean }).named === true}
            cardMap={cardMap}
            selected={selected}
            onToggle={toggleSelect}
            selectedCount={selected.length}
            onSubmit={(targetSessionId, wantCardId) => {
              sendAct({
                action: 'useSkill',
                skillId: activeSkill.id,
                costInstanceIds: selected,
                targetSessionId,
                wantCardId,
              });
              setSelected([]);
              setSkillOpen(false);
            }}
          />
        )}
      </Modal>

      {/* 结算 */}
      <Modal open={!!game.gameEnd}>
        {game.gameEnd && (
          <>
            <h3 style={{ marginTop: 0 }}><span className="shimmer-text">🏆 {t('game.wins', { name: game.gameEnd.winnerName })}</span></h3>
            <div style={{ lineHeight: 2.2 }}>
              {game.gameEnd.ranking.map((r) => (
                <div key={r.sessionId} className="h-row" style={{ justifyContent: 'space-between', maxWidth: 380 }}>
                  <span>
                    {t('game.place', { n: r.place })} · {r.name}
                    {r.sessionId === myId && t('game.youParen')}
                  </span>
                  {(() => {
                    const obj = game.gameEnd?.objectives?.find((o) => o.sessionId === r.sessionId);
                    return obj && obj.defName ? (
                      <span className={`tag ${obj.done ? 'obj-done-tag' : ''}`}>
                        {obj.done ? '🎯✓' : '🎯✗'} {objName(obj)}
                      </span>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
            {(() => {
              const mine = game.gameEnd?.objectives?.find((o) => o.sessionId === myId);
              return mine?.done ? (
                <p style={{ color: 'var(--gold)', fontWeight: 700, marginTop: 12 }}>
                  🎯 {t('game.objDoneScore', { name: objName(mine) })}
                </p>
              ) : null;
            })()}
            <div className="h-row" style={{ marginTop: 18 }}>
              <button className="primary" onClick={() => { clearGameEnd(); leaveRoom(); navigate('/lobby'); }}>
                {t('game.backLobby')}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* World Rule 详情 */}
      <Modal open={ruleDetailOpen} title={t('game.ruleTitle')} onClose={() => setRuleDetailOpen(false)}>
        <div className="h-row" style={{ gap: 16 }}>
          <span style={{ fontSize: 52 }}>{state.worldRuleEmoji}</span>
          <div>
            <h3 style={{ margin: '0 0 6px' }}>{ruleName}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{ruleDesc}</p>
          </div>
        </div>
      </Modal>

      {/* 我的秘密任务 */}
      <Modal open={objOpen && !!game.myObjective} title={`🎯 ${t('game.myObj')}`} onClose={() => setObjOpen(false)}>
        {game.myObjective && (
          <div>
            <h3 style={{ margin: '0 0 6px' }}>{objName(game.myObjective)}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {objectiveText(game.myObjective.defId, lang)?.description ?? game.myObjective.description}
              {game.myObjective.targetName && (
                <>
                  <br />
                  {t('game.objTarget')}<strong>{game.myObjective.targetName}</strong>
                </>
              )}
            </p>
            {game.objectiveDone && (
              <p style={{ color: 'var(--gold)', fontWeight: 700, marginTop: 10 }}>
                ✅ {t('game.objDone')}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* 无尽挑战：胜局三选一增益 */}
      <Modal open={!!bonusChoices} title={`🔥 ${t('game.pickBonus')}`}>
        <div className="h-row" style={{ gap: 14 }}>
          {(bonusChoices ?? []).map((id) => {
            const def = RUN_BONUS_MAP.get(id);
            if (!def) return null;
            const bt = runBonusText(id, lang) ?? def;
            return (
              <div
                key={id}
                className="char-card"
                style={{ minWidth: 170, cursor: 'pointer' }}
                onClick={async () => {
                  setBonusChoices(null);
                  clearGameEnd();
                  leaveRoom();
                  await advanceStage(id as never);
                  navigate('/game');
                }}
              >
                <span style={{ fontSize: 34 }}>{def.emoji}</span>
                <h4 style={{ margin: '8px 0 2px' }}>{bt.name}</h4>
                <p style={{ margin: 0 }}>{bt.description}</p>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => {
              setBonusChoices(null);
              clearGameEnd();
              leaveRoom();
              const summary = endRun();
              alert(t('game.runOver', { stage: summary.stage, best: summary.best }));
              navigate('/lobby');
            }}
          >
            {t('game.endRun')}
          </button>
        </div>
      </Modal>

      {/* 眼泪选择弹窗 */}
      <Modal open={!!game.tearPrompt} title={`💧 ${t('game.tearTitle')}`}>
        {game.tearPrompt && (
          <div>
            <p className="muted" style={{ fontSize: 14 }}>
              {t('game.tearBody', { name: game.tearPrompt.nanaName })}
            </p>
            <div className="h-row" style={{ gap: 14, marginTop: 16 }}>
              <div
                className="tear-choice-card"
                onClick={() => {
                  const firstCard = myHand.find(
                    (c) => c.def.kind === 'action' || c.def.kind === 'plain',
                  );
                  if (firstCard) {
                    sendTearChoice(true, firstCard.instanceId);
                  }
                }}
              >
                <span className="tear-emoji">💧❤️</span>
                <strong>{t('game.tearFeed')}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {t('game.tearFeedSub')}
                </span>
              </div>
              <div className="tear-choice-card" onClick={() => sendTearChoice(false)}>
                <span className="tear-emoji">🚫</span>
                <strong>{t('game.tearRefuse')}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {t('game.tearRefuseSub')}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {/* 主动技目标选择（吞噬/Voyage 交换/揭发等） */}
      <Modal open={!!skillTargetPicker} title={t('game.pickTarget')} onClose={() => setSkillTargetPicker(null)}>
        <div className="h-row">
          {(skillTargetPicker === 'driver-lane' ? laneOrder : others)
            .filter(
              (p) =>
                p.alive &&
                (skillTargetPicker !== 'driver-ride' || canInviteRide(p)) &&
                (skillTargetPicker !== 'bigeye-expose' || (p.archives ?? 0) >= 2) &&
                // 屠夫剔骨：冷却中的目标不列出
                !(skillTargetPicker === 'butcher-skill' && butcherCdOf(p.sessionId) > 0) &&
                // 秀英求助：本回合问过的玩家不再列出
                !(
                  activeSkills.find((s) => s.id === skillTargetPicker)?.effect.kind === 'iceHelp' &&
                  ((me?.askedHelp?.toArray?.() ?? me?.askedHelp ?? []) as string[]).includes(
                    p.sessionId,
                  )
                ),
            )
            .map((p) => (
              <button
                key={p.sessionId}
                className="primary"
                onClick={() => {
                  const picked = skillTargetPicker!;
                  const kind = activeSkills.find((s) => s.id === picked)?.effect.kind;
                  setSkillTargetPicker(null);
                  if (kind === 'voyageSwap') {
                    // Voyage：两步弹窗——选完目标再选自己要交出的 3 张牌
                    setVoyageGive({ skillId: picked, targetSessionId: p.sessionId, targetName: p.name });
                    return;
                  }
                  sendAct({
                    action: 'useSkill',
                    skillId: picked,
                    targetSessionId: p.sessionId,
                  });
                }}
              >
                {skillTargetPicker === 'driver-lane'
                  ? `${p.name} ⇄ ${laneNextOf(p.sessionId)?.name ?? '?'}`
                  : <>{p.name}{t('game.lp')}{t('game.cardsN', { n: p.handCount })}</>}
                {skillTargetPicker === 'driver-lane' ? null : <>
                {skillTargetPicker === 'bigeye-expose' ? ` · 👁${t('game.b.archive')} ${p.archives ?? 0}` : ''}
                {skillTargetPicker === 'butcher-skill' && (p.freezeLayers ?? 0) > 0 ? ` · ❄️${t('game.frozenImmune')}` : ''}{t('game.rp')}</>}
              </button>
            ))}
          {skillTargetPicker === 'bigeye-expose' &&
            others.every((p) => !p.alive || (p.archives ?? 0) < 2) && (
              <span className="muted">{t('game.noArchive2')}</span>
            )}
          {activeSkills.find((s) => s.id === skillTargetPicker)?.effect.kind === 'iceHelp' &&
            others.every(
              (p) =>
                !p.alive ||
                ((me?.askedHelp?.toArray?.() ?? me?.askedHelp ?? []) as string[]).includes(
                  p.sessionId,
                ),
            ) && <span className="muted">{t('game.askedAll')}</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setSkillTargetPicker(null)}>{t('game.cancel')}</button>
        </div>
      </Modal>

      {/* 大眼Nana：揭发展示 */}
      <ExposeModal info={game.exposePrompt} />

      {/* 秀英求助：被求助者回应弹窗 */}
      <HelpRequestModal
        info={game.helpPrompt}
        hand={myHand}
        onClose={() => sendHelpRespond(false)}
      />

      {/* 邪恶苹果头：吃苹果弹窗 */}
      <AppleEatModal
        open={appleEatOpen}
        hand={myHand}
        masked={bananaOverlay}
        onClose={() => setAppleEatOpen(false)}
      />

      {/* 秀英：等待回应提示 */}
      {helpWaiting && (
        <div className="help-waiting">🧊 {t('game.helpWaiting', { name: others.find((p) => p.sessionId === state.helpPendingBy)?.name ?? t('game.opponent') })}</div>
      )}

      {/* 懒懒羊：等待对方挑选梦境牌 */}
      {dreamWaitingName && (
        <div className="help-waiting is-dream">💤 {t('game.dreamWaiting', { name: dreamWaitingName })}</div>
      )}

      {/* Julia：建仓 */}
      <InvestModal
        open={investOpen && !!canAct}
        hand={myHand}
        maxCards={investEffect?.maxCards ?? 3}
        holdTurns={investEffect?.holdTurns ?? 2}
        skillId={investSkill?.id ?? 'julia-invest'}
        masked={bananaOverlay}
        onClose={() => setInvestOpen(false)}
      />

      {/* Julia：平仓确认（同时展示持仓内容） */}
      <Modal open={cashoutOpen && !!canAct && myPortfolioCount > 0} title={`💼 ${t('game.cashoutTitle')}`} onClose={() => setCashoutOpen(false)}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t('game.cashoutBody')}</p>
        <PortfolioCards cards={game.portfolio} market={myMarket} />
        <div className="h-row" style={{ marginTop: 16 }}>
          <button
            className="primary"
            onClick={() => {
              sendAct({ action: 'useSkill', skillId: 'julia-cashout' });
              setCashoutOpen(false);
            }}
          >
            💼 {t('game.cashoutConfirm')}
          </button>
          <button onClick={() => setCashoutOpen(false)}>{t('game.thinkAgain')}</button>
        </div>
      </Modal>

      {/* Julia：查看我的持仓 */}
      <Modal
        open={portfolioOpen && myPortfolioCount > 0}
        title={`💼 ${t('game.portfolioTitle')}`}
        onClose={() => setPortfolioOpen(false)}
        footer={
          <button className="primary" onClick={() => setPortfolioOpen(false)}>
            {t('game.gotIt')}
          </button>
        }
      >
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t('game.b.marketT')}</p>
        <PortfolioCards cards={game.portfolio} market={myMarket} />
      </Modal>

      {/* 懒懒羊：醒来挑梦境牌 */}
      <DreamPickModal
        info={game.dreamPrompt}
        targets={others.filter((p) => p.alive)}
      />

      {/* 预知梦：牌堆顶爆炸位置 */}
      <BombSenseModal info={game.bombSense} />

      {/* Voyage：换牌第二步——选自己要交出的 3 张牌 */}
      <VoyageGiveModal
        info={voyageGive}
        hand={myHand}
        masked={bananaOverlay}
        onClose={() => setVoyageGive(null)}
      />
    </div>
  );
}

/* ---------------- 子组件 ---------------- */

/** Julia：持仓内容（仅本人可见） */
function PortfolioCards({ cards, market }: { cards: CardDef[]; market: number }) {
  const { t } = useI18n();
  return (
    <div>
      <div className={`market-chip ${marketTone(market)}`} style={{ marginBottom: 10 }}>
        📈 {t('game.marketNow', { n: fmtSigned(market) })}
      </div>
      <div className="h-row" style={{ flexWrap: 'wrap' }}>
        {cards.map((c, i) => (
          <CardView key={i} def={c} size="mini" />
        ))}
        {cards.length === 0 && <span className="muted">{t('game.portfolioEmpty')}</span>}
      </div>
    </div>
  );
}

/** Julia：建仓（选 1~maxCards 张可投资手牌） */
function InvestModal({
  open,
  hand,
  maxCards,
  holdTurns,
  skillId,
  masked,
  onClose,
}: {
  open: boolean;
  hand: HandCard[];
  maxCards: number;
  holdTurns: number;
  skillId: string;
  masked?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    setPicked([]);
  }, [open]);
  const eligible = (c: HandCard) =>
    c.def.kind !== 'exploding' && c.def.kind !== 'streaking' && c.def.kind !== 'tear';
  const toggle = (iid: string) =>
    setPicked((prev) =>
      prev.includes(iid) ? prev.filter((x) => x !== iid) : prev.length >= maxCards ? prev : [...prev, iid],
    );
  return (
    <Modal open={open} title={`💼 ${t('game.investTitle', { max: maxCards })}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        {t('game.investBody', { turns: holdTurns })}
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {t('game.investPicked', { n: picked.length, max: maxCards })}
      </p>
      <div className="h-row invest-pick" style={{ flexWrap: 'wrap', maxHeight: 260, overflowY: 'auto' }}>
        {hand.map((c) => {
          const ok = eligible(c);
          return (
            <CardView
              key={c.instanceId}
              def={c.def}
              size="mini"
              masked={masked}
              selected={picked.includes(c.instanceId)}
              onClick={ok ? () => toggle(c.instanceId) : undefined}
              style={ok ? undefined : { opacity: 0.35, filter: 'grayscale(0.8)', cursor: 'not-allowed' }}
            />
          );
        })}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={picked.length < 1 || picked.length > maxCards}
          onClick={() => {
            sendAct({ action: 'useSkill', skillId, investInstanceIds: picked });
            onClose();
          }}
        >
          💼 {t('game.investConfirm')}
        </button>
        <button onClick={onClose}>{t('game.cancel')}</button>
      </div>
    </Modal>
  );
}

/** 懒懒羊：醒来从梦境牌中选 1 张（收下 / 送人） */
function DreamPickModal({
  info,
  targets,
}: {
  info: { id: number; options: CardDef[] } | null;
  targets: any[];
}) {
  const { t, lang } = useI18n();
  const [pick, setPick] = useState<number | null>(null);
  const [giving, setGiving] = useState(false);
  useEffect(() => {
    setPick(null);
    setGiving(false);
  }, [info?.id]);
  const chosen = pick !== null ? info?.options[pick] : undefined;
  const chosenText = chosen ? cardText(chosen, lang) : null;
  return (
    <Modal open={!!info} title={`💤 ${t('game.dreamTitle')}`}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t('game.dreamBody')}</p>
      <div className="h-row dream-options" style={{ justifyContent: 'center', gap: 18 }}>
        {(info?.options ?? []).map((c, i) => (
          <CardView
            key={i}
            def={c}
            size="hand"
            selected={pick === i}
            glow={pick === null}
            onClick={() => {
              setPick(i);
              setGiving(false);
            }}
          />
        ))}
      </div>
      <p className="dream-desc">
        {chosen && chosenText ? (
          <>
            <strong>
              {chosen.emoji} {chosenText.name}
            </strong>
            {lang === 'zh' ? '：' : ': '}
            {chosenText.description}
          </>
        ) : (
          <span className="muted">{t('game.dreamPickFirst')}</span>
        )}
      </p>
      <div className="h-row" style={{ marginTop: 14 }}>
        <button
          className="primary"
          disabled={!chosen}
          onClick={() => chosen && sendDreamPick(chosen.id)}
        >
          🛏️ {t('game.dreamKeep')}
        </button>
        <button
          disabled={!chosen || targets.length === 0}
          className={giving ? 'is-on' : ''}
          onClick={() => setGiving((v) => !v)}
        >
          🎁 {t('game.dreamGive')}
        </button>
      </div>
      {giving && chosen && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t('game.dreamGiveTo')}</div>
          <div className="h-row" style={{ flexWrap: 'wrap' }}>
            {targets.map((p) => (
              <button key={p.sessionId} className="primary" onClick={() => sendDreamPick(chosen.id, p.sessionId)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** 预知梦：牌堆顶 checked 张里爆炸牌的位置 */
function BombSenseModal({ info }: { info: { id: number; positions: number[]; checked: number } | null }) {
  const { t } = useI18n();
  const n = info?.checked ?? 5;
  return (
    <Modal
      open={!!info}
      title={`🔮 ${t('game.senseTitle')}`}
      onClose={() => info && clearBombSense(info.id)}
      footer={
        <button className="primary" onClick={() => info && clearBombSense(info.id)}>
          {t('game.gotIt')}
        </button>
      }
    >
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        {(info?.positions.length ?? 0) > 0 ? t('game.senseBody', { n }) : t('game.senseNone', { n })}
      </p>
      <div className="sense-slots">
        {Array.from({ length: n }, (_, i) => {
          const bomb = !!info?.positions.includes(i + 1);
          return (
            <div key={i} className={`sense-slot ${bomb ? 'is-bomb' : ''}`}>
              <span className="sense-no">{i + 1}</span>
              <span className="sense-icon">{bomb ? '💣' : '·'}</span>
              <span className="sense-label">{bomb ? t('game.senseBomb') : t('game.senseSafe')}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** 邪恶苹果头：吃掉身上的邪恶苹果（选一张手牌交给投掷者） */
function AppleEatModal({
  open,
  hand,
  masked,
  onClose,
}: {
  open: boolean;
  hand: HandCard[];
  masked?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [giveId, setGiveId] = useState<string | null>(null);
  useEffect(() => {
    setGiveId(null);
  }, [open]);
  return (
    <Modal open={open} title={`🍏 ${t('game.eatApple')}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('game.appleBody')}
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {t('game.pickGive')}{giveId ? t('game.picked1') : ''}{t('game.colon')}
      </p>
      <div className="h-row" style={{ flexWrap: 'wrap', maxHeight: 220, overflowY: 'auto' }}>
        {hand.map((c) => (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            masked={masked}
            selected={giveId === c.instanceId}
            onClick={() => setGiveId(giveId === c.instanceId ? null : c.instanceId)}
          />
        ))}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={!giveId}
          onClick={() => {
            if (giveId) sendAppleEat(giveId);
            onClose();
          }}
        >
          🍏 {t('game.appleConfirm')}
        </button>
        <button onClick={onClose}>{t('game.thinkAgain')}</button>
      </div>
    </Modal>
  );
}

/** 秀英求助：被求助者选择是否帮助（同意需交出一张手牌） */
function HelpRequestModal({
  info,
  hand,
  onClose,
}: {
  info: { id: number; fromName: string; kind: 'help' | 'ride' } | null;
  hand: HandCard[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [giveId, setGiveId] = useState<string | null>(null);
  useEffect(() => {
    setGiveId(null);
  }, [info?.id]);
  return (
    <Modal
      open={!!info}
      title={
        info?.kind === 'ride'
          ? `🚕 ${t('game.rideTitle', { name: info?.fromName ?? '' })}`
          : `🧊 ${t('game.helpTitle', { name: info?.fromName ?? '' })}`
      }
      onClose={onClose}
    >
      <p className="muted" style={{ fontSize: 13 }}>
        {info?.kind === 'ride' ? t('game.rideBody') : t('game.helpBody')}
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {t('game.pickGive')}{giveId ? t('game.picked1') : t('game.requiredIfAgree')}{t('game.colon')}
      </p>
      <div className="h-row" style={{ flexWrap: 'wrap', maxHeight: 220, overflowY: 'auto' }}>
        {hand.map((c) => (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            selected={giveId === c.instanceId}
            onClick={() => setGiveId(giveId === c.instanceId ? null : c.instanceId)}
          />
        ))}
        {hand.length === 0 && <span className="muted">{t('game.noHandRefuse')}</span>}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={!giveId}
          onClick={() => sendHelpRespond(true, giveId!)}
        >
          {info?.kind === 'ride' ? `🚕 ${t('game.rideAgree')}` : `🤝 ${t('game.helpAgree')}`}
        </button>
        <button onClick={onClose}>🙅 {t('game.tearRefuse')}</button>
      </div>
    </Modal>
  );
}

/** Voyage：选自己要交出的 3 张手牌（对方随机 3 张） */
function VoyageGiveModal({
  info,
  hand,
  masked,
  onClose,
}: {
  info: { skillId: string; targetSessionId: string; targetName: string } | null;
  hand: HandCard[];
  masked?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [give, setGive] = useState<string[]>([]);
  const open = !!info;
  useEffect(() => {
    setGive([]);
  }, [info]);
  const toggle = (iid: string) =>
    setGive((prev) =>
      prev.includes(iid) ? prev.filter((x) => x !== iid) : prev.length >= 3 ? prev : [...prev, iid],
    );
  return (
    <Modal open={open} title={`⚓ ${t('game.voyageTitle', { name: info?.targetName ?? '' })}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('game.voyageBody', { n: give.length })}
      </p>
      <div className="h-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
        {hand.map((c) => (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            masked={masked}
            selected={give.includes(c.instanceId)}
            onClick={() => toggle(c.instanceId)}
          />
        ))}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={give.length !== 3 || hand.length < 3}
          onClick={() => {
            if (!info) return;
            sendAct({
              action: 'useSkill',
              skillId: info.skillId,
              targetSessionId: info.targetSessionId,
              costInstanceIds: give,
            });
            onClose();
          }}
        >
          ⚓ {t('game.voyageConfirm')}
        </button>
        <button onClick={onClose}>{t('game.cancel')}</button>
      </div>
    </Modal>
  );
}

/** 自计时 hook：仅在组件挂载期间每 250ms 触发（避免整页定时器） */
function useTick(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** 行动条上的回合倒计时角标 */
function TurnCountBadge({ endsAt }: { endsAt: number }) {
  const now = useTick();
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className={`turn-count ${sec <= 10 ? 'is-urgent' : ''}`}>{sec}</span>;
}

/** 否认窗口倒计时 */
function NopeCountBadge({ endsAt }: { endsAt: number }) {
  const now = useTick();
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className="nope-count">{sec}</span>;
}

/** 最后 10 秒红色警示（自计时，只在需要时挂载） */
function TurnVignette({ endsAt }: { endsAt: number }) {
  const now = useTick();
  const sec = Math.ceil((endsAt - now) / 1000);
  if (sec > 10) return null;
  return <div className="turn-vignette" />;
}

function NamedComboButton({
  cardMap,
  onPick,
}: {
  cardMap: Map<string, CardDef>;
  onPick: (cardId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const cards = [...cardMap.values()].filter((c) => c.kind !== 'exploding');
  return (
    <>
      <button className="action-combo" onClick={() => setOpen(true)}>
        {t('game.tripleSteal')}
      </button>
      <Modal open={open} title={t('game.nameCard')} onClose={() => setOpen(false)}>
        <div className="h-row" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {cards.map((c) => (
            <div key={c.id} style={{ textAlign: 'center' }}>
              <CardView def={c} size="mini" onClick={() => { setOpen(false); onPick(c.id); }} />
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function DefuseModal({
  open,
  deckCount,
  bananaMode,
}: {
  open: boolean;
  deckCount: number;
  bananaMode?: boolean;
}) {
  const { t } = useI18n();
  const [pos, setPos] = useState(0);
  const [cost, setCost] = useState<string[]>([]);
  useEffect(() => {
    setPos(0);
    setCost([]);
  }, [open]);
  if (bananaMode) {
    return (
      <Modal open={open} title={`🍌 ${t('game.bananaDefuseTitle')}`}>
        <p className="muted" style={{ fontSize: 13 }}>
          {t('game.bananaDefuseBody', { n: cost.length })}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          {t('game.defusePosA')} <strong style={{ color: 'var(--gold)', fontSize: 18 }}>{pos}</strong> {t('game.defusePosB')}
        </p>
        <input
          type="range"
          min={0}
          max={deckCount}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <BananaCostPicker count={4} cost={cost} setCost={setCost} />
        <div className="h-row" style={{ marginTop: 16 }}>
          <button
            className="primary"
            disabled={cost.length !== 4}
            onClick={() => sendBananaSubstitute('defuse', cost, { position: pos })}
          >
            🍌 {t('game.bananaDefuseBtn')}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={open} title={`🔧 ${t('game.defuseTitle')}`}>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('game.defusePosA')} <strong style={{ color: 'var(--gold)', fontSize: 18 }}>{pos}</strong> {t('game.defusePosC', { n: deckCount })}
      </p>
      <input
        type="range"
        min={0}
        max={deckCount}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div className="h-row" style={{ marginTop: 16 }}>
        <button className="primary" onClick={() => sendAct({ action: 'defusePosition', position: pos })}>
          {t('game.putBack')}
        </button>
      </div>
    </Modal>
  );
}

/** 香蕉代价多选器（小卡片行，点选 N 张） */
function BananaCostPicker({
  count,
  cost,
  setCost,
}: {
  count: number;
  cost: string[];
  setCost: (v: string[]) => void;
}) {
  const game = useGame();
  return (
    <div className="h-row" style={{ marginTop: 12, maxHeight: 200, overflowY: 'auto' }}>
      {game.hand.map((c) => {
        const idx = cost.indexOf(c.instanceId);
        return (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            masked
            selected={idx >= 0}
            onClick={() =>
              setCost(
                idx >= 0
                  ? cost.filter((x) => x !== c.instanceId)
                  : cost.length >= count
                    ? cost
                    : [...cost, c.instanceId],
              )
            }
          />
        );
      })}
    </div>
  );
}

/** 香蕉女王：2 张香蕉兑换任意动作牌并立即打出 */
function BananaExchangeModal({
  open,
  cardMap,
  hand,
  others,
  initialCost,
  onClose,
}: {
  open: boolean;
  cardMap: Map<string, CardDef>;
  hand: HandCard[];
  others: any[];
  /** 打开时带入的手牌区已选牌（作为兑换代价） */
  initialCost?: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const COST = 2;
  const [cost, setCost] = useState<string[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  useEffect(() => {
    // 带入手牌区已选中的牌（最多 COST 张）
    const pre = (initialCost ?? []).filter((iid) => hand.some((c) => c.instanceId === iid));
    setCost(pre.slice(0, COST));
    setCardId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const def = cardId ? cardMap.get(cardId) : null;
  const needsTarget = !!def && cardNeedsTarget(def);
  const actionCards = [...cardMap.values()].filter(
    (c) => c.kind === 'action' && c.id !== 'nope',
  );
  return (
    <Modal open={open} title={`🍌 ${t('game.bxTitle')}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('game.bxStep1', { n: cost.length, cost: COST })}
      </p>
      <BananaCostPicker count={COST} cost={cost} setCost={setCost} />
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
        {t('game.bxStep2')}
      </p>
      <div className="h-row" style={{ maxHeight: 240, overflowY: 'auto' }}>
        {actionCards.map((c) => (
          <CardView
            key={c.id}
            def={c}
            size="mini"
            selected={cardId === c.id}
            onClick={() => setCardId(c.id)}
          />
        ))}
      </div>
      {!needsTarget ? (
        <div className="h-row" style={{ marginTop: 16 }}>
          <button
            className="primary"
            disabled={cost.length !== COST || !cardId}
            onClick={() => {
              sendBananaSubstitute('action', cost, { cardId: cardId! });
              onClose();
            }}
          >
            🍌 {t('game.bxBtn')}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('game.bxNeedsTarget')}
          </p>
          <div className="h-row">
            {others.map((p) => (
              <button
                key={p.sessionId}
                className="primary"
                disabled={cost.length !== COST || !cardId}
                onClick={() => {
                  sendBananaSubstitute('action', cost, {
                    cardId: cardId!,
                    targetSessionId: p.sessionId,
                  });
                  onClose();
                }}
              >
                {p.name}{t('game.cardsParen', { n: p.handCount })}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {t('game.bxFoot', { n: hand.length })}
      </p>
    </Modal>
  );
}
/** 大眼Nana：揭发展示目标牌面（view 关闭即结束；discard/steal 点选一张提交） */
function ExposeModal({
  info,
}: {
  info: GameSnapshot['exposePrompt'];
}) {
  const { t } = useI18n();
  if (!info) return null;
  const pick = info.mode !== 'view';
  return (
    <Modal
      open
      title={`👀 ${t('game.exposeTitle', { name: info.targetName })}`}
      onClose={() => clearExposePrompt()}
    >
      <p className="muted" style={{ fontSize: 13 }}>
        {info.mode === 'view'
          ? t('game.exposeView', { name: info.targetName })
          : info.mode === 'discard'
            ? t('game.exposeDiscard', { name: info.targetName })
            : t('game.exposeSteal')}
      </p>
      <div className="h-row" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {info.cards.map((c) => (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            onClick={pick ? () => sendExposePick(c.instanceId) : undefined}
          />
        ))}
        {info.cards.length === 0 && <span className="muted">{t('game.noHand')}</span>}
      </div>
      {info.mode === 'view' && (
        <div className="h-row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => clearExposePrompt()}>
            {t('game.gotIt')}
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Future女王：命运改写（选激活 + 手牌替换 + 排序放回） */
function FutureRewriteModal({
  cards,
  hand,
  others,
}: {
  cards: CardDef[] | null;
  hand: HandCard[];
  others: any[];
}) {
  const { t, lang } = useI18n();
  const [activateIdx, setActivateIdx] = useState<number | null>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  useEffect(() => {
    setActivateIdx(null);
    setSwapId(null);
    setOrder([]);
    setTargetId(null);
  }, [cards]);
  if (!cards) return null;
  const n = cards.length;
  const activated = activateIdx != null ? cards[activateIdx] : null;
  const needsTarget = !!activated && cardNeedsTarget(activated);
  // 候选 = 未激活的 (n-1) 张 + 交换手牌（索引 n-1）
  const candidates = cards.filter((_, i) => i !== activateIdx);
  const ready =
    activateIdx != null &&
    swapId != null &&
    order.length === n &&
    (!needsTarget || !!targetId);
  const submit = () => {
    sendFutureRewritePick({
      activateIdx: activateIdx!,
      swapInstanceId: swapId!,
      order,
      targetSessionId: targetId ?? undefined,
    });
  };
  return (
    <Modal open title={`🌠 ${t('game.frTitle')}`} onClose={() => clearFutureRewritePrompt()}>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('game.frStep1')}
      </p>
      <div className="h-row">
        {cards.map((c, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <CardView
              def={c}
              size="mini"
              selected={activateIdx === i}
              onClick={() => {
                setActivateIdx(i);
                setOrder([]);
                setTargetId(null);
              }}
            />
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        {t('game.frStep2')}
      </p>
      <div className="h-row" style={{ maxHeight: 180, overflowY: 'auto' }}>
        {hand.map((c) => (
          <CardView
            key={c.instanceId}
            def={c.def}
            size="mini"
            selected={swapId === c.instanceId}
            onClick={() => {
              setSwapId(c.instanceId);
              setOrder([]);
            }}
          />
        ))}
      </div>
      {activateIdx != null && swapId != null && (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {t('game.frStep3', { n: order.length, total: n })}
          </p>
          <div className="h-row">
            {candidates.map((c, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <CardView
                  def={c}
                  size="mini"
                  selected={order.includes(i)}
                  onClick={() =>
                    setOrder((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                    )
                  }
                />
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {order.includes(i) ? t('game.slotN', { n: order.indexOf(i) + 1 }) : ''}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'center' }}>
              <CardView
                def={hand.find((c) => c.instanceId === swapId)?.def}
                size="mini"
                selected={order.includes(candidates.length)}
                onClick={() =>
                  setOrder((prev) =>
                    prev.includes(candidates.length)
                      ? prev.filter((x) => x !== candidates.length)
                      : [...prev, candidates.length],
                  )
                }
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                🖐 {t('game.frSwapCard')}
              </div>
            </div>
          </div>
        </>
      )}
      {needsTarget && activated && (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {t('game.frNeedsTarget', { name: cardText(activated, lang).name })}
          </p>
          <div className="h-row">
            {others.map((p) => (
              <button
                key={p.sessionId}
                className={targetId === p.sessionId ? 'primary' : ''}
                onClick={() => setTargetId(p.sessionId)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="h-row" style={{ marginTop: 16 }}>
        <button className="primary" disabled={!ready} onClick={submit}>
          {t('game.frBtn')}
        </button>
        <button onClick={() => clearFutureRewritePrompt()}>{t('game.frGiveUp')}</button>
      </div>
    </Modal>
  );
}

function AlterModal({ cards }: { cards: CardDef[] | null }) {
  const { t } = useI18n();
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder([]), [cards]);
  if (!cards) return null;
  return (
    <Modal open title={`👁️‍🗨️ ${t('game.alterTitle')}`}>
      <div className="h-row">
        {cards.map((c, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <CardView
              def={c}
              size="hand"
              selected={order.includes(i)}
              onClick={() =>
                setOrder((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
              }
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {order.includes(i) ? t('game.slotN', { n: order.indexOf(i) + 1 }) : t('game.unplaced')}
            </div>
          </div>
        ))}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={order.length !== cards.length}
          onClick={() => sendAct({ action: 'alterFuture', order })}
        >
          {t('game.confirm')}
        </button>
        {order.length > 0 && <button onClick={() => setOrder([])}>{t('game.reset')}</button>}
      </div>
    </Modal>
  );
}

function SkillDialog({
  description,
  costCards,
  needsTarget,
  needsNamed,
  cardMap,
  selected,
  onToggle,
  selectedCount,
  onSubmit,
}: {
  description: string;
  costCards: number;
  needsTarget: boolean;
  needsNamed: boolean;
  cardMap: Map<string, CardDef>;
  selected: string[];
  onToggle: (iid: string) => void;
  selectedCount: number;
  onSubmit: (targetSessionId?: string, wantCardId?: string) => void;
}) {
  const { t, lang } = useI18n();
  const [target, setTarget] = useState<string | undefined>();
  const [want, setWant] = useState<string | undefined>();
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{description}</p>
      {costCards > 0 && (
        <p style={{ fontSize: 13 }}>
          {t('game.sdStep1', { n: costCards, sel: selectedCount })}
        </p>
      )}
      {needsTarget && (
        <>
          <p style={{ fontSize: 13 }}>{t('game.sdStep2')}</p>
          <TargetPickerInline onPick={setTarget} picked={target} />
        </>
      )}
      {needsNamed && (
        <>
          <p style={{ fontSize: 13 }}>{t('game.sdStep3')}</p>
          <select value={want ?? ''} onChange={(e) => setWant(e.target.value)}>
            <option value="">{t('game.pickCardName')}</option>
            {[...cardMap.values()]
              .filter((c) => c.kind !== 'exploding')
              .map((c) => (
                <option key={c.id} value={c.id}>{cardText(c, lang).name}</option>
              ))}
          </select>
        </>
      )}
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={selectedCount !== costCards || (needsTarget && !target) || (needsNamed && !want)}
          onClick={() => onSubmit(target, want)}
        >
          {t('game.useSkill')}
        </button>
      </div>
    </div>
  );
}

function TargetPickerInline({
  onPick,
  picked,
}: {
  onPick: (sessionId: string) => void;
  picked?: string;
}) {
  const game = useGame();
  const { t } = useI18n();
  const state = game.state;
  const myId = game.room?.sessionId ?? '';
  const list: any[] = [];
  eachPlayer(state, (p: any) => {
    if (p.sessionId !== myId && p.alive) list.push(p);
  });
  return (
    <div className="h-row">
      {list.map((p) => (
        <button
          key={p.sessionId}
          className={picked === p.sessionId ? 'primary' : ''}
          onClick={() => onPick(p.sessionId)}
        >
          {p.name}{t('game.cardsParen', { n: p.handCount })}
        </button>
      ))}
    </div>
  );
}
