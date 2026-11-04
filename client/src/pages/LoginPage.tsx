import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPABASE_ENABLED } from '../lib/config';
import { clearIdentity, loadIdentity, rememberedName, saveIdentity } from '../lib/identity';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const existing = loadIdentity();
  const [name, setName] = useState(existing?.name || rememberedName());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function guestContinue() {
    if (!name.trim()) {
      setError(t('login.needName'));
      return;
    }
    saveIdentity({ name: name.trim(), mode: 'guest' });
    navigate('/lobby');
  }

  async function supabaseAuth() {
    setError('');
    setBusy(true);
    try {
      if (!supabase) throw new Error(t('login.noSupabase'));
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
    <div className="page page-login">
      <div className="auth-box panel">
        <div className="title" style={{ marginBottom: 4 }}>
          💥 {t('app.title')}
        </div>
        <div className="muted" style={{ marginBottom: 18, fontSize: 14 }}>
          {t('login.tagline')}
        </div>

        <div className="field">
          <label>{t('login.nickname')}</label>
          <input
            value={name}
            maxLength={16}
            placeholder={t('login.nicknamePh')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {SUPABASE_ENABLED ? (
          <>
            <div className="h-row" style={{ marginBottom: 12 }}>
              <span className="tag">{t('login.accountMode')}</span>
              <button
                style={{ padding: '4px 12px' }}
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? t('login.toRegister') : t('login.toLogin')}
              </button>
            </div>
            <div className="field">
              <label>{t('login.email')}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>{t('login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPh')}
              />
            </div>
            {error && <div className="err-text">{error}</div>}
            <div className="h-row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={supabaseAuth} disabled={busy}>
                {mode === 'login' ? t('login.login') : t('login.register')}
              </button>
              <button onClick={guestContinue}>{t('login.guest')}</button>
            </div>
          </>
        ) : (
          <>
            {error && <div className="err-text">{error}</div>}
            <button className="primary" style={{ width: '100%' }} onClick={guestContinue}>
              {t('login.enter')}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
              {t('login.guestOnly')}
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
            {t('login.clearIdentity', { name: existing.name })}
          </button>
        )}
      </div>
    </div>
  );
}
