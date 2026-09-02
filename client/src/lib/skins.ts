import type { SkinPack } from '@bombcat/shared';
import { supabase } from './supabase';

const LOCAL_KEY = 'bombcat:skinPacks';
const ACTIVE_KEY = 'bombcat:activeSkinPack';

export function loadSkinPacks(): SkinPack[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as SkinPack[];
  } catch {
    return [];
  }
}

function saveSkinPacksLocal(packs: SkinPack[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(packs));
}

export function getActiveSkinPackId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? '';
}

export function setActiveSkinPack(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function activeSkinMap(): Record<string, string> {
  const id = getActiveSkinPackId();
  if (!id) return {};
  return loadSkinPacks().find((p) => p.id === id)?.skins.reduce<Record<string, string>>(
    (acc, s) => {
      acc[s.cardId] = s.imageUrl;
      return acc;
    },
    {},
  ) ?? {};
}

/**
 * 保存皮肤包。dataURL 图片较大时仅存本地；
 * 配置了 Supabase 时上传到 card-faces bucket 并存 URL 到 skin_packs 表。
 */
export async function saveSkinPack(pack: SkinPack): Promise<void> {
  const packs = loadSkinPacks().filter((p) => p.id !== pack.id);
  packs.push(pack);
  saveSkinPacksLocal(packs);

  if (!supabase) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from('skin_packs').upsert(
      {
        id: pack.id,
        user_id: auth.user.id,
        name: pack.name,
        skins: pack.skins.filter((s) => !s.imageUrl.startsWith('data:')),
      },
      { onConflict: 'id' },
    );
    if (error) console.warn('皮肤包云端保存失败（不影响本地使用）:', error.message);
  } catch (e) {
    console.warn('皮肤包云端保存异常:', e);
  }
}

export function deleteSkinPack(id: string): void {
  saveSkinPacksLocal(loadSkinPacks().filter((p) => p.id !== id));
  if (getActiveSkinPackId() === id) setActiveSkinPack('');
}

/**
 * 图片压缩：canvas 缩放到最长边 maxSize、质量 0.82 的 JPEG dataURL。
 * 目标 ~100-200KB，规避 Supabase 收费的图片变换服务。
 */
export async function compressImage(file: File, maxSize = 720): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
