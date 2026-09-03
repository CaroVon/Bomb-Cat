import { BUILD_SIZE, validateBuild, type CardDef } from '@bombcat/shared';
import { BUILTIN_CARD_MAP } from '@bombcat/shared';
import { supabase } from './supabase';
import { loadDecks } from './decks';

/**
 * 个人出战构筑（与"卡组"不同：卡组是全桌牌表，构筑是"我是谁/我带什么"的玩家身份）。
 * 10 张自选 → 6 张随机入起手 + 4 张洗入公共堆。
 */

const LOCAL_KEY = 'bombcat:builds';
const ACTIVE_KEY = 'bombcat:activeBuild';

export interface PersonalBuild {
  id: string;
  name: string;
  cards: string[]; // 10 张 cardId
}

export function loadBuilds(): PersonalBuild[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as PersonalBuild[];
    return raw.filter((b) => Array.isArray(b.cards) && b.cards.length === BUILD_SIZE);
  } catch {
    return [];
  }
}

function saveLocal(list: PersonalBuild[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

export function saveBuild(build: PersonalBuild): string | null {
  const err = validateBuildLocally(build.cards);
  if (err) return err;
  const list = loadBuilds().filter((b) => b.id !== build.id);
  list.push(build);
  saveLocal(list);
  void syncToCloud(build);
  return null;
}

export function deleteBuild(id: string): void {
  saveLocal(loadBuilds().filter((b) => b.id !== id));
  if (getActiveBuildId() === id) setActiveBuildId('');
}

export function getActiveBuildId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? '';
}

export function setActiveBuildId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveBuild(): PersonalBuild | null {
  const id = getActiveBuildId();
  return loadBuilds().find((b) => b.id === id) ?? null;
}

/** 本地可用卡池（内置 + 我的自定义卡组的卡） */
export function localCardPool(): Map<string, CardDef> {
  const pool = new Map(BUILTIN_CARD_MAP);
  for (const deck of loadDecks()) {
    for (const c of deck.customCards) pool.set(c.id, c);
  }
  return pool;
}

export function validateBuildLocally(cards: string[]): string | null {
  const r = validateBuild(cards, localCardPool());
  return r.ok ? null : (r.error ?? '构筑不合法');
}

async function syncToCloud(build: PersonalBuild): Promise<void> {
  if (!supabase) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    // 复用 card_sets 表，deck 字段存 { cards } 结构以区分类别
    await supabase.from('card_sets').upsert(
      {
        id: build.id,
        user_id: auth.user.id,
        name: `构筑：${build.name}`,
        deck: { kind: 'personal-build', cards: build.cards },
      },
      { onConflict: 'id' },
    );
  } catch (e) {
    console.warn('构筑云端同步失败（不影响本地）:', e);
  }
}
