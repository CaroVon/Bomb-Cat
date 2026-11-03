/** 环境配置：.env.local 可覆盖（VITE_ 前缀）；静态托管（Cloudflare Pages）可用运行时 /config.json 覆盖 */
const fallbackGameUrl = (): string =>
  import.meta.env.VITE_GAME_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;

/**
 * 游戏服务器地址（live binding：loadRuntimeConfig 之后各模块读到的是新值）。
 * 优先级：/config.json 的 gameUrl > VITE_GAME_URL > 按页面主机名推导 ws://host:2567
 */
export let GAME_SERVER_URL: string = fallbackGameUrl();

/**
 * 启动时读取运行时配置。用于 Cloudflare Pages：后端走 quick tunnel，地址每次重启都会变，
 * 脚本只需重新部署 config.json，无需重新构建前端。读取失败（本地开发/局域网）则保持默认。
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
    const cfg = (await res.json()) as { gameUrl?: unknown };
    if (typeof cfg.gameUrl === 'string' && /^wss?:\/\//.test(cfg.gameUrl)) {
      GAME_SERVER_URL = cfg.gameUrl;
    }
  } catch {
    // 无运行时配置：沿用默认
  }
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
