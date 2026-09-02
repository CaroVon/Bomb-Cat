import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedUser {
  mode: 'guest' | 'supabase';
  userId: string;
  name: string;
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
if (SUPABASE_JWKS_URL) {
  jwks = createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));
}

/**
 * 校验加入房间的身份。
 * - 配置了 SUPABASE_JWT_SECRET（HS256 legacy）或 SUPABASE_JWKS_URL（RS256 新式密钥）
 *   时，mode=supabase 的 token 必须验签通过。
 * - 未配置任何密钥（本地开发/纯游客模式）时放行所有人，userId 由客户端自报。
 */
export async function verifyJoinIdentity(input: {
  mode?: string;
  token?: string;
  name?: string;
}): Promise<VerifiedUser> {
  const safeName = (s: string | undefined, fallback: string) =>
    (s ?? '').replace(/[^\p{L}\p{N}_\-\s.]/gu, '').trim().slice(0, 16) || fallback;

  if (input.mode === 'supabase' && input.token) {
    if (!SUPABASE_JWT_SECRET && !jwks) {
      // 服务端未配置 Supabase 密钥：降级为游客，但保留其声明的身份
      return {
        mode: 'guest',
        userId: `guest:${input.token.slice(-12)}`,
        name: safeName(input.name, '玩家'),
      };
    }
    try {
      const key = jwks
        ? jwks
        : new TextEncoder().encode(SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(input.token, key, {
        algorithms: jwks ? ['RS256', 'ES256'] : ['HS256'],
      });
      const p = payload as JWTPayload & { user_metadata?: { name?: string; full_name?: string } };
      const name = safeName(
        p.user_metadata?.name ?? p.user_metadata?.full_name ?? input.name,
        '玩家',
      );
      return { mode: 'supabase', userId: p.sub ?? 'unknown', name };
    } catch {
      throw new Error('登录凭证无效或已过期，请重新登录');
    }
  }

  // 游客模式
  const guestKey = (input.name ?? '').trim().slice(0, 16) || `guest-${Date.now() % 10000}`;
  return {
    mode: 'guest',
    userId: `guest:${encodeURIComponent(guestKey)}`,
    name: safeName(input.name, `玩家${Math.floor(Math.random() * 900 + 100)}`),
  };
}
