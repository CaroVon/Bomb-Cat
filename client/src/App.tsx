import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from './lib/game';
import { loadIdentity } from './lib/identity';

export default function App() {
  const game = useGame();
  const location = useLocation();
  const isGamePage = location.pathname === '/game';

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
      {!isGamePage && (
        <nav
          className="h-row"
          style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
        >
          <Link to="/lobby" style={{ textDecoration: 'none', color: 'var(--gold)', fontWeight: 800 }}>
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
      {/* 页面切换过渡（M3 emphasized 300ms + blur） */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
