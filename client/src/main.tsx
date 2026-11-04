import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import GamePage from './pages/GamePage';
import EditorPage from './pages/EditorPage';
import { unlockAudio } from './lib/sound';
import { loadRuntimeConfig } from './lib/config';
import { LangProvider } from './i18n';
import './styles.css';
import './theme.css';

// 浏览器音频策略：首次用户手势解锁 AudioContext（一次即可）
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <LoginPage /> },
      { path: 'lobby', element: <LobbyPage /> },
      { path: 'room', element: <RoomPage /> },
      { path: 'game', element: <GamePage /> },
      { path: 'editor', element: <EditorPage /> },
    ],
  },
]);

// 先读运行时配置（Cloudflare Pages 的 /config.json 指向当前后端隧道），再渲染
void loadRuntimeConfig().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider>
        <RouterProvider router={router} />
      </LangProvider>
    </StrictMode>,
  );
});
