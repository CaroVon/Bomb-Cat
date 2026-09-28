import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BUILTIN_CHARACTERS, RUN_BONUS_MAP, type CardDef, type HandCard } from '@bombcat/shared';
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
import { TableSeat, getSeatPositions, type TableSeatData } from '../components/table/TableSeat';
import { CHARACTER_RPG } from '@bombcat/shared';
import { HandFan, type FanCard } from '../components/table/HandFan';
import { Stage, type StageShow } from '../components/table/Stage';
import { DiscardPile, DrawPile } from '../components/table/Piles';
import { BoomBanner, FlashOverlay, TurnBanner } from '../components/table/Effects';

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

export default function GamePage() {
  const game = useGame();
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
    if (text.includes('果奔猫生效') || text.includes('铁壁') || text.includes('回响')) {
      setSkillFlash({ id: Date.now(), text: text.split('。')[0] ?? text });
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
            window.alert(`🔥 无尽挑战结束：到达第 ${summary.stage} 关（历史最佳 ${summary.best} 关）`);
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
      setBanner({ text: gold ? '你的回合' : `${name} 的回合`, gold });
      if (gold) sfx('turn');
      const t = setTimeout(() => setBanner(null), animMs(1500));
      return () => clearTimeout(t);
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

  /* ---------------- 派生数据（非 hook 部分） ---------------- */

  if (!state || !room) {
    return (
      <div className="page">
        <p className="muted">连接中……</p>
      </div>
    );
  }

  const me = players.find((p) => p.sessionId === myId);
  const others = players.filter((p) => p.sessionId !== myId);
  const isMyTurn = currentId === myId && state.phase === 'playing';
  const canAct = isMyTurn && state.subPhase === 'awaiting-action' && me?.alive;

  const myHand: HandCard[] = game.hand;
  const myChar = BUILTIN_CHARACTERS.find((c) => c.id === me?.characterId);
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
    if (!canAct) return set;
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
    state.nopeActive && !!myNope && state.nopePlayBy !== myId && nopedBy[nopedBy.length - 1] !== myId && me?.alive;

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

  // 香蕉女王的兑换入口（覆盖期间 2 张手牌 = 任意技能牌）
  const canBananaAction =
    canAct && bananaOverlay && iAmBanana && myHand.length >= 2 && !me?.mustPlayIid;
  // 秀英：冰冻状态（本回合被帮助过则可正常行动）
  const iAmXiuying = me?.characterId === 'xiuying';
  const myFrozenNow = !!me?.freezeLayers && me.freezeLayers > 0 && !me.helpedThisTurn;
  const helpWaiting = state.helpOwnerId === myId && !!state.helpPendingBy;
  // 猪王：必须先处理消化牌
  const myMustPlay = (me?.mustPlayIid as string) || '';

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
          🍌 大香蕉之怒！剩 {state.bananaOverlayTurns} 轮（所有存活玩家各行动一次）
          <span className="banana-banner-sub">
            {iAmBanana ? '点手牌仅选中 · 2 张=技能牌 / 4 张=拆解' : '手牌已洗乱 · 只能盲打单牌'}
          </span>
        </div>
      )}
      {/* 混沌之触提示 */}
      {state.chaosDrawsActive && (
        <div className="chaos-active-indicator">🌀 混沌之触：摸牌变为夺取</div>
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
        {others.map((p, idx) => {
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
            <span className="my-char-name">{myChar?.name ?? '路人'}</span>
            <span className="my-char-player">{me.name}</span>
            {!me.alive && <span className="my-char-dead">💀 出局</span>}
            {!!me.digestionTurns && me.digestionTurns > 0 && (
              <span className="seat-status-badge is-digest" title="消化中（剩余回合）">
                🐷 消化中 ×{me.digestionTurns}
              </span>
            )}
            {!!me.fullTurns && me.fullTurns > 0 && (
              <span className="seat-status-badge is-full" title="饱腹中：不能摸牌，结束回合跳过摸牌">
                🥱 饱腹 ×{me.fullTurns}
              </span>
            )}
            {myMustPlay && (
              <span className="seat-status-badge is-must" title="必须先打出或丢弃这张消化牌">
                ⚠️ 必须打出消化牌
              </span>
            )}
            {!!me.archives && me.archives > 0 && (
              <span className="seat-status-badge is-archive" title="档案：你正在被大眼Nana监视">
                👁档案 {me.archives}
              </span>
            )}
            {!!me.freezeLayers && me.freezeLayers > 0 && (
              <span className="seat-status-badge is-frozen" title="冰冻中：无法出牌/摸牌，且不受技能影响；可向其他玩家求助解冻">
                ❄️ 冰冻 ×{me.freezeLayers}
              </span>
            )}
            {!!me.mathSubDraw && me.mathSubDraw > 0 && (
              <span className="seat-status-badge is-mathsub" title="减法：你的下一次摸牌少摸一张">
                ➖ 减法 ×{me.mathSubDraw}
              </span>
            )}
            {!!me.mathMulNext && me.mathMulNext > 0 && (
              <span className="seat-status-badge is-mathmul" title="乘法：你的下一张功能牌触发两次">
                ✖️ 乘法 ×{me.mathMulNext}
              </span>
            )}
            {!!me.mathDivNext && me.mathDivNext > 0 && (
              <span className="seat-status-badge is-mathdiv" title="除法：你的下一张功能牌无法触发">
                ➗ 除法 ×{me.mathDivNext}
              </span>
            )}
            {!!me.lychees && me.lychees > 0 && (
              <span className="seat-status-badge is-lychee" title="荔枝：集齐 2 颗获得一张普通小猫牌">
                🍒 荔枝 {me.lychees}/2
              </span>
            )}
            {!!me.appleTurns && me.appleTurns > 0 && (
              <span className="seat-status-badge is-apple" title="你身上有邪恶苹果：不吃掉的话会变成爆炸苹果混入牌堆">
                🍏 邪恶苹果 ×{me.appleTurns}
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
            title={state.worldRuleDesc}
            onClick={() => setRuleDetailOpen(true)}
          >
            {state.worldRuleEmoji} {state.worldRuleName}
          </button>
        )}
        {game.myObjective && !game.objectiveDone && (
          <button className="obj-chip" onClick={() => setObjOpen(true)} title="查看我的秘密任务">
            🎯 {game.myObjective.defName}
          </button>
        )}
        {game.objectiveDone && <span className="obj-chip is-done">🎯 {game.objectiveDone.defName} ✓</span>}
        <span className={`status-turn ${isMyTurn ? 'is-mine' : ''}`}>
          {state.phase === 'finished'
            ? '🏆 对局结束'
            : isMyTurn
              ? me?.alive
                ? '轮到你了'
                : '观战中'
              : `等待 ${players.find((p) => p.sessionId === currentId)?.name ?? ''} 行动`}
        </span>
        <span className="muted status-deck">{state.deckName}</span>
        <span className="muted status-dir">
          {state.direction === 1 ? '↻ 顺时针' : '↺ 逆时针'}
        </span>
        <span className="muted status-me">
          {myChar?.emoji} {myChar?.name ?? '路人'}
          {me && !me.alive ? ' · 👻 观战中' : ''}
        </span>
      </div>

      {/* 行动条 */}
      <div className="actionbar">
        <button
          className={`action-main ${canAct ? 'is-active' : ''}`}
          disabled={!canAct || !!myMustPlay || helpWaiting}
          title={
            myFrozenNow
              ? '冰冻中：结束回合不摸牌（可先向其他玩家求助解冻）'
              : me?.fullTurns > 0
                ? '饱腹中：结束回合将不摸牌'
                : myMustPlay
                  ? '必须先处理消化获得的牌'
                  : undefined
          }
          onClick={() => sendAct({ action: 'draw' })}
        >
          {myFrozenNow
            ? '结束回合（冰冻·不摸牌）'
            : me?.fullTurns > 0
              ? '结束回合（饱腹·不摸牌）'
              : '结束回合 · 摸牌'}
          {isMyTurn && turnEndsAt > 0 && <TurnCountBadge endsAt={turnEndsAt} />}
        </button>

        {/* 猪王：直接丢弃消化完成的牌 */}
        {canAct && myMustPlay && (
          <button
            className="action-skill"
            title="无法正常打出时（如白板猫/否认牌）直接丢弃消化牌"
            onClick={() => sendDigestPlay(myMustPlay)}
          >
            🐷 丢弃消化牌
          </button>
        )}

        {/* 香蕉女王：2 张香蕉兑换任意技能牌（选中的手牌自动带入代价） */}
        {canBananaAction && (
          <button
            className="action-skill"
            title="覆盖期间点手牌只会选中；选 2 张后点此兑换任意技能牌"
            onClick={() => setBananaExchangeOpen(true)}
          >
            🍌×2 换技能牌
          </button>
        )}

        {/* 邪恶苹果头：吃掉身上的邪恶苹果 */}
        {canAct && (me?.appleTurns ?? 0) > 0 && (
          <button
            className="action-skill"
            title="吃掉邪恶苹果：交出一张手牌给投掷者，苹果消失（不吃的话会变成爆炸苹果混入牌堆）"
            onClick={() => setAppleEatOpen(true)}
          >
            🍏 吃掉邪恶苹果 ×{me.appleTurns}
          </button>
        )}

        {canNope && (
          <button
            className="action-nope"
            onClick={() => myNope && sendAct({ action: 'playCard', instanceId: myNope.instanceId, asNope: true })}
          >
            否认！<NopeCountBadge endsAt={nopeEndsAt} />
          </button>
        )}

        {/* 表情轮盘 */}
        <div className="emote-wrap">
          <button className="action-emote" onClick={() => setEmoteOpen((v) => !v)} title="发个表情">
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
          title={settings.sound ? '音效开' : '音效关'}
          onClick={() => {
            setSetting('sound', !settings.sound);
            setSettingsState(getSettings());
          }}
        >
          {settings.sound ? '🔊' : '🔇'}
        </button>
        <button
          className={`action-toggle ${settings.emotes ? 'is-on' : ''}`}
          title={settings.emotes ? '表情开' : '表情屏蔽'}
          onClick={() => {
            setSetting('emotes', !settings.emotes);
            setSettingsState(getSettings());
          }}
        >
          {settings.emotes ? '💬' : '🚫'}
        </button>
        <button
          className={`action-toggle ${settings.fastAnim ? 'is-on' : ''}`}
          title={settings.fastAnim ? '动画 2x' : '动画 1x'}
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
            对子 · 偷随机牌 →
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
                kind === 'bananaRage' || kind === 'chaosWarp' || kind === 'chaosTouch' || kind === 'futureRewrite';
              const needsTargetOnly =
                kind === 'pigGluttony' ||
                kind === 'voyageSwap' ||
                kind === 'bigEyeExpose' ||
                kind === 'mathOp' ||
                kind === 'iceHelp' ||
                kind === 'iceLychee' ||
                kind === 'appleThrow';
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
                      : [];
              const disabled =
                cd > 0 ||
                (kind === 'bananaRage' && (usesLeft <= 0 || bananaOverlay)) ||
                (kind === 'pigGluttony' && !!(me as any)?.digestion) ||
                (kind === 'bigEyeExpose' && eligibleTargets.length === 0) ||
                // 秀英：冰冻时才可求助；解冻后才可喂荔枝（每回合 1 颗）
                (kind === 'iceHelp' && (!myFrozenNow || eligibleTargets.length === 0)) ||
                (kind === 'iceLychee' && (myFrozenNow || !!me?.lycheeGiven)) ||
                (kind === 'appleThrow' && eligibleTargets.length === 0);
              const title =
                kind === 'bananaRage' && bananaOverlay
                  ? '大香蕉之怒正在生效，无法再次发动'
                  : kind === 'iceHelp' && !myFrozenNow
                    ? '只有冰冻中才能求助'
                    : kind === 'iceLychee' && myFrozenNow
                      ? '解冻或被帮助的回合才能喂荔枝'
                      : kind === 'appleThrow' && eligibleTargets.length === 0
                        ? '其他玩家身上都已经有邪恶苹果了'
                        : skill.description;
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
                    }
                  }}
                >
                  {skill.name}
                  {cd > 0 && <span className="skill-cooldown">CD{cd}</span>}
                  {usesLeft > 0 && ` ×${usesLeft}`}
                </button>
              );
            })}

        {/* 旧版主动技（有代价流程的） */}
        {canAct && activeSkill && skillUsesLeft > 0 && (
          <button className="action-skill" onClick={() => setSkillOpen(true)}>
            {myChar!.emoji} {activeSkill.name} ×{skillUsesLeft}
          </button>
        )}

        {selected.length > 0 && (
          <button className="muted action-clear" onClick={() => setSelected([])}>
            取消选择({selected.length})
          </button>
        )}
      </div>

      {/* 手牌（自己是效果目标时顶部提示脉冲） */}
      <footer className={`handzone ${targetedId === myId && me?.alive ? 'is-targeted' : ''}`}>
        {me && !me.alive && state.phase === 'playing' && (
          <div className="spectate-note">👻 你已出局 · 观战中，胜利结算后可返回大厅</div>
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
            × 收起
          </button>
          {log.slice(-30).map((line, i) => (
            <div className="log-line" key={i}>{line}</div>
          ))}
        </aside>
      ) : (
        <button className="log-toggle" onClick={() => setLogOpen(true)} title="查看对局日志">
          📜 日志
        </button>
      )}

      {/* Toast */}
      {game.toast && <div className="toast">{game.toast.text}</div>}

      {/* 看牌堆 */}
      <Modal
        open={!!game.peek}
        title="🔮 你看到了牌堆顶"
        onClose={() => clearPeek(game.peek!.id)}
        footer={
          <button className="primary" onClick={() => clearPeek(game.peek!.id)}>
            知道了
          </button>
        }
      >
        <div className="h-row">
          {(game.peek?.cards ?? []).map((c, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <CardView def={c} size="hand" masked={bananaOverlay} />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>第 {i + 1} 张</div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 看手牌 */}
      <Modal
        open={!!game.peekHandInfo}
        title={`👁️ ${game.peekHandInfo?.playerName} 的手牌`}
        onClose={() => clearPeekHand(game.peekHandInfo!.id)}
      >
        <div className="h-row">
          {(game.peekHandInfo?.cards ?? []).map((c, i) => (
            <CardView key={i} def={c} size="mini" masked={bananaOverlay} />
          ))}
          {(game.peekHandInfo?.cards?.length ?? 0) === 0 && (
            <span className="muted">对方没有手牌</span>
          )}
        </div>
      </Modal>

      {/* 选择目标 */}
      <Modal open={!!targetMode} title="选择目标玩家">
        <div className="h-row">
          {others
            .filter((p) => p.alive)
            .map((p) => (
              <button key={p.sessionId} className="primary" onClick={() => confirmTarget(p.sessionId)}>
                {p.name}（{p.handCount} 张）
              </button>
            ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => { setTargetMode(null); pendingPlay.current = null; }}>取消</button>
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
      <Modal open={skillOpen} title={`${myChar?.emoji} ${activeSkill?.name ?? ''}`} onClose={() => setSkillOpen(false)}>
        {activeSkill && (
          <SkillDialog
            description={myChar?.description ?? ''}
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
            <h3 style={{ marginTop: 0 }}><span className="shimmer-text">🏆 {game.gameEnd.winnerName} 获胜！</span></h3>
            <div style={{ lineHeight: 2.2 }}>
              {game.gameEnd.ranking.map((r) => (
                <div key={r.sessionId} className="h-row" style={{ justifyContent: 'space-between', maxWidth: 380 }}>
                  <span>
                    第 {r.place} 名 · {r.name}
                    {r.sessionId === myId && '（你）'}
                  </span>
                  {(() => {
                    const obj = game.gameEnd?.objectives?.find((o) => o.sessionId === r.sessionId);
                    return obj && obj.defName ? (
                      <span className={`tag ${obj.done ? 'obj-done-tag' : ''}`}>
                        {obj.done ? '🎯✓' : '🎯✗'} {obj.defName}
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
                  🎯 秘密任务达成：{mine.defName}（+50 积分）
                </p>
              ) : null;
            })()}
            <div className="h-row" style={{ marginTop: 18 }}>
              <button className="primary" onClick={() => { clearGameEnd(); leaveRoom(); navigate('/lobby'); }}>
                返回大厅
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* World Rule 详情 */}
      <Modal open={ruleDetailOpen} title="本局规则" onClose={() => setRuleDetailOpen(false)}>
        <div className="h-row" style={{ gap: 16 }}>
          <span style={{ fontSize: 52 }}>{state.worldRuleEmoji}</span>
          <div>
            <h3 style={{ margin: '0 0 6px' }}>{state.worldRuleName}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{state.worldRuleDesc}</p>
          </div>
        </div>
      </Modal>

      {/* 我的秘密任务 */}
      <Modal open={objOpen && !!game.myObjective} title="🎯 我的秘密任务" onClose={() => setObjOpen(false)}>
        {game.myObjective && (
          <div>
            <h3 style={{ margin: '0 0 6px' }}>{game.myObjective.defName}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {game.myObjective.description}
              {game.myObjective.targetName && (
                <>
                  <br />
                  目标：<strong>{game.myObjective.targetName}</strong>
                </>
              )}
            </p>
            {game.objectiveDone && (
              <p style={{ color: 'var(--gold)', fontWeight: 700, marginTop: 10 }}>
                ✅ 已达成！结算时 +50 积分
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* 无尽挑战：胜局三选一增益 */}
      <Modal open={!!bonusChoices} title="🔥 选择本关奖励（下一关生效）">
        <div className="h-row" style={{ gap: 14 }}>
          {(bonusChoices ?? []).map((id) => {
            const def = RUN_BONUS_MAP.get(id);
            if (!def) return null;
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
                <h4 style={{ margin: '8px 0 2px' }}>{def.name}</h4>
                <p style={{ margin: 0 }}>{def.description}</p>
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
              alert(`无尽挑战结束：到达第 ${summary.stage} 关（历史最佳 ${summary.best} 关）`);
              navigate('/lobby');
            }}
          >
            结束挑战
          </button>
        </div>
      </Modal>

      {/* 眼泪选择弹窗 */}
      <Modal open={!!game.tearPrompt} title="💧 你摸到了 Nana 的眼泪">
        {game.tearPrompt && (
          <div>
            <p className="muted" style={{ fontSize: 14 }}>
              你摸到了 {game.tearPrompt.nanaName} 的眼泪。选择你的回应：
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
                <strong>喂给 Nana</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  弃 1 张手牌让她复活
                </span>
              </div>
              <div className="tear-choice-card" onClick={() => sendTearChoice(false)}>
                <span className="tear-emoji">🚫</span>
                <strong>拒绝</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  额外摸 2 张，眼泪回堆顶
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {/* 主动技目标选择（吞噬/Voyage 交换/揭发等） */}
      <Modal open={!!skillTargetPicker} title="选择目标玩家" onClose={() => setSkillTargetPicker(null)}>
        <div className="h-row">
          {others
            .filter(
              (p) =>
                p.alive &&
                (skillTargetPicker !== 'bigeye-expose' || (p.archives ?? 0) >= 2) &&
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
                {p.name}（{p.handCount} 张
                {skillTargetPicker === 'bigeye-expose' ? ` · 👁档案 ${p.archives ?? 0}` : ''}）
              </button>
            ))}
          {skillTargetPicker === 'bigeye-expose' &&
            others.every((p) => !p.alive || (p.archives ?? 0) < 2) && (
              <span className="muted">还没有玩家的档案达到 2 个</span>
            )}
          {activeSkills.find((s) => s.id === skillTargetPicker)?.effect.kind === 'iceHelp' &&
            others.every(
              (p) =>
                !p.alive ||
                ((me?.askedHelp?.toArray?.() ?? me?.askedHelp ?? []) as string[]).includes(
                  p.sessionId,
                ),
            ) && <span className="muted">本回合已经问过所有人了，结束回合吧</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setSkillTargetPicker(null)}>取消</button>
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
        <div className="help-waiting">🧊 等待 {others.find((p) => p.sessionId === state.helpPendingBy)?.name ?? '对方'} 回应求助…</div>
      )}

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
  const [giveId, setGiveId] = useState<string | null>(null);
  useEffect(() => {
    setGiveId(null);
  }, [open]);
  return (
    <Modal open={open} title="🍏 吃掉邪恶苹果" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        吃掉苹果需要交给投掷者一张手牌，苹果随即消失；不吃的话它会在剩余回合后变成爆炸苹果混入牌堆。
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        选择要交出的牌{giveId ? '（已选 1 张）' : ''}：
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
          🍏 吃掉苹果（交出手牌）
        </button>
        <button onClick={onClose}>再想想</button>
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
  info: { id: number; fromName: string } | null;
  hand: HandCard[];
  onClose: () => void;
}) {
  const [giveId, setGiveId] = useState<string | null>(null);
  useEffect(() => {
    setGiveId(null);
  }, [info?.id]);
  return (
    <Modal open={!!info} title={`🧊 ${info?.fromName ?? ''} 向你求助`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        秀英处于冰冻中：同意帮助需要交给她一张手牌（她的冰冻 -1，本回合可正常行动）；也可以拒绝。
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        选择要交出的牌{ giveId ? '（已选 1 张）' : '（同意时必选）'}：
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
        {hand.length === 0 && <span className="muted">你没有手牌，只能拒绝</span>}
      </div>
      <div className="h-row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={!giveId}
          onClick={() => sendHelpRespond(true, giveId!)}
        >
          🤝 同意帮助（交出选中的牌）
        </button>
        <button onClick={onClose}>🙅 拒绝</button>
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
    <Modal open={open} title={`⚓ 选择要交给 ${info?.targetName ?? ''} 的 3 张牌`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        你交出的牌由你指定；对方交出的 3 张随机（双方手牌都需 ≥3 张）。已选 {give.length}/3
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
          ⚓ 确认交换（回合结束）
        </button>
        <button onClick={onClose}>取消</button>
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
  const [open, setOpen] = useState(false);
  const cards = [...cardMap.values()].filter((c) => c.kind !== 'exploding');
  return (
    <>
      <button className="action-combo" onClick={() => setOpen(true)}>
        三连 · 指名偷牌 →
      </button>
      <Modal open={open} title="指定要偷的牌" onClose={() => setOpen(false)}>
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
  const [pos, setPos] = useState(0);
  const [cost, setCost] = useState<string[]>([]);
  useEffect(() => {
    setPos(0);
    setCost([]);
  }, [open]);
  if (bananaMode) {
    return (
      <Modal open={open} title="🍌 4 张香蕉兑换拆解！">
        <p className="muted" style={{ fontSize: 13 }}>
          你没有拆解，但可以用 <strong>4 张手牌</strong>当作拆解（点选 4 张，已选 {cost.length}/4）
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          爆炸猫放回第 <strong style={{ color: 'var(--gold)', fontSize: 18 }}>{pos}</strong> 张（0 =
          牌堆顶）
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
            🍌 兑换拆解！
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={open} title="🔧 拆解爆炸猫！选择放回位置">
      <p className="muted" style={{ fontSize: 13 }}>
        把爆炸猫放回牌堆第 <strong style={{ color: 'var(--gold)', fontSize: 18 }}>{pos}</strong> 张（0 =
        牌堆顶；{deckCount} = 牌堆底）
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
          放回去！
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
    <Modal open={open} title="🍌 2 张香蕉 = 任意动作牌" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        第一步：点选 2 张手牌作为代价（已选 {cost.length}/{COST}）
      </p>
      <BananaCostPicker count={COST} cost={cost} setCost={setCost} />
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
        第二步：选择要兑换打出的动作牌
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
            🍌 兑换打出！
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            这张牌需要目标，选择一名玩家即兑换打出：
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
                {p.name}（{p.handCount} 张）
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        （你的手牌：{hand.length} 张；兑换后立即生效，可被否认）
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
  if (!info) return null;
  const pick = info.mode !== 'view';
  return (
    <Modal
      open
      title={`👀 揭发 ${info.targetName}！`}
      onClose={() => clearExposePrompt()}
    >
      <p className="muted" style={{ fontSize: 13 }}>
        {info.mode === 'view'
          ? `你看到了 ${info.targetName} 的全部手牌（2 个档案）：`
          : info.mode === 'discard'
            ? `3 个档案：点选一张让 ${info.targetName} 弃掉：`
            : `4 个档案：点选一张抽到你手中：`}
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
        {info.cards.length === 0 && <span className="muted">对方没有手牌</span>}
      </div>
      {info.mode === 'view' && (
        <div className="h-row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => clearExposePrompt()}>
            知道了
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
    <Modal open title="🌠 命运改写" onClose={() => clearFutureRewritePrompt()}>
      <p className="muted" style={{ fontSize: 13 }}>
        第一步：点选 1 张<strong>立即生效</strong>的牌（等同你亲自打出）
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
        第二步：选 1 张<strong>手牌</strong>替换进去
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
            第三步：按<strong>自顶向下</strong>的顺序点选放回（第 {order.length}/{n} 张）
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
                  {order.includes(i) ? `第 ${order.indexOf(i) + 1} 位` : ''}
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
                🖐 你的交换牌
              </div>
            </div>
          </div>
        </>
      )}
      {needsTarget && activated && (
        <>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            【{activated.name}】需要目标：
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
          改写命运！
        </button>
        <button onClick={() => clearFutureRewritePrompt()}>放弃（冷却已扣）</button>
      </div>
    </Modal>
  );
}

function AlterModal({ cards }: { cards: CardDef[] | null }) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder([]), [cards]);
  if (!cards) return null;
  return (
    <Modal open title="👁️‍🗨️ 重排牌堆顶（点选顺序，先点的放最上面）">
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
              {order.includes(i) ? `第 ${order.indexOf(i) + 1} 位` : '待安排'}
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
          确定
        </button>
        {order.length > 0 && <button onClick={() => setOrder([])}>重选</button>}
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
  const [target, setTarget] = useState<string | undefined>();
  const [want, setWant] = useState<string | undefined>();
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{description}</p>
      {costCards > 0 && (
        <p style={{ fontSize: 13 }}>
          第一步：从手牌中点击勾选 <strong>{costCards}</strong> 张作为代价（已选 {selectedCount} 张）
        </p>
      )}
      {needsTarget && (
        <>
          <p style={{ fontSize: 13 }}>第二步：选择目标玩家</p>
          <TargetPickerInline onPick={setTarget} picked={target} />
        </>
      )}
      {needsNamed && (
        <>
          <p style={{ fontSize: 13 }}>第三步：指定要偷的牌名（猜对方有什么）</p>
          <select value={want ?? ''} onChange={(e) => setWant(e.target.value)}>
            <option value="">选择牌名…</option>
            {[...cardMap.values()]
              .filter((c) => c.kind !== 'exploding')
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
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
          发动技能
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
          {p.name}（{p.handCount} 张）
        </button>
      ))}
    </div>
  );
}
