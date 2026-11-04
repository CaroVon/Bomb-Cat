import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { autoReconnect, createRoom, joinRoom, quickMatch, snapPhase, useGame } from '../lib/game';
import { loadIdentity } from '../lib/identity';
import { fetchLeaderboard, loadCareer, type LeaderRow } from '../lib/stats';
import { getBestStage, startRunStage } from '../lib/run';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { useI18n } from '../i18n';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const game = useGame();
  const identity = loadIdentity();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 页面刷新后自动恢复中断的对局（sessionStorage 保存的重连凭据）
  useEffect(() => {
    let cancelled = false;
    void autoReconnect().then((ok) => {
      if (!ok || cancelled) return;
      const phase = snapPhase();
      navigate(phase === 'playing' || phase === 'finished' ? '/game' : '/room');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 已在房间里（如从牌桌返回）直接进房间页
  useEffect(() => {
    if (game.room && game.status === 'in-room' && !error) {
      navigate('/room');
    }
  }, [game.room, game.status, navigate, error]);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      await createRoom(identity!.name);
      navigate('/room');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (code.trim().length < 3) {
      setError(t('lobby.codeNeeded'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await joinRoom(code, identity!.name);
      navigate('/room');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReconnect() {
    setBusy(true);
    const ok = await autoReconnect();
    setBusy(false);
    if (ok) navigate('/game');
    else setError(t('lobby.reconnectFail'));
  }

  async function handlePractice() {
    setBusy(true);
    setError('');
    try {
      await createRoom(identity!.name, { bots: 2 });
      navigate('/room');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuick() {
    setBusy(true);
    setError('');
    try {
      await quickMatch(identity!.name);
      navigate('/room');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-lobby">
      <div className="h-row" style={{ marginBottom: 20 }}>
        <span className="title">{t('lobby.title')}</span>
        <span className="tag">{t('lobby.hello', { name: identity?.name ?? '' })}</span>
      </div>

      {game.reconnectHint && (
        <div className="panel" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <div className="h-row">
            <span>{t('lobby.interrupted')}</span>
            <button className="danger" onClick={handleReconnect} disabled={busy}>
              {t('lobby.reconnect')}
            </button>
          </div>
        </div>
      )}

      <div
        className="lobby-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}
      >
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{t('lobby.create')}</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            {t('lobby.createDesc')}
          </p>
          <button className="primary" onClick={handleCreate} disabled={busy}>
            {t('lobby.create')}
          </button>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{t('lobby.solo')}</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            {t('lobby.soloDesc')}
          </p>
          <div className="h-row">
            <button onClick={handlePractice} disabled={busy}>
              {t('lobby.practice')}
            </button>
            <button onClick={handleQuick} disabled={busy}>
              {t('lobby.quick')}
            </button>
          </div>
          <div className="h-row" style={{ marginTop: 10 }}>
            <button
              className="action-combo"
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await startRunStage(1, []);
                  navigate('/room');
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {t('lobby.run')}
            </button>
            {getBestStage() > 0 && (
              <span className="tag">{t('lobby.bestStage', { n: getBestStage() })}</span>
            )}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{t('lobby.join')}</h3>
          <div className="h-row" style={{ margin: '12px 0' }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder={t('lobby.codePh')}
              style={{ width: 140, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
            />
            <button onClick={handleJoin} disabled={busy}>
              {t('lobby.joinBtn')}
            </button>
          </div>
          {error && <div className="err-text">{error}</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <CareerPanel />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('lobby.howTo')}</h3>
        <p className="muted" style={{ fontSize: 13, lineHeight: 2 }}>
          {t('lobby.howTo1')}
          <br />
          {t('lobby.howTo2')}
        </p>
      </div>
    </div>
  );
}

/* ==================== 战绩 / 排行榜 ==================== */

function CareerPanel() {
  const { t } = useI18n();
  const career = loadCareer();
  const [board, setBoard] = useState<LeaderRow[] | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard().then((rows) => {
      if (!cancelled) setBoard(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const winRate = career.games > 0 ? Math.round((career.wins / career.games) * 100) : 0;

  return (
    <>
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>{t('career.title')}</h3>
      <div className="h-row" style={{ gap: 22 }}>
        <span>
          <strong style={{ fontSize: 22, color: 'var(--gold)' }}><AnimatedNumber value={career.points} /></strong>
          <span className="muted" style={{ fontSize: 12 }}> {t('career.points')}</span>
        </span>
        <span>
          <strong style={{ fontSize: 22 }}><AnimatedNumber value={career.games} /></strong>
          <span className="muted" style={{ fontSize: 12 }}> {t('career.games')}</span>
        </span>
        <span>
          <strong style={{ fontSize: 22 }}>{career.wins}</strong>
          <span className="muted" style={{ fontSize: 12 }}> {t('career.wins', { rate: winRate })}</span>
        </span>
        {Object.entries(career.places)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([place, n]) => (
            <span key={place} className="tag">
              {t('career.place', { place, n })}
            </span>
          ))}
      </div>

      <h3 style={{ margin: '16px 0 8px' }}>{t('career.board')}{board === null ? t('career.offline') : ''}</h3>
      {board === 'loading' && <p className="muted" style={{ fontSize: 13 }}>{t('common.loading')}</p>}
      {board === null && (
        <p className="muted" style={{ fontSize: 13 }}>
          {t('career.noCloud')}
        </p>
      )}
      {Array.isArray(board) && board.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{t('career.empty')}</p>
      )}
      {Array.isArray(board) && board.length > 0 && (
        <div style={{ lineHeight: 2 }}>
          {board.map((row, i) => (
            <div key={row.name + i} className="h-row" style={{ justifyContent: 'space-between', maxWidth: 420 }}>
              <span>
                <span className="muted" style={{ width: 22, display: 'inline-block' }}>
                  {i + 1}.
                </span>
                {row.name}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('career.row', { wins: row.wins, games: row.games })} · <strong style={{ color: 'var(--gold)' }}>{t('career.rowPts', { n: row.points })}</strong>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
