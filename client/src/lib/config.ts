/** 环境配置：.env.local 可覆盖（VITE_ 前缀） */
export const GAME_SERVER_URL =
  import.meta.env.VITE_GAME_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
