import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useGame } from './lib/game';
import { loadIdentity } from './lib/identity';

export default function App() {
  const game = useGame();
  const location = useLocation();

  // 未登录只能停在首页
  useEffect(() => {
    const identity = loadIdentity();
    if (!identity && location.pathname !== '/') {
      window.location.hash = '';
      window.location.replace('/');
    }
  }, [location.pathname]);

  return (
    <>
      {location.pathname !== '/game' && (
        <nav
          className="h-row"
          style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
        >
          <Link to="/lobby" style={{ textDecoration: 'none', color: 'var(--accent)', fontWeight: 800 }}>
            💥 炸弹猫
          </Link>
          <Link to="/lobby" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
            大厅
          </Link>
          <Link to="/editor" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
            定制工坊
          </Link>
          {game.room && (
            <Link to="/room" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
              房间
            </Link>
          )}
          <span style={{ flex: 1 }} />
          <span className="tag">{game.status === 'in-room' ? '已连接' : '未连接'}</span>
        </nav>
      )}
      <Outlet />
    </>
  );
}
