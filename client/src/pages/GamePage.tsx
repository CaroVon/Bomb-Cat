import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUILTIN_CHARACTERS, type CardDef, type HandCard } from '@bombcat/shared';
import {
  buildCardMap,
  clearAlterPrompt,
  clearGameEnd,
  clearPeek,
  clearPeekHand,
  eachPlayer,
  lastPlayCardIds,
  leaveRoom,
  sendAct,
  sendEmote,
  stateLog,
  turnOrderList,
  useGame,
} from '../lib/game';
import { activeSkinMap } from '../lib/skins';
import { animMs, getSettings, setSetting } from '../lib/settings';
import { sfx } from '../lib/sound';
import { explodeAt, winCelebration } from '../lib/fx';
import { recordMatch } from '../lib/stats';
import { CardView, setSkinMap } from '../components/CardView';
import Modal from '../components/Modal';
import { Seat, type SeatData } from '../components/table/Seat';
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
      e.type === 'swapHand' ||
      e.type === 'targetedAttack',
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
  const [now, setNow] = useState(Date.now());
  const [emoteOpen, setEmoteOpen] = useState(false);
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
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!room && game.status === 'idle') navigate('/lobby');
  }, [room, game.status, navigate]);

  const cardMap = useMemo(() => buildCardMap(state), [game.version, state]);
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
      });
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

  const nopeRemaining = Math.max(0, Math.ceil(((state?.nopeEndsAt ?? 0) - now) / 1000));

  // 停留时长与"是否需要他人响应"挂钩（EK2 教训）：否认窗口期持续展示，否则 ~1.6s
  useEffect(() => {
    if (!stage) return;
    if (state?.nopeActive) return;
    const t = setTimeout(() => setStage(null), animMs(1600));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage?.id, state?.nopeActive, state?.lastPlayNoped, settings.fastAnim]);

  // 舞台倒计时（否认窗口中）
  const stageCountdown = state?.nopeActive ? nopeRemaining : undefined;
  const stageWithCountdown = useMemo(
    () => (stage ? { ...stage, countdown: stageCountdown } : null),
    [stage, stageCountdown],
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

  // 胜利庆祝（只放一次）+ 战绩记录
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
  const activeSkill = myChar?.skills.find((s) => s.trigger === 'active');
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

  /* ---------------- 交互 ---------------- */

  function toggleSelect(instanceId: string) {
    setSelected((prev) =>
      prev.includes(instanceId) ? prev.filter((i) => i !== instanceId) : [...prev, instanceId],
    );
  }

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

  function onCardClick(card: HandCard) {
    if (!canAct) return;
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

  /** 当前回合剩余秒数（服务端权威 turnEndsAt） */
  const turnRemaining =
    state.turnEndsAt > 0 ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000)) : null;

  /* ---------------- 渲染 ---------------- */

  return (
    <div className={`table-root ${boom ? 'is-shaking' : ''}`}>
      <FlashOverlay boomKey={boom?.key ?? 0} />
      <TurnBanner text={banner?.text ?? null} gold={banner?.gold ?? false} />
      <BoomBanner name={boom?.name ?? null} />

      {/* 对手席 */}
      <header className="opponents-row">
        {others.map((p) => (
          <Seat
            key={p.sessionId}
            seat={p as SeatData}
            isCurrent={p.sessionId === currentId}
            bounced={p.sessionId === bounceId}
            timer={p.sessionId === currentId ? turnRemaining : null}
            emote={emoteBubbles[p.sessionId] ?? null}
            emoji={
              BUILTIN_CHARACTERS.find((c) => c.id === p.characterId)?.emoji ?? '🙂'
            }
          />
        ))}
      </header>

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
          disabled={!canAct}
          onClick={() => sendAct({ action: 'draw' })}
        >
          结束回合 · 摸牌
          {isMyTurn && turnRemaining != null && (
            <span className={`turn-count ${turnRemaining <= 10 ? 'is-urgent' : ''}`}>
              {turnRemaining}
            </span>
          )}
        </button>

        {canNope && (
          <button
            className="action-nope"
            onClick={() => myNope && sendAct({ action: 'playCard', instanceId: myNope.instanceId, asNope: true })}
          >
            否认！<span className="nope-count">{nopeRemaining}</span>
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

        {canAct && selectedSamePlain && selectedCards.length === 2 && (
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
        {canAct && selectedSamePlain && selectedCards.length === 3 && (
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

      {/* 手牌 */}
      <footer className="handzone">
        {me && !me.alive && state.phase === 'playing' && (
          <div className="spectate-note">👻 你已出局 · 观战中，胜利结算后可返回大厅</div>
        )}
        <HandFan
          cards={fanCards}
          interactive={!!canAct}
          selected={selected}
          playable={playable}
          onCardClick={onCardClick}
        />
      </footer>

      {/* 日志 */}
      <aside className="log-panel">
        {log.slice(-10).map((line, i) => (
          <div className="log-line" key={i}>{line}</div>
        ))}
      </aside>

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
              <CardView def={c} size="hand" />
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
            <CardView key={i} def={c} size="mini" />
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

      {/* 拆解位置（schema 驱动） */}
      <DefuseModal
        open={
          state.phase === 'playing' &&
          state.subPhase === 'awaiting-defuse' &&
          state.defuseBy === myId
        }
        deckCount={state.deckCount}
      />

      {/* 重排未来 */}
      <AlterModal cards={game.alterPrompt} />

      {/* 技能面板 */}
      <Modal open={skillOpen} title={`${myChar?.emoji} ${activeSkill?.name ?? ''}`} onClose={() => setSkillOpen(false)}>
        {activeSkill && (
          <SkillDialog
            description={myChar?.description ?? ''}
            costCards={(activeSkill.effect as { costCards: number }).costCards}
            needsTarget={(activeSkill.effect as { kind: string }).kind === 'activeSteal'}
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
            <h3 style={{ marginTop: 0 }}>🏆 {game.gameEnd.winnerName} 获胜！</h3>
            <div style={{ lineHeight: 2.2 }}>
              {game.gameEnd.ranking.map((r) => (
                <div key={r.sessionId}>
                  第 {r.place} 名 · {r.name}
                  {r.sessionId === myId && '（你）'}
                </div>
              ))}
            </div>
            <div className="h-row" style={{ marginTop: 18 }}>
              <button className="primary" onClick={() => { clearGameEnd(); leaveRoom(); navigate('/lobby'); }}>
                返回大厅
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- 子组件 ---------------- */

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

function DefuseModal({ open, deckCount }: { open: boolean; deckCount: number }) {
  const [pos, setPos] = useState(0);
  useEffect(() => setPos(0), [open]);
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
      <p style={{ fontSize: 13 }}>
        第一步：从手牌中点击勾选 <strong>{costCards}</strong> 张作为代价（已选 {selectedCount} 张）
      </p>
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
