import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BUILTIN_CHARACTERS, type CardDef, type HandCard } from '@bombcat/shared';
import {
  buildCardMap,
  clearAlterPrompt,
  clearDefusePrompt,
  clearGameEnd,
  clearPeek,
  clearPeekHand,
  eachPlayer,
  leaveRoom,
  nopeCardIds,
  nopeNopedBy,
  sendAct,
  stateLog,
  turnOrderList,
  useGame,
} from '../lib/game';
import { activeSkinMap } from '../lib/skins';
import { CardView, setSkinMap } from '../components/CardView';
import Modal from '../components/Modal';

const EFFECT_LABEL: Record<string, string> = {
  skip: '跳过',
  attack: '攻击',
  targetedAttack: '精准攻击',
  shuffle: '洗牌',
  peek: '看未来',
  alterFuture: '改变未来',
  stealRandom: '偷 1 张随机牌',
  stealNamed: '指名偷牌',
  peekHand: '看手牌',
  swapHand: '交换手牌',
  drawFromBottom: '从牌底摸牌',
  reverse: '反转方向',
  selfDraw: '额外摸牌',
};

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

export default function GamePage() {
  const game = useGame();
  const navigate = useNavigate();
  const state = game.state;
  const room = game.room;

  const [selected, setSelected] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<
    { kind: 'play'; combo: string[]; wantCardId?: string } | { kind: 'skill'; wantCardId?: string } | null
  >(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    setSkinMap(activeSkinMap());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // 拆解/重排弹窗关闭逻辑：
  // - 拆解完全由 schema 驱动（subPhase + defuseBy），不依赖消息时序
  // - 重排内容是私密消息（有到达时序），清除加 500ms 防抖避免旧 patch 误杀
  useEffect(() => {
    if (state?.subPhase === 'awaiting-alter' && state?.alterBy === myId) return;
    const t = setTimeout(() => clearAlterPrompt(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.subPhase, state?.alterBy, game.version]);

  useEffect(() => {
    if (!room && game.status === 'idle') navigate('/lobby');
  }, [room, game.status, navigate]);

  const cardMap = useMemo(() => buildCardMap(state), [game.version, state]);
  const myId = room?.sessionId ?? '';
  const log = useMemo(() => stateLog(state), [game.version, state]);

  if (!state || !room) {
    return (
      <div className="page">
        <p className="muted">连接中……</p>
      </div>
    );
  }

  const players: any[] = [];
  eachPlayer(state, (p: any) => players.push(p));
  const me = players.find((p) => p.sessionId === myId);
  const others = players.filter((p) => p.sessionId !== myId);
  const currentId = turnOrderList(state)[state.turnIndex];
  const isMyTurn = currentId === myId && state.phase === 'playing';
  const canAct = isMyTurn && state.subPhase === 'awaiting-action' && me?.alive;

  const myHand: HandCard[] = game.hand;
  const myChar = BUILTIN_CHARACTERS.find((c) => c.id === me?.characterId);
  const activeSkill = myChar?.skills.find((s) => s.trigger === 'active');
  const skillUsesLeft = activeSkill
    ? (me?.skillUsesLeft?.get?.(activeSkill.id) ?? me?.skillUsesLeft?.[activeSkill.id] ?? 0)
    : 0;

  const selectedCards = myHand.filter((c) => selected.includes(c.instanceId));
  const selectedSamePlain =
    selectedCards.length >= 2 &&
    selectedCards.every((c) => c.def.kind === 'plain' && c.def.comboable) &&
    new Set(selectedCards.map((c) => c.def.id)).size === 1;

  /* ---------------- 交互 ---------------- */

  function toggleSelect(instanceId: string) {
    if (!canAct) return;
    setSelected((prev) =>
      prev.includes(instanceId)
        ? prev.filter((i) => i !== instanceId)
        : [...prev, instanceId],
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
    // 动作卡：需要目标先选目标
    if (cardNeedsTarget(card.def)) {
      setTargetMode({ kind: 'play', combo: [] });
      pendingPlay.current = card;
      return;
    }
    playSingle(card);
  }

  const pendingPlay = useRef<HandCard | null>(null);

  function confirmTarget(targetSessionId: string) {
    const mode = targetMode;
    setTargetMode(null);
    if (!mode) return;
    if (mode.kind === 'play') {
      if (mode.combo.length > 0) {
        // 组合出牌
        const combo = mode.combo.slice(1);
        sendAct({
          action: 'playCard',
          instanceId: mode.combo[0]!,
          comboInstanceIds: combo,
          targetSessionId,
          wantCardId: mode.wantCardId,
        });
      } else if (pendingPlay.current) {
        const card = pendingPlay.current;
        sendAct({
          action: 'playCard',
          instanceId: card.instanceId,
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

  const nopeRemaining = Math.max(0, Math.ceil((state.nopeEndsAt - now) / 1000));
  const myNope = myHand.find((c) => c.def.id === 'nope');
  const nopedBy = nopeNopedBy(state);
  const iAmLastNoper = nopedBy[nopedBy.length - 1] === myId;
  const canNope =
    state.nopeActive &&
    !!myNope &&
    state.nopePlayBy !== myId &&
    !iAmLastNoper &&
    me?.alive;

  const discardDef = state.discardTopCardId
    ? cardMap.get(state.discardTopCardId)
    : undefined;
  const nopeCards: CardDef[] = nopeCardIds(state)
    .map((id) => cardMap.get(id))
    .filter(Boolean) as CardDef[];

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="table">
      {/* 对手席位 */}
      <div className="seats">
        {others.map((p) => {
          const ch = BUILTIN_CHARACTERS.find((c) => c.id === p.characterId);
          return (
            <div
              key={p.sessionId}
              className={`seat ${p.sessionId === currentId ? 'current' : ''} ${!p.alive ? 'dead' : ''}`}
            >
              <span className="avatar">{ch?.emoji ?? '🙂'}</span>
              <div className="meta">
                <strong>{p.name}</strong>
                <span className="muted">
                  {p.alive ? `🂠 ${p.handCount}` : '💀 出局'}
                  {p.turnsLeft > 1 ? ` ⚡${p.turnsLeft}` : ''}
                  {!p.connected ? ' · 掉线' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 中央牌桌 */}
      <div className="table-center">
        <div className="pile">
          <CardView def={cardMap.get('exploding')} faceDown />
          <span className="count">牌堆 {state.deckCount}</span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>
            {state.phase === 'finished' ? (
              <span style={{ color: 'var(--accent)' }}>🏆 对局结束</span>
            ) : isMyTurn ? (
              <span style={{ color: 'var(--accent-2)' }}>
                轮到你了{state.subPhase === 'awaiting-defuse' ? ' · 处理爆炸猫' : ''}
                {state.subPhase === 'awaiting-nope' ? ' · 等待否认' : ''}
              </span>
            ) : (
              <span className="muted">
                等待 {players.find((p) => p.sessionId === currentId)?.name} 行动
                {state.subPhase === 'awaiting-nope' ? '（否认窗口中）' : ''}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            卡组：{state.deckName} · 方向 {state.direction === 1 ? '顺时针 ↻' : '逆时针 ↺'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            你：{myChar?.emoji} {myChar?.name ?? '路人'}
            {me && !me.alive ? ' · 👻 观战中' : ''}
          </div>
        </div>

        <div className="pile">
          <CardView def={discardDef} />
          <span className="count">弃牌堆 {state.discardCount}</span>
        </div>
      </div>

      {/* 手牌与操作 */}
      <div className="hand-zone">
        <div className="actions">
          <button
            className="primary"
            disabled={!canAct}
            onClick={() => sendAct({ action: 'draw' })}
          >
            结束回合 · 摸牌
          </button>

          {canAct && selectedSamePlain && selectedCards.length >= 2 && selectedCards.length <= 3 && (
            selectedCards.length === 2 ? (
              <button
                onClick={() => setTargetMode({ kind: 'play', combo: selected.map((s) => myHand.find((c) => c.instanceId === s)!.instanceId) })}
              >
                对子出牌（偷随机牌）→ 选目标
              </button>
            ) : (
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
            )
          )}

          {canAct && activeSkill && skillUsesLeft > 0 && (
            <button onClick={() => setSkillOpen(true)}>
              {myChar!.emoji} {activeSkill.name}（剩 {skillUsesLeft} 次）
            </button>
          )}

          {selected.length > 0 && (
            <button className="muted" style={{ fontSize: 12 }} onClick={() => setSelected([])}>
              取消选择（{selected.length}）
            </button>
          )}
        </div>

        <div className="hand">
          <AnimatePresence>
            {myHand.map((card) => (
              <motion.div
                key={card.instanceId}
                layout
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -120, opacity: 0, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <CardView
                  def={card.def}
                  selected={selected.includes(card.instanceId)}
                  onClick={() => onCardClick(card)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {myHand.length === 0 && (
            <span className="muted" style={{ alignSelf: 'center' }}>（没有手牌）</span>
          )}
        </div>
      </div>

      {/* 日志 */}
      <div className="log-panel">
        {log.slice(-14).map((line, i) => (
          <div className="log-line" key={i}>{line}</div>
        ))}
      </div>

      {/* 否认条 */}
      {state.nopeActive && (
        <div className="nope-bar">
          <span className="nope-countdown">{nopeRemaining}</span>
          <div>
            <div style={{ fontSize: 14 }}>
              {players.find((p) => p.sessionId === state.nopePlayBy)?.name} 打出了{' '}
              <strong>{nopeCards.map((c) => c.name).join(' + ')}</strong>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {nopedBy.length % 2 === 1 ? '⛔ 已被否认（等待反否认…）' : '✅ 即将生效（可否认）'}
              {nopedBy.length > 0 && ` · 已有 ${nopedBy.length} 张否认`}
            </div>
          </div>
          <button className="danger" disabled={!canNope} onClick={() => myNope && sendAct({ action: 'playCard', instanceId: myNope.instanceId, asNope: true })}>
            打出否认
          </button>
        </div>
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
              <CardView def={c} />
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
            <CardView key={i} def={c} small />
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

      {/* 拆解位置：完全由 schema 状态驱动（subPhase + defuseBy），无消息时序问题 */}
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
            skillName={activeSkill.name}
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
      <button onClick={() => setOpen(true)}>三连出牌（指名偷牌）→ 选牌与目标</button>
      <Modal open={open} title="指定要偷的牌" onClose={() => setOpen(false)}>
        <div className="h-row" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {cards.map((c) => (
            <div key={c.id} style={{ textAlign: 'center' }}>
              <CardView def={c} small onClick={() => { setOpen(false); onPick(c.id); }} />
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
        把爆炸猫放回牌堆第 <strong style={{ color: 'var(--accent)', fontSize: 18 }}>{pos}</strong> 张（0 =
        牌堆顶，最容易再被摸到；{deckCount} = 牌堆底）
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
        <button
          className="primary"
          onClick={() => sendAct({ action: 'defusePosition', position: pos })}
        >
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
    <Modal open title="👁️‍🗨️ 重排牌堆顶（点按顺序，第 1 个点击的会放到最上面）">
      <div className="h-row">
        {cards.map((c, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <CardView
              def={c}
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
        {order.length > 0 && (
          <button onClick={() => setOrder([])}>重选</button>
        )}
      </div>
    </Modal>
  );
}

function SkillDialog({
  skillName,
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
  skillName: string;
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
  void skillName;
  const [target, setTarget] = useState<string | undefined>();
  const [want, setWant] = useState<string | undefined>();
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{description}</p>
      <p style={{ fontSize: 13 }}>
        第一步：从手牌下方勾选 <strong>{costCards}</strong> 张作为代价（已选 {selectedCount} 张）
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
          disabled={
            selectedCount !== costCards ||
            (needsTarget && !target) ||
            (needsNamed && !want)
          }
          onClick={() => onSubmit(target, want)}
        >
          发动技能
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          提示：手牌在下方，点击即可选中/取消
        </span>
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
