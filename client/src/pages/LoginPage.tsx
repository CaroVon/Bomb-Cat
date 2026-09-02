import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPABASE_ENABLED } from '../lib/config';
import { clearIdentity, loadIdentity, rememberedName, saveIdentity } from '../lib/identity';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const existing = loadIdentity();
  const [name, setName] = useState(existing?.name || rememberedName());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function guestContinue() {
    if (!name.trim()) {
      setError('先给自己起个名字');
      return;
    }
    saveIdentity({ name: name.trim(), mode: 'guest' });
    navigate('/lobby');
  }

  async function supabaseAuth() {
    setError('');
    setBusy(true);
    try {
      if (!supabase) throw new Error('Supabase 未配置');
      const fn =
        mode === 'login'
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error: err } = await fn;
      if (err) throw err;
      saveIdentity({
        name: name.trim() || email.split('@')[0]!,
        mode: 'supabase',
        email,
      });
      navigate('/lobby');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="auth-box panel">
        <div className="title" style={{ marginBottom: 4 }}>
          💥 炸弹猫
        </div>
        <div className="muted" style={{ marginBottom: 18, fontSize: 14 }}>
          联机 · 深度定制 · 和朋友的照片一起玩
        </div>

        <div className="field">
          <label>昵称（游客与登录都需要）</label>
          <input
            value={name}
            maxLength={16}
            placeholder="比如：猫王"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {SUPABASE_ENABLED ? (
          <>
            <div className="h-row" style={{ marginBottom: 12 }}>
              <span className="tag">账号模式</span>
              <button
                style={{ padding: '4px 12px' }}
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? '切换到注册' : '切换到登录'}
              </button>
            </div>
            <div className="field">
              <label>邮箱</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            {error && <div className="err-text">{error}</div>}
            <div className="h-row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={supabaseAuth} disabled={busy}>
                {mode === 'login' ? '登录' : '注册并登录'}
              </button>
              <button onClick={guestContinue}>以游客身份进入</button>
            </div>
          </>
        ) : (
          <>
            {error && <div className="err-text">{error}</div>}
            <button className="primary" style={{ width: '100%' }} onClick={guestContinue}>
              进入大厅
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
              当前为纯游客模式（未配置 Supabase）。配置 VITE_SUPABASE_URL /
              VITE_SUPABASE_ANON_KEY 后可启用账号、云端卡组与照片卡面同步。
            </p>
          </>
        )}

        {existing && (
          <button
            className="muted"
            style={{ marginTop: 10, fontSize: 12, padding: '4px 10px', background: 'none', border: 'none' }}
            onClick={() => {
              clearIdentity();
              setName('');
            }}
          >
            清除本地身份（{existing.name}）
          </button>
        )}
      </div>
    </div>
  );
}
