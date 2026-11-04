import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from './lib/game';
import { loadIdentity } from './lib/identity';
import { useI18n } from './i18n';
import LangToggle from './i18n/LangToggle';

export default function App() {
  const game = useGame();
  const { t } = useI18n();
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
          className="h-row app-nav"
          style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
        >
          <Link to="/lobby" style={{ textDecoration: 'none', color: 'var(--gold)', fontWeight: 800 }}>
            💥 {t('app.title')}
          </Link>
          <Link to="/lobby" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
            {t('nav.lobby')}
          </Link>
          <Link to="/editor" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
            {t('nav.editor')}
          </Link>
          {game.room && (
            <Link to="/room" className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>
              {t('nav.room')}
            </Link>
          )}
          <span style={{ flex: 1 }} />
          <LangToggle />
          <span className="tag">{game.status === 'in-room' ? t('nav.connected') : t('nav.disconnected')}</span>
        </nav>
      )}
      {/* 页面切换过渡（暂时禁用以排查测试问题） */}
      <Outlet />
    </>
  );
}
