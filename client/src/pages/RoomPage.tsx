import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BUILTIN_CHARACTERS, MAX_PLAYERS, type DeckDef } from '@bombcat/shared';
import { eachPlayer, sendAct, useGame } from '../lib/game';
import { CLASSIC_DECK, loadDecks } from '../lib/decks';
import { getActiveBuild, loadBuilds, setActiveBuildId } from '../lib/builds';
import { CharacterSelect } from '../components/CharacterSelect';

export default function RoomPage() {
  const game = useGame();
  const navigate = useNavigate();
  const state = game.state;
  const decks = useMemo(loadDecks, []);
  const [deckId, setDeckId] = useState('classic');
  const builds = useMemo(loadBuilds, []);
  const [buildId, setBuildId] = useState(getActiveBuild()?.id ?? '');

  const myId = game.room?.sessionId ?? '';

  useEffect(() => {
    if (!game.room && game.status === 'idle') navigate('/lobby');
  }, [game.room, game.status, navigate]);

  // 开局后自动跳牌桌
  useEffect(() => {
    if (state?.phase === 'playing' || state?.phase === 'finished') {
      navigate('/game');
    }
  }, [state?.phase, navigate]);

  // 我的出战构筑：变更时提交/清除
  useEffect(() => {
    if (!game.room || state?.phase !== 'lobby') return;
    const build = builds.find((b) => b.id === buildId);
    setActiveBuildId(buildId);
    if (build) {
      sendAct({ action: 'setBuild', cardIds: build.cards });
    }
    // 无构筑时不清除服务端（开局才读；简化：只在有构筑时发送）
  }, [buildId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 房主选卡组时同步给服务器
  useEffect(() => {
    if (state?.hostSessionId !== myId) return;
    if (deckId === 'classic') {
      sendAct({ action: 'setDeck', deck: null });
    } else {
      const deck = decks.find((d) => d.id === deckId);
      if (deck) sendAct({ action: 'setDeck', deck });
    }
  }, [deckId, state?.hostSessionId, myId, decks]);

  if (!state) {
    return (
<div className="page page-room">
        <p className="muted">连接中……</p>
      </div>
    );
  }

  const isHost = state.hostSessionId === myId;
  const players: any[] = [];
  eachPlayer(state, (p: any) => players.push(p));

  return (
    <div className="page">
      <div className="h-row" style={{ marginBottom: 16 }}>
        <span className="title">等待室</span>
        <span className="tag">{players.length}/{MAX_PLAYERS} 人</span>
        {isHost && <span className="tag" style={{ borderColor: 'var(--accent)' }}>你是房主</span>}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              房间码（发给朋友，大厅输入即可加入）
            </div>
            <div className="room-code-big">{state.roomCode}</div>
          </div>

          <div className="panel">
            <h4 style={{ margin: '0 0 10px' }}>玩家</h4>
            {players.map((p) => {
              const ch = BUILTIN_CHARACTERS.find((c) => c.id === p.characterId);
              return (
                <div className="h-row" key={p.sessionId} style={{ padding: '6px 0', alignItems: 'center' }}>
                  <span
                    className="player-mini-avatar"
                    style={{
                      ['--av' as string]: `url(/assets/characters/${p.characterId || 'none'}.jpg)`,
                    }}
                  />
                  <span style={{ fontSize: 22, display: 'none' }}>{ch?.emoji ?? '🙂'}</span>
                  <span>{p.name}</span>
                  {p.isHost && <span className="tag">房主</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{ch?.name ?? '未选角色'}</span>
                  {!p.connected && <span className="tag" style={{ color: 'var(--danger)' }}>掉线</span>}
                </div>
              );
            })}
          </div>

          {isHost && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 10px' }}>卡组</h4>
              <div className="h-row">
                <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  <option value="classic">经典卡组</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}（自定义）
                    </option>
                  ))}
                </select>
                <Link
                  to="/editor"
                  className="muted"
                  style={{ fontSize: 13, textDecoration: 'none' }}
                >
                  去定制工坊编辑 →
                </Link>
              </div>
            </div>
          )}

          {/* 我的出战构筑（所有人可选） */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>🎴 我的出战构筑</h4>
            <div className="h-row">
              <select value={buildId} onChange={(e) => setBuildId(e.target.value)}>
                <option value="">经典发牌（无构筑）</option>
                {builds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}（10 张：6 入起手 / 4 入公共堆）
                  </option>
                ))}
              </select>
              <Link to="/editor" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>
                去编辑构筑 →
              </Link>
            </div>
            {buildId && (
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                ✅ 构筑已就绪：开局时 6 张随机进入你的起手，4 张洗入公共牌堆
              </p>
            )}
          </div>

          {isHost ? (
            <button
              className="primary"
              style={{ width: '100%', marginTop: 16, padding: '14px', fontSize: 17 }}
              disabled={players.length < 2}
              onClick={() => sendAct({ action: 'startGame' })}
            >
              {players.length < 2 ? '至少 2 人才能开始' : '开始游戏！'}
            </button>
          ) : (
            <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
              等待房主开始……
            </p>
          )}
        </div>

        <div className="panel">
          <h4 style={{ margin: '0 0 8px' }}>选择你的角色</h4>
          <CharacterSelect
            selectedId={players.find((p) => p.sessionId === myId)?.characterId ?? 'none'}
            onSelect={(id) => sendAct({ action: 'setCharacter', characterId: id })}
          />
        </div>
      </div>
    </div>
  );
}

export type { DeckDef };
