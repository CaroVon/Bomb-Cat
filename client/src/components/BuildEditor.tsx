import { useMemo, useState } from 'react';
import {
  BUILTIN_CARDS,
  BUILD_MAX_COPIES,
  BUILD_SIZE,
  OBJECTIVES,
  WORLD_RULES,
  type CardDef,
} from '@bombcat/shared';
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
      setError(`还差 ${BUILD_SIZE - editing.length} 张（构筑必须恰好 ${BUILD_SIZE} 张）`);
      return;
    }
    const build: PersonalBuild = {
      id: `build-${Date.now()}`,
      name: name.trim() || `构筑 ${builds.length + 1}`,
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
        <h3 style={{ margin: 0 }}>🎴 出战构筑</h3>
        <button
          className="primary"
          onClick={() => {
            setEditing([]);
            setName('');
            setError('');
          }}
        >
          新建构筑
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        选 {BUILD_SIZE} 张牌带入游戏：6 张随机进入你的起手（构筑身份），4 张洗入公共牌堆影响全局。等待室选用后开局生效。
      </p>

      {/* 我的构筑列表 */}
      <div className="h-row" style={{ marginBottom: 12 }}>
        {builds.length === 0 && <span className="muted" style={{ fontSize: 13 }}>还没有构筑</span>}
        {builds.map((b) => (
          <div key={b.id} className="char-card" style={{ minWidth: 160 }}>
            <h4 style={{ margin: '0 0 4px' }}>{b.name}</h4>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              {b.cards.length} 张
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
                {active === b.id ? '使用中' : '启用'}
              </button>
              <button
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => {
                  setEditing([...b.cards]);
                  setName(b.name);
                }}
              >
                改
              </button>
              <button
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => {
                  deleteBuild(b.id);
                  setBuilds(loadBuilds());
                  setActive(getActiveBuildId());
                }}
              >
                删
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
              placeholder="构筑名称"
              onChange={(e) => setName(e.target.value)}
              style={{ width: 160 }}
            />
            <span className="tag">
              {editing.length}/{BUILD_SIZE}
            </span>
            <span style={{ flex: 1 }} />
            <button className="primary" onClick={doSave}>
              保存构筑
            </button>
            <button onClick={() => setEditing(null)}>取消</button>
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
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 8px' }}>🎲 本局规则池（每局随机一条）</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {WORLD_RULES.map((r) => (
          <div key={r.id} className="char-card" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 26 }}>{r.emoji}</span>
            <h4 style={{ margin: '6px 0 2px' }}>{r.name}</h4>
            <p style={{ margin: 0 }}>{r.description}</p>
          </div>
        ))}
      </div>
      <h3 style={{ margin: '16px 0 8px' }}>🎯 秘密任务池（每人随机一条，达成 +50 分）</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {OBJECTIVES.map((o) => (
          <div key={o.id} className="char-card" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 26 }}>{o.emoji}</span>
            <h4 style={{ margin: '6px 0 2px' }}>{o.name}</h4>
            <p style={{ margin: 0 }}>{o.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
