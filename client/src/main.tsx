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
import './styles.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
