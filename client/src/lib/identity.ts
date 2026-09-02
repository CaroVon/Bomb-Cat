import { SUPABASE_ENABLED } from './config';

/**
 * 身份存 sessionStorage：同一浏览器的多个标签页各自独立，
 * 本机多开即可模拟多名玩家（真实场景每人一台设备，同样成立）。
 * localStorage 只记住上次的昵称作为默认值。
 */
const SESSION_KEY = 'bombcat:identity';
const NAME_KEY = 'bombcat:lastName';

export interface Identity {
  name: string;
  mode: 'guest' | 'supabase';
  email?: string;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Identity;
  } catch {
    return null;
  }
}

export function rememberedName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function saveIdentity(identity: Identity): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  localStorage.setItem(NAME_KEY, identity.name);
}

export function clearIdentity(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(NAME_KEY);
}

/** 加入房间时携带的身份参数 */
export async function joinOptions(name: string): Promise<Record<string, unknown>> {
  if (SUPABASE_ENABLED) {
    const { getAccessToken } = await import('./supabase');
    const token = await getAccessToken();
    if (token) return { mode: 'supabase', token, name };
  }
  return { mode: 'guest', name };
}
