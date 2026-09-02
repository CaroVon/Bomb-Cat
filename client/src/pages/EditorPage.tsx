import { useMemo, useRef, useState } from 'react';
import {
  BUILTIN_CARDS,
  CLASSIC_DECK,
  CUSTOM_CARD_ALLOWED_EFFECTS,
  type CardDef,
  type CardEffect,
  type DeckDef,
  validateDeck,
} from '@bombcat/shared';
import {
  activeSkinMap,
  compressImage,
  deleteSkinPack,
  getActiveSkinPackId,
  loadSkinPacks,
  saveSkinPack,
  setActiveSkinPack,
} from '../lib/skins';
import { deleteDeck, loadDecks, saveDeck } from '../lib/decks';
import { CardView, setSkinMap } from '../components/CardView';
import Modal from '../components/Modal';

const EFFECT_LABEL: Record<string, string> = {
  skip: '跳过（结束回合不摸牌）',
  attack: '攻击（下家连走 2 回合）',
  targetedAttack: '精准攻击（指定玩家连走 2 回合）',
  shuffle: '洗牌',
  peek: '预知未来（看牌堆顶 3 张）',
  alterFuture: '改变未来（重排牌堆顶 3 张）',
  stealRandom: '偷 1 张随机牌（需目标）',
  stealNamed: '指名偷牌（需目标）',
  peekHand: '偷看手牌（需目标）',
  swapHand: '交换手牌（需目标）',
  drawFromBottom: '从牌堆底摸 1 张',
  reverse: '反转出牌方向',
  selfDraw: '额外摸牌',
};

export default function EditorPage() {
  return (
    <div className="page page-room">
      <h2 className="title" style={{ marginTop: 0 }}>🎨 定制工坊</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        换上朋友的照片做卡面、设计你自己的特殊卡牌，房主开局时选用即可生效
      </p>
      <SkinSection />
      <DeckSection />
    </div>
  );
}

/* ==================== 卡面皮肤 ==================== */

function SkinSection() {
  const [packs, setPacks] = useState(loadSkinPacks);
  const [active, setActive] = useState(getActiveSkinPackId());
  const [editing, setEditing] = useState<SkinPackDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  interface SkinPackDraft {
    id: string;
    name: string;
    /** cardId -> dataURL */
    images: Record<string, string>;
    pendingCardId: string;
  }

  async function handleUpload(file: File) {
    if (!editing) return;
    const dataUrl = await compressImage(file);
    setEditing({ ...editing, images: { ...editing.images, [editing.pendingCardId]: dataUrl } });
  }

  function saveDraft() {
    if (!editing || !editing.name.trim()) return;
    const pack = {
      id: editing.id || `skin-${Date.now()}`,
      name: editing.name.trim(),
      skins: Object.entries(editing.images).map(([cardId, imageUrl]) => ({ cardId, imageUrl })),
    };
    saveSkinPack(pack);
    const next = loadSkinPacks();
    setPacks(next);
    setEditing(null);
  }

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="h-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📷 卡面皮肤包</h3>
        <button className="primary" onClick={() => setEditing({ id: '', name: '', images: {}, pendingCardId: '' })}>
          新建皮肤包
        </button>
      </div>

      <div className="h-row">
        {packs.length === 0 && <span className="muted">还没有皮肤包，点上面按钮创建（上传朋友照片当卡面！）</span>}
        {packs.map((p) => (
          <div key={p.id} className="char-card" style={{ minWidth: 180 }}>
            <h4 style={{ margin: '0 0 4px' }}>{p.name}</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {p.skins.length} 张自定义卡面
            </div>
            <div className="h-row">
              <button
                className={active === p.id ? 'primary' : ''}
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  setActiveSkinPack(p.id);
                  setActiveSkinPack(p.id);
                  setSkinMap(activeSkinMap());
                }}
              >
                {active === p.id ? '使用中' : '启用'}
              </button>
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  if (!confirm(`删除皮肤包「${p.name}」？`)) return;
                  deleteSkinPack(p.id);
                  setPacks(loadSkinPacks());
                  setActive(getActiveSkinPackId());
                  setSkinMap(activeSkinMap());
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        皮肤仅影响你自己屏幕上的卡面显示（纯本地/个人云端），不影响游戏规则与其他玩家。
        照片会在浏览器内自动压缩到 720px / ~200KB 再保存。
      </p>

      <Modal
        open={!!editing}
        title="编辑皮肤包"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="primary" onClick={saveDraft} disabled={!editing?.name.trim()}>
              保存
            </button>
            <button onClick={() => setEditing(null)}>取消</button>
          </>
        }
      >
        {editing && (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>皮肤包名称</label>
              <input
                value={editing.name}
                maxLength={20}
                placeholder="比如：兄弟们的脸"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>选择要换脸的卡 → 上传照片</label>
              <div className="h-row">
                <select
                  value={editing.pendingCardId}
                  onChange={(e) => setEditing({ ...editing, pendingCardId: e.target.value })}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">选择卡牌…</option>
                  {BUILTIN_CARDS.filter((c) => c.kind !== 'exploding').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!editing.pendingCardId}
                  onClick={() => fileRef.current?.click()}
                >
                  上传照片
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div className="h-row">
              {Object.entries(editing.images).map(([cardId, url]) => {
                const def = BUILTIN_CARDS.find((c) => c.id === cardId);
                return (
                  <div key={cardId} style={{ textAlign: 'center' }}>
                    <div
                      className="skin-preview"
                      style={{ backgroundImage: `url(${url})` }}
                    >
                      <span className="pcard-name">{def?.name}</span>
                    </div>
                    <button
                      className="muted"
                      style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: 'none' }}
                      onClick={() => {
                        const next = { ...editing.images };
                        delete next[cardId];
                        setEditing({ ...editing, images: next });
                      }}
                    >
                      移除
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ==================== 卡组编辑 ==================== */

function DeckSection() {
  const [decks, setDecks] = useState(loadDecks);
  const [draft, setDraft] = useState<DeckDef | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [newCard, setNewCard] = useState<CardDef | null>(null);

  const draftCards = useMemo(() => {
    if (!draft) return [];
    return draft.customCards;
  }, [draft]);

  function validate(d: DeckDef): string[] {
    const r = validateDeck(d, 3); // 按可开局的最小人基线校验
    return r.errors;
  }

  function saveDraft() {
    if (!draft) return;
    const errs = validate(draft);
    setErrors(errs);
    if (errs.length > 0) return;
    const d = { ...draft, id: draft.id || `deck-${Date.now()}` };
    void saveDeck(d);
    setDecks(loadDecks());
    setDraft(null);
  }

  function setCount(d: DeckDef, cardId: string, count: number): void {
    const counts = { ...d.counts, [cardId]: Math.max(0, Math.min(6, count)) };
    setDraft({ ...d, counts });
  }

  return (
    <div className="panel">
      <div className="h-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🃏 自定义卡组</h3>
        <button
          className="primary"
          onClick={() => {
            setDraft({ ...CLASSIC_DECK, id: '', name: '我的卡组' });
            setErrors([]);
          }}
        >
          基于经典卡组新建
        </button>
      </div>

      <div className="h-row">
        <div className="char-card" style={{ minWidth: 180 }}>
          <h4 style={{ margin: '0 0 4px' }}>经典卡组</h4>
          <div className="muted" style={{ fontSize: 12 }}>内置默认</div>
        </div>
        {decks.map((d) => (
          <div key={d.id} className="char-card" style={{ minWidth: 180 }}>
            <h4 style={{ margin: '0 0 4px' }}>{d.name}</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {Object.values(d.counts).reduce((a, b) => a + b, 0)} 张
              {d.customCards.length > 0 ? ` · 含 ${d.customCards.length} 张自定义卡` : ''}
            </div>
            <div className="h-row">
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  setDraft(JSON.parse(JSON.stringify(d)) as DeckDef);
                  setErrors([]);
                }}
              >
                编辑
              </button>
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  if (!confirm(`删除卡组「${d.name}」？`)) return;
                  deleteDeck(d.id);
                  setDecks(loadDecks());
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        卡组由房主在等待室选择，开局后所有玩家生效。爆炸猫与拆解的数量由规则锁定（人数-1 与固定配比）。
      </p>

      <Modal
        open={!!draft}
        title={`编辑卡组：${draft?.name ?? ''}`}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button className="primary" onClick={saveDraft}>
              保存卡组
            </button>
            <button onClick={() => setDraft(null)}>取消</button>
            {errors.length > 0 && <span className="err-text">{errors.join('；')}</span>}
          </>
        }
      >
        {draft && (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>卡组名称</label>
              <input
                value={draft.name}
                maxLength={20}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <h4>内置卡数量</h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 8,
                marginBottom: 18,
              }}
            >
              {BUILTIN_CARDS.filter((c) => c.kind === 'action' || c.kind === 'plain').map((c) => (
                <div key={c.id} className="h-row" style={{ fontSize: 13 }}>
                  <span style={{ minWidth: 90 }}>
                    {c.emoji} {c.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={draft.counts[c.id] ?? 0}
                    onChange={(e) => setCount(draft, c.id, Number(e.target.value))}
                    style={{ width: 70 }}
                  />
                </div>
              ))}
            </div>

            <div className="h-row" style={{ marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>自定义卡（最多 10 张，每卡最多 3 个效果）</h4>
              <button
                disabled={draftCards.length >= 10}
                onClick={() =>
                  setNewCard({
                    id: `custom:${Date.now()}`,
                    name: '',
                    kind: 'action',
                    emoji: '✨',
                    description: '',
                    effects: [],
                  })
                }
              >
                新建卡牌
              </button>
            </div>
            <div className="h-row">
              {draftCards.map((c) => (
                <div key={c.id} style={{ textAlign: 'center' }}>
                  <CardView def={c} size="mini" />
                  <button
                    className="muted"
                    style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: 'none' }}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        customCards: draft.customCards.filter((x) => x.id !== c.id),
                        counts: Object.fromEntries(
                          Object.entries(draft.counts).filter(([k]) => k !== c.id),
                        ),
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              {draftCards.length === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>（无自定义卡）</span>
              )}
            </div>

            {draftCards.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {draftCards.map((c) => (
                  <div key={c.id} className="h-row" style={{ fontSize: 13, padding: '4px 0' }}>
                    <span style={{ minWidth: 160 }}>
                      {c.emoji} {c.name}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={draft.counts[c.id] ?? 0}
                      onChange={(e) => setCount(draft, c.id, Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {c.effects.map((e) => EFFECT_LABEL[e.type] ?? e.type).join(' + ')}
                    </span>
                    <button
                      style={{ padding: '2px 10px', fontSize: 12 }}
                      onClick={() => setNewCard(c)}
                    >
                      改
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 新建/编辑自定义卡 */}
      <Modal
        open={!!newCard}
        title="自定义卡牌"
        onClose={() => setNewCard(null)}
        footer={
          <>
            <button
              className="primary"
              disabled={!newCard?.name.trim() || !newCard?.emoji.trim() || (newCard?.effects.length ?? 0) === 0}
              onClick={() => {
                if (!newCard || !draft) return;
                const card: CardDef = {
                  ...newCard,
                  description:
                    newCard.description ||
                    newCard.effects.map((e) => EFFECT_LABEL[e.type] ?? e.type).join(' + '),
                };
                const others = draft.customCards.filter((c) => c.id !== card.id);
                const customCards = [...others, card];
                setDraft({ ...draft, customCards });
                if (!draft.counts[card.id]) {
                  setCount({ ...draft, customCards }, card.id, 2);
                } else {
                  setDraft({ ...draft, customCards });
                }
                setNewCard(null);
              }}
            >
              加入卡组
            </button>
            <button onClick={() => setNewCard(null)}>取消</button>
          </>
        }
      >
        {newCard && (
          <>
            <div className="field">
              <label>卡名（≤20 字）</label>
              <input
                value={newCard.name}
                maxLength={20}
                onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Emoji（卡面图标，可被照片皮肤替换）</label>
              <input
                value={newCard.emoji}
                maxLength={4}
                onChange={(e) => setNewCard({ ...newCard, emoji: e.target.value })}
              />
            </div>
            <div className="field">
              <label>类型</label>
              <select
                value={newCard.kind}
                onChange={(e) => setNewCard({ ...newCard, kind: e.target.value as CardDef['kind'] })}
              >
                <option value="action">动作牌</option>
                <option value="plain">普通猫（可组对子/三连）</option>
              </select>
            </div>
            <div className="field">
              <label>效果（按顺序结算，最多 3 个）</label>
              <div className="h-row">
                {newCard.effects.map((e, i) => (
                  <span key={i} className="tag">
                    {EFFECT_LABEL[e.type] ?? e.type}
                    <button
                      className="muted"
                      style={{ padding: '0 4px', background: 'none', border: 'none', fontSize: 11 }}
                      onClick={() =>
                        setNewCard({
                          ...newCard,
                          effects: newCard.effects.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="h-row" style={{ marginTop: 8 }}>
                <select
                  value=""
                  onChange={(e) => {
                    const type = e.target.value as CardEffect['type'];
                    if (!type) return;
                    let effect: CardEffect = { type };
                    if (type === 'stealNamed') {
                      // 指名偷的 cardId 运行时由出牌者选择，这里占位
                      effect = { type, cardId: 'skip' };
                    }
                    setNewCard({
                      ...newCard,
                      effects: [...newCard.effects, effect].slice(0, 3),
                    });
                  }}
                >
                  <option value="">添加效果…</option>
                  {CUSTOM_CARD_ALLOWED_EFFECTS.map((t) => (
                    <option key={t} value={t}>
                      {EFFECT_LABEL[t] ?? t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>描述（可留空自动生成）</label>
              <input
                value={newCard.description}
                maxLength={120}
                onChange={(e) => setNewCard({ ...newCard, description: e.target.value })}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
