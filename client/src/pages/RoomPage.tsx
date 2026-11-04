import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BUILTIN_CHARACTERS, charText, classicDeckFor, MAX_PLAYERS, type DeckDef } from '@bombcat/shared';
import { useI18n } from '../i18n';
import { eachPlayer, sendAct, useGame } from '../lib/game';
import { loadDecks } from '../lib/decks';
import { getActiveBuild, loadBuilds, setActiveBuildId } from '../lib/builds';
import { CharacterSelect } from '../components/CharacterSelect';
import { portraitUrl } from '../lib/portraits';

export default function RoomPage() {
  const game = useGame();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const state = game.state;
  const decks = useMemo(loadDecks, []);
  const [deckId, setDeckId] = useState('classic');
  const builds = useMemo(loadBuilds, []);
  const [buildId, setBuildId] = useState(getActiveBuild()?.id ?? '');
  /** 开局补机器人至 N 人（0 = 不补；普通联机房，随 startGame 发给服务器） */
  const [fillTo, setFillTo] = useState(4);

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
        <p className="muted">{t('common.connecting')}</p>
      </div>
    );
  }

  const isHost = state.hostSessionId === myId;
  const players: any[] = [];
  eachPlayer(state, (p: any) => players.push(p));

  // 开局时的最终人数（含机器人补位）与经典卡组缩放后的牌堆构成
  const finalCount = Math.min(Math.max(players.length, fillTo), MAX_PLAYERS);
  const actionCards = Object.values(classicDeckFor(finalCount).counts).reduce((a, b) => a + b, 0);
  const botsToFill = Math.max(0, Math.min(fillTo, MAX_PLAYERS) - players.length);

  return (
    <div className="page page-room">
      <div className="h-row" style={{ marginBottom: 16 }}>
        <span className="title">{t('room.title')}</span>
        <span className="tag">{t('room.count', { n: players.length, max: MAX_PLAYERS })}</span>
        {isHost && <span className="tag" style={{ borderColor: 'var(--accent)' }}>{t('room.youHost')}</span>}
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
              {t('room.codeHint')}
            </div>
            <div className="room-code-big">{state.roomCode}</div>
          </div>

          <div className="panel">
            <h4 style={{ margin: '0 0 10px' }}>{t('room.players')}</h4>
            {players.map((p) => {
              const ch = BUILTIN_CHARACTERS.find((c) => c.id === p.characterId);
              return (
                <div className="h-row" key={p.sessionId} style={{ padding: '6px 0', alignItems: 'center' }}>
                  <span
                    className="player-mini-avatar"
                    style={{
                      ['--av' as string]: `url(${portraitUrl(p.characterId)})`,
                    }}
                  />
                  <span style={{ fontSize: 22, display: 'none' }}>{ch?.emoji ?? '🙂'}</span>
                  <span>{p.name}</span>
                  {p.isHost && <span className="tag">{t('room.host')}</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{ch ? charText(ch, lang).name : t('room.noChar')}</span>
                  {!p.connected && <span className="tag" style={{ color: 'var(--danger)' }}>{t('room.offline')}</span>}
                </div>
              );
            })}
          </div>

          {isHost && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 10px' }}>{t('room.deck')}</h4>
              <div className="h-row">
                <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  <option value="classic">{t('deck.classic')}</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {t('room.customDeck', { name: d.name })}
                    </option>
                  ))}
                </select>
                <Link
                  to="/editor"
                  className="muted"
                  style={{ fontSize: 13, textDecoration: 'none' }}
                >
                  {t('room.editInWorkshop')}
                </Link>
              </div>
              {deckId === 'classic' && (
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  {t('room.deckInfo', { n: finalCount, action: actionCards, bombs: finalCount + 2 })}
                </p>
              )}
              <div className="h-row" style={{ marginTop: 12 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  {t('room.fillBots')}
                </span>
                <select value={fillTo} onChange={(e) => setFillTo(Number(e.target.value))}>
                  <option value={0}>{t('room.noFill')}</option>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {t('room.nPlayers', { n })}
                    </option>
                  ))}
                </select>
              </div>
              {fillTo >= 2 && players.length < fillTo && (
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  {t('room.willFill', { n: players.length, bots: botsToFill })}
                </p>
              )}
            </div>
          )}

          {/* 我的出战构筑（所有人可选） */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>{t('room.myBuild')}</h4>
            <div className="h-row">
              <select value={buildId} onChange={(e) => setBuildId(e.target.value)}>
                <option value="">{t('room.noBuild')}</option>
                {builds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t('room.buildOpt', { name: b.name })}
                  </option>
                ))}
              </select>
              <Link to="/editor" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>
                {t('room.editBuild')}
              </Link>
            </div>
            {buildId && (
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                {t('room.buildReady')}
              </p>
            )}
          </div>

          {isHost ? (
            <button
              className="primary"
              style={{ width: '100%', marginTop: 16, padding: '14px', fontSize: 17 }}
              disabled={players.length < 2 && fillTo < 2}
              onClick={() => sendAct({ action: 'startGame', fillTo })}
            >
              {players.length < 2 && fillTo < 2 ? t('room.needTwo') : t('room.start')}
            </button>
          ) : (
            <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
              {t('room.waitHost')}
            </p>
          )}
        </div>

        <div className="panel">
          <h4 style={{ margin: '0 0 8px' }}>{t('room.pickChar')}</h4>
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
