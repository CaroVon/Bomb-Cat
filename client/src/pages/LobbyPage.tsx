import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { autoReconnect, createRoom, joinRoom, quickMatch, snapPhase, useGame } from '../lib/game';
import { loadIdentity } from '../lib/identity';
import { fetchLeaderboard, loadCareer, type LeaderRow } from '../lib/stats';
import { getBestStage, startRunStage } from '../lib/run';
import { AnimatedNumber } from '../components/AnimatedNumber';

export default function LobbyPage() {
  const navigate = useNavigate();
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
      setError('请输入 4 位房间码');
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
    else setError('重连失败，房间可能已解散');
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
        <span className="title">游戏大厅</span>
        <span className="tag">你好，{identity?.name}</span>
      </div>

      {game.reconnectHint && (
        <div className="panel" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <div className="h-row">
            <span>检测到中断的对局</span>
            <button className="danger" onClick={handleReconnect} disabled={busy}>
              重新连接
            </button>
          </div>
        </div>
      )}

      <div
        className="lobby-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}
      >
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>创建房间</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            成为房主，获得 4 位房间码，最多可邀请 7 位朋友同场对战。
          </p>
          <button className="primary" onClick={handleCreate} disabled={busy}>
            创建房间
          </button>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>单人 & 匹配</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            和两个 AI 猫咪即刻开局练手；或匹配其他玩家（15 秒凑不齐自动补 AI）。
          </p>
          <div className="h-row">
            <button onClick={handlePractice} disabled={busy}>
              🤖 人机练习
            </button>
            <button onClick={handleQuick} disabled={busy}>
              ⚡ 快速匹配
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
              🔥 无尽挑战（Roguelike）
            </button>
            {getBestStage() > 0 && (
              <span className="tag">历史最佳：第 {getBestStage()} 关</span>
            )}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>加入房间</h3>
          <div className="h-row" style={{ margin: '12px 0' }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="房间码"
              style={{ width: 140, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
            />
            <button onClick={handleJoin} disabled={busy}>
              加入
            </button>
          </div>
          {error && <div className="err-text">{error}</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <CareerPanel />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>玩法速览</h3>
        <p className="muted" style={{ fontSize: 13, lineHeight: 2 }}>
          轮到你时可以出任意数量的牌，然后摸一张牌结束回合。牌堆里混着爆炸猫——摸到它而没有拆解，你就出局了！
          <br />
          攻击⚡让对方连走两回合；跳过🚫免摸牌；求赠🎁偷牌；否认❌可以否定别人刚打出的牌（8 秒窗口内）；
          两张同名普通猫偷随机牌，三张指名偷牌；万能猫🐈‍⬛可通配组合；果奔猫🐱‍💨能把爆炸猫藏进手牌。
          选个角色，用专属技能整活吧。
        </p>
      </div>
    </div>
  );
}

/* ==================== 战绩 / 排行榜 ==================== */

function CareerPanel() {
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
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>📊 我的战绩</h3>
      <div className="h-row" style={{ gap: 22 }}>
        <span>
          <strong style={{ fontSize: 22, color: 'var(--gold)' }}><AnimatedNumber value={career.points} /></strong>
          <span className="muted" style={{ fontSize: 12 }}> 积分</span>
        </span>
        <span>
          <strong style={{ fontSize: 22 }}><AnimatedNumber value={career.games} /></strong>
          <span className="muted" style={{ fontSize: 12 }}> 局</span>
        </span>
        <span>
          <strong style={{ fontSize: 22 }}>{career.wins}</strong>
          <span className="muted" style={{ fontSize: 12 }}> 胜（{winRate}%）</span>
        </span>
        {Object.entries(career.places)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([place, n]) => (
            <span key={place} className="tag">
              第 {place} 名 ×{n}
            </span>
          ))}
      </div>

      <h3 style={{ margin: '16px 0 8px' }}>🏆 排行榜{board === null ? '（未连接云端）' : ''}</h3>
      {board === 'loading' && <p className="muted" style={{ fontSize: 13 }}>加载中……</p>}
      {board === null && (
        <p className="muted" style={{ fontSize: 13 }}>
          配置 Supabase 后可与朋友共享云端排行（见 supabase/README.md）；当前仅本地统计。
        </p>
      )}
      {Array.isArray(board) && board.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>还没有云端对局记录，先来一局？</p>
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
                {row.wins} 胜 / {row.games} 局 · <strong style={{ color: 'var(--gold)' }}>{row.points} 分</strong>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
