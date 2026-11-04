import { useMemo, useRef, useState } from 'react';
import {
  BUILTIN_CARDS,
  CLASSIC_DECK,
  cardName,
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
import { decodeDeck, encodeDeck } from '../lib/share';
import { CardView, setSkinMap } from '../components/CardView';
import Modal from '../components/Modal';
import { BuildSection, RulesCodex } from '../components/BuildEditor';
import { useI18n, type TFn } from '../i18n';
import { UI, type UiKey } from '../i18n/ui';

/** 自定义卡效果说明（按语言） */
function effectLabel(type: string, t: TFn): string {
  const key = `effect.${type}` as UiKey;
  return key in UI ? t(key) : type;
}

export default function EditorPage() {
  const { t } = useI18n();
  return (
    <div className="page page-room">
      <h2 className="title" style={{ marginTop: 0 }}>{t('editor.title')}</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('editor.subtitle')}
      </p>
      <SkinSection />
      <DeckSection />
      <BuildSection />
      <RulesCodex />
    </div>
  );
}

/* ==================== 卡面皮肤 ==================== */

function SkinSection() {
  const { lang, t } = useI18n();
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
        <h3 style={{ margin: 0 }}>{t('skin.title')}</h3>
        <button className="primary" onClick={() => setEditing({ id: '', name: '', images: {}, pendingCardId: '' })}>
          {t('skin.new')}
        </button>
      </div>

      <div className="h-row">
        {packs.length === 0 && <span className="muted">{t('skin.none')}</span>}
        {packs.map((p) => (
          <div key={p.id} className="char-card" style={{ minWidth: 180 }}>
            <h4 style={{ margin: '0 0 4px' }}>{p.name}</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {t('skin.count', { n: p.skins.length })}
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
                {active === p.id ? t('build.inUse') : t('build.use')}
              </button>
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  if (!confirm(t('skin.confirmDelete', { name: p.name }))) return;
                  deleteSkinPack(p.id);
                  setPacks(loadSkinPacks());
                  setActive(getActiveSkinPackId());
                  setSkinMap(activeSkinMap());
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        {t('skin.note')}
      </p>

      <Modal
        open={!!editing}
        title={t('skin.editTitle')}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="primary" onClick={saveDraft} disabled={!editing?.name.trim()}>
              {t('common.save')}
            </button>
            <button onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </>
        }
      >
        {editing && (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>{t('skin.name')}</label>
              <input
                value={editing.name}
                maxLength={20}
                placeholder={t('skin.namePh')}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>{t('skin.pickCard')}</label>
              <div className="h-row">
                <select
                  value={editing.pendingCardId}
                  onChange={(e) => setEditing({ ...editing, pendingCardId: e.target.value })}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">{t('skin.selectCard')}</option>
                  {BUILTIN_CARDS.filter((c) => c.kind !== 'exploding').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {cardName(c.id, lang)}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!editing.pendingCardId}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('skin.upload')}
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
                      <span className="pcard-name">{def ? cardName(def.id, lang) : ''}</span>
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
                      {t('common.remove')}
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
  const { lang, t } = useI18n();
  const [decks, setDecks] = useState(loadDecks);
  const [draft, setDraft] = useState<DeckDef | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [newCard, setNewCard] = useState<CardDef | null>(null);
  const [importCode, setImportCode] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [shareCode, setShareCode] = useState<string | null>(null);

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

  /** 一键加入扩展包（在经典基础上叠加强度适中的扩展卡） */
  function addExpansion(kind: 'imploding' | 'streaking'): void {
    const base = draft ?? { ...CLASSIC_DECK, id: '', name: t('deck.myDeck') };
    const counts = { ...base.counts };
    if (kind === 'imploding') {
      counts.reverse = (counts.reverse ?? 0) + 3;
      counts['alter-future'] = (counts['alter-future'] ?? 0) + 3;
      counts['draw-bottom'] = (counts['draw-bottom'] ?? 0) + 3;
      counts.feral = (counts.feral ?? 0) + 5;
    } else {
      counts.streaking = (counts.streaking ?? 0) + 1;
    }
    setErrors([]);
    setDraft({ ...base, counts });
  }

  function doImport(): void {
    const r = decodeDeck(importCode);
    if (!r.ok || !r.deck) {
      setImportMsg(r.error ?? t('deck.importFail'));
      return;
    }
    void saveDeck(r.deck);
    setDecks(loadDecks());
    setImportCode('');
    setImportMsg(t('deck.imported', { name: r.deck.name }));
  }

  return (
    <div className="panel">
      <div className="h-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t('deck.title')}</h3>
        <button
          className="primary"
          onClick={() => {
            setDraft({ ...CLASSIC_DECK, id: '', name: t('deck.myDeck') });
            setErrors([]);
          }}
        >
          {t('deck.newFromClassic')}
        </button>
        <button onClick={() => addExpansion('imploding')} title={t('deck.impTitle')}>
          {t('deck.imploding')}
        </button>
        <button onClick={() => addExpansion('streaking')} title={t('deck.strTitle')}>
          {t('deck.streaking')}
        </button>
        <span style={{ flex: 1 }} />
        <input
          value={importCode}
          onChange={(e) => setImportCode(e.target.value)}
          placeholder={t('deck.pastePh')}
          style={{ width: 220, fontSize: 12 }}
        />
        <button onClick={doImport} disabled={!importCode.trim()}>
          {t('deck.import')}
        </button>
      </div>
      {importMsg && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{importMsg}</div>}

      <div className="h-row">
        <div className="char-card" style={{ minWidth: 180 }}>
          <h4 style={{ margin: '0 0 4px' }}>{t('deck.classic')}</h4>
          <div className="muted" style={{ fontSize: 12 }}>{t('deck.builtin')}</div>
        </div>
        {decks.map((d) => (
          <div key={d.id} className="char-card" style={{ minWidth: 180 }}>
            <h4 style={{ margin: '0 0 4px' }}>{d.name}</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {t('build.cards', { n: Object.values(d.counts).reduce((a, b) => a + b, 0) })}
              {d.customCards.length > 0 ? t('deck.withCustom', { n: d.customCards.length }) : ''}
            </div>
            <div className="h-row">
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  setDraft(JSON.parse(JSON.stringify(d)) as DeckDef);
                  setErrors([]);
                }}
              >
                {t('common.edit')}
              </button>
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => setShareCode(encodeDeck(d))}
                title={t('deck.shareTitle')}
              >
                {t('deck.share')}
              </button>
              <button
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => {
                  if (!confirm(t('deck.confirmDelete', { name: d.name }))) return;
                  deleteDeck(d.id);
                  setDecks(loadDecks());
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        {t('deck.note')}
      </p>

      <Modal
        open={!!draft}
        title={t('deck.editTitle', { name: draft?.name ?? '' })}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button className="primary" onClick={saveDraft}>
              {t('deck.save')}
            </button>
            <button onClick={() => setDraft(null)}>{t('common.cancel')}</button>
            {errors.length > 0 && <span className="err-text">{errors.join(t('common.listSep'))}</span>}
          </>
        }
      >
        {draft && (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>{t('deck.name')}</label>
              <input
                value={draft.name}
                maxLength={20}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div className="h-row" style={{ marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: 13 }}>{t('deck.expansions')}</span>
              <button onClick={() => addExpansion('imploding')} title={t('deck.impTitle')}>
                {t('deck.imploding')}
              </button>
              <button onClick={() => addExpansion('streaking')} title={t('deck.strTitle')}>
                {t('deck.streaking')}
              </button>
            </div>

            <h4>{t('deck.builtinCounts')}</h4>
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
                    {c.emoji} {cardName(c.id, lang)}
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
              <h4 style={{ margin: 0 }}>{t('deck.customCards')}</h4>
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
                {t('deck.newCard')}
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
                    {t('common.remove')}
                  </button>
                </div>
              ))}
              {draftCards.length === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>{t('deck.noCustom')}</span>
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
                      {c.effects.map((e) => effectLabel(e.type, t)).join(' + ')}
                    </span>
                    <button
                      style={{ padding: '2px 10px', fontSize: 12 }}
                      onClick={() => setNewCard(c)}
                    >
                      {t('build.edit')}
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
        title={t('card.customTitle')}
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
                    newCard.effects.map((e) => effectLabel(e.type, t)).join(' + '),
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
              {t('card.addToDeck')}
            </button>
            <button onClick={() => setNewCard(null)}>{t('common.cancel')}</button>
          </>
        }
      >
        {newCard && (
          <>
            <div className="field">
              <label>{t('card.name')}</label>
              <input
                value={newCard.name}
                maxLength={20}
                onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('card.emoji')}</label>
              <input
                value={newCard.emoji}
                maxLength={4}
                onChange={(e) => setNewCard({ ...newCard, emoji: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('card.type')}</label>
              <select
                value={newCard.kind}
                onChange={(e) => setNewCard({ ...newCard, kind: e.target.value as CardDef['kind'] })}
              >
                <option value="action">{t('card.kindAction')}</option>
                <option value="plain">{t('card.kindPlain')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('card.effects')}</label>
              <div className="h-row">
                {newCard.effects.map((e, i) => (
                  <span key={i} className="tag">
                    {effectLabel(e.type, t)}
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
                  <option value="">{t('card.addEffect')}</option>
                  {CUSTOM_CARD_ALLOWED_EFFECTS.map((et) => (
                    <option key={et} value={et}>
                      {effectLabel(et, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>{t('card.desc')}</label>
              <input
                value={newCard.description}
                maxLength={120}
                onChange={(e) => setNewCard({ ...newCard, description: e.target.value })}
              />
            </div>
          </>
        )}
      </Modal>

      {/* 卡组分享码 */}
      <Modal
        open={!!shareCode}
        title={t('deck.shareCodeTitle')}
        onClose={() => setShareCode(null)}
        footer={
          <>
            <button
              className="primary"
              onClick={() => {
                if (shareCode) void navigator.clipboard?.writeText(shareCode);
                setShareCode(null);
              }}
            >
              {t('deck.copyClose')}
            </button>
            <button onClick={() => setShareCode(null)}>{t('common.close')}</button>
          </>
        }
      >
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          {t('deck.shareHint')}
        </p>
        <textarea
          readOnly
          value={shareCode ?? ''}
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          style={{ width: '100%', height: 90, fontSize: 11, wordBreak: 'break-all' }}
        />
      </Modal>
    </div>
  );
}
