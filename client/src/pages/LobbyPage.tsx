import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { autoReconnect, createRoom, joinRoom, snapPhase, useGame } from '../lib/game';
import { loadIdentity } from '../lib/identity';

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

  return (
    <div className="page">
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
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}
      >
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>创建房间</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            成为房主，获得 4 位房间码，可自定义卡组、邀请最多 4 位朋友。
          </p>
          <button className="primary" onClick={handleCreate} disabled={busy}>
            创建房间
          </button>
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
        <h3 style={{ marginTop: 0 }}>玩法速览</h3>
        <p className="muted" style={{ fontSize: 13, lineHeight: 2 }}>
          轮到你时可以出任意数量的牌，然后摸一张牌结束回合。牌堆里混着爆炸猫——摸到它而没有拆解，你就出局了！
          <br />
          攻击⚡让对方连走两回合；跳过🚫免摸牌；求赠🎁偷牌；否认❌可以否定别人刚打出的牌（8 秒窗口内）；
          两张同名普通猫偷随机牌，三张指名偷牌。选个角色，用专属技能整活吧。
        </p>
      </div>
    </div>
  );
}
