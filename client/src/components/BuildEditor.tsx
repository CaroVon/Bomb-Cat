import { useMemo, useState } from 'react';
import {
  BUILTIN_CARDS,
  BUILD_MAX_COPIES,
  BUILD_SIZE,
  OBJECTIVES,
  WORLD_RULES,
  objectiveText,
  worldRuleText,
  type CardDef,
} from '@bombcat/shared';
import { useI18n } from '../i18n';
import {
  deleteBuild,
  getActiveBuildId,
  loadBuilds,
  localCardPool,
  saveBuild,
  setActiveBuildId,
  type PersonalBuild,
} from '../lib/builds';
import { loadDecks } from '../lib/decks';
import { CardView } from '../components/CardView';

/**
 * 出战构筑编辑器：10 张自选 → 6 张随机入起手 + 4 张洗入公共堆。
 * 同卡 ≤2 张；卡池 = 内置动作/普通猫 + 我的自定义卡。
 */
export function BuildSection() {
  const { t } = useI18n();
  const [builds, setBuilds] = useState(loadBuilds);
  const [active, setActive] = useState(getActiveBuildId());
  const [editing, setEditing] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const pool = useMemo(() => {
    const m = localCardPool();
    return [...m.values()].filter((c) => c.kind === 'action' || c.kind === 'plain');
  }, []);
  const poolMap = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);

  const count = (id: string) => editing?.filter((x) => x === id).length ?? 0;

  function toggle(id: string): void {
    if (!editing) return;
    setError('');
    setEditing((prev) => {
      if (!prev) return prev;
      const same = prev.filter((x) => x === id).length;
      if (same >= BUILD_MAX_COPIES) return prev;
      if (prev.length >= BUILD_SIZE) return prev;
      return [...prev, id];
    });
  }

  function removeAt(i: number): void {
    if (!editing) return;
    setEditing(editing.filter((_, j) => j !== i));
  }

  function doSave(): void {
    if (!editing) return;
    if (editing.length !== BUILD_SIZE) {
      setError(t('build.short', { n: BUILD_SIZE - editing.length, size: BUILD_SIZE }));
      return;
    }
    const build: PersonalBuild = {
      id: `build-${Date.now()}`,
      name: name.trim() || t('build.defaultName', { n: builds.length + 1 }),
      cards: editing,
    };
    const err = saveBuild(build);
    if (err) {
      setError(err);
      return;
    }
    setBuilds(loadBuilds());
    setEditing(null);
    setName('');
  }

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="h-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t('build.title')}</h3>
        <button
          className="primary"
          onClick={() => {
            setEditing([]);
            setName('');
            setError('');
          }}
        >
          {t('build.new')}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        {t('build.desc', { size: BUILD_SIZE })}
      </p>

      {/* 我的构筑列表 */}
      <div className="h-row" style={{ marginBottom: 12 }}>
        {builds.length === 0 && <span className="muted" style={{ fontSize: 13 }}>{t('build.none')}</span>}
        {builds.map((b) => (
          <div key={b.id} className="char-card" style={{ minWidth: 160 }}>
            <h4 style={{ margin: '0 0 4px' }}>{b.name}</h4>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              {t('build.cards', { n: b.cards.length })}
            </div>
            <div className="h-row">
              <button
                className={active === b.id ? 'primary' : ''}
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => {
                  setActiveBuildId(b.id);
                  setActive(b.id);
                }}
              >
                {active === b.id ? t('build.inUse') : t('build.use')}
              </button>
              <button
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => {
                  setEditing([...b.cards]);
                  setName(b.name);
                }}
              >
                {t('build.edit')}
              </button>
              <button
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => {
                  deleteBuild(b.id);
                  setBuilds(loadBuilds());
                  setActive(getActiveBuildId());
                }}
              >
                {t('build.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑器 */}
      {editing && (
        <div className="build-editor">
          <div className="h-row" style={{ marginBottom: 10 }}>
            <input
              value={name}
              maxLength={16}
              placeholder={t('build.namePh')}
              onChange={(e) => setName(e.target.value)}
              style={{ width: 160 }}
            />
            <span className="tag">
              {editing.length}/{BUILD_SIZE}
            </span>
            <span style={{ flex: 1 }} />
            <button className="primary" onClick={doSave}>
              {t('build.save')}
            </button>
            <button onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </div>
          {error && <div className="err-text">{error}</div>}

          {/* 已选 10 槽 */}
          <div className="h-row" style={{ minHeight: 100, marginBottom: 12 }}>
            {Array.from({ length: BUILD_SIZE }).map((_, i) => {
              const id = editing[i];
              const def = id ? poolMap.get(id) : undefined;
              return (
                <div key={i} onClick={() => id && removeAt(i)} style={{ cursor: id ? 'pointer' : 'default' }}>
                  <CardView def={def} faceDown={!def} size="mini" />
                </div>
              );
            })}
          </div>

          {/* 卡池 */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <div className="h-row">
              {pool.map((c) => (
                <div key={c.id} style={{ textAlign: 'center' }} onClick={() => toggle(c.id)}>
                  <CardView
                    def={c}
                    size="mini"
                    glow={count(c.id) > 0 && count(c.id) < BUILD_MAX_COPIES}
                  />
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                    {count(c.id) > 0 ? `×${count(c.id)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 规则图鉴（教育性展示：让玩家开局前了解 World Rule 池） */
export function RulesCodex() {
  const { lang, t } = useI18n();
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 8px' }}>{t('codex.rules')}</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {WORLD_RULES.map((r) => (
          <div key={r.id} className="char-card" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 26 }}>{r.emoji}</span>
            <h4 style={{ margin: '6px 0 2px' }}>{worldRuleText(r.id, lang)?.name ?? r.name}</h4>
            <p style={{ margin: 0 }}>{worldRuleText(r.id, lang)?.description ?? r.description}</p>
          </div>
        ))}
      </div>
      <h3 style={{ margin: '16px 0 8px' }}>{t('codex.objectives')}</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {OBJECTIVES.map((o) => (
          <div key={o.id} className="char-card" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 26 }}>{o.emoji}</span>
            <h4 style={{ margin: '6px 0 2px' }}>{objectiveText(o.id, lang)?.name ?? o.name}</h4>
            <p style={{ margin: 0 }}>{objectiveText(o.id, lang)?.description ?? o.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
