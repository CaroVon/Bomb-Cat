import type { DeckDef } from '@bombcat/shared';
import { supabase } from './supabase';
import { loadIdentity } from './identity';
import { tr } from '../i18n';

/**
 * 积分榜（轻量方案）：
 * - 本地生涯战绩（localStorage，游客也有）
 * - 配置 Supabase 且登录时，对局结束上报 match_history，大厅拉排行榜
 */

const KEY = 'bombcat:career';

export interface Career {
  games: number;
  wins: number;
  /** 各名次次数 */
  places: Record<number, number>;
  /** 累计积分：第 1 名 100，第 2 名 50，第 3 名 25，其余 10 */
  points: number;
  updatedAt: number;
}

const EMPTY: Career = { games: 0, wins: 0, places: {}, points: 0, updatedAt: 0 };

export function loadCareer(): Career {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...EMPTY };
  }
}

export function placePoints(place: number, players: number): number {
  if (place === 1) return 100;
  if (place === 2) return players >= 4 ? 50 : 30;
  if (place === 3) return 25;
  return 10;
}

/** 对局结束记录战绩（本地必记；登录+Supabase 时云端上报） */
export async function recordMatch(result: {
  place: number;
  playerCount: number;
  deckName: string;
  characterId: string;
}): Promise<void> {
  const c = loadCareer();
  c.games += 1;
  if (result.place === 1) c.wins += 1;
  c.places[result.place] = (c.places[result.place] ?? 0) + 1;
  c.points += placePoints(result.place, result.playerCount);
  c.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(c));

  if (!supabase) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const identity = loadIdentity();
    await supabase.from('match_history').insert({
      user_id: auth.user.id,
      display_name: identity?.name ?? '',
      deck_name: result.deckName,
      character_id: result.characterId,
      place: result.place,
      player_count: result.playerCount,
    });
  } catch (e) {
    console.warn('战绩云端上报失败（不影响本地）:', e);
  }
}

export interface LeaderRow {
  name: string;
  points: number;
  games: number;
  wins: number;
}

/** 云端排行榜：拉最近 500 条聚合（个人项目规模足够） */
export async function fetchLeaderboard(): Promise<LeaderRow[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('match_history')
      .select('display_name, place, player_count')
      .order('played_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const agg = new Map<string, LeaderRow>();
    for (const row of (data ?? []) as { display_name: string; place: number; player_count: number }[]) {
      const name = row.display_name || tr('stats.anonymous');
      const cur = agg.get(name) ?? { name, points: 0, games: 0, wins: 0 };
      cur.games += 1;
      if (row.place === 1) cur.wins += 1;
      cur.points += placePoints(row.place, row.player_count);
      agg.set(name, cur);
    }
    return [...agg.values()].sort((a, b) => b.points - a.points).slice(0, 10);
  } catch (e) {
    console.warn('排行榜拉取失败:', e);
    return null;
  }
}
