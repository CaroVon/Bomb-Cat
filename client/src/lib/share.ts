import { validateDeck, type DeckDef } from '@bombcat/shared';

/**
 * 卡组分享码（EK2 v2.0 Deck Creator 分享机制的开源等价物）：
 * `BM1.<base64url(JSON{v,n,c,k})>`——把自定义卡组编码成可粘贴的短码，
 * 好友导入后无需任何服务端配置即可游玩。
 */

const PREFIX = 'BM1.';

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDeck(deck: DeckDef): string {
  const payload = {
    v: 1,
    n: deck.name,
    c: deck.counts,
    k: deck.customCards.length ? deck.customCards : undefined,
  };
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

export interface DecodeResult {
  ok: boolean;
  deck?: DeckDef;
  error?: string;
}

export function decodeDeck(code: string): DecodeResult {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return { ok: false, error: '不是有效的卡组码（应以 BM1. 开头）' };
  }
  try {
    const payload = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length))) as {
      n?: string;
      c?: Record<string, number>;
      k?: DeckDef['customCards'];
    };
    if (!payload.n || !payload.c) {
      return { ok: false, error: '卡组码内容不完整' };
    }
    const deck: DeckDef = {
      id: `shared-${Date.now()}`,
      name: String(payload.n).slice(0, 24),
      customCards: Array.isArray(payload.k) ? payload.k : [],
      counts: payload.c,
    };
    const r = validateDeck(deck, 3);
    if (!r.ok) {
      return { ok: false, error: `卡组不合法：${r.errors.slice(0, 2).join('；')}` };
    }
    return { ok: true, deck };
  } catch {
    return { ok: false, error: '卡组码解析失败（已损坏或被截断）' };
  }
}
