import { CLASSIC_DECK, type DeckDef } from '@bombcat/shared';
import { supabase } from './supabase';

const LOCAL_KEY = 'bombcat:customDecks';

/** 已下架的卡（精准攻击已删除）：读取旧存档时自动剔除，避免校验报错 */
const RETIRED_CARDS = new Set(['targetedAttack']);

export function loadDecks(): DeckDef[] {
  try {
    const decks = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as DeckDef[];
    return decks.map((d) =>
      d.counts && Object.keys(d.counts).some((id) => RETIRED_CARDS.has(id))
        ? {
            ...d,
            counts: Object.fromEntries(
              Object.entries(d.counts).filter(([id]) => !RETIRED_CARDS.has(id)),
            ),
          }
        : d,
    );
  } catch {
    return [];
  }
}

export async function saveDeck(deck: DeckDef): Promise<void> {
  const decks = loadDecks().filter((d) => d.id !== deck.id);
  decks.push(deck);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(decks));

  if (!supabase) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from('card_sets').upsert(
      { id: deck.id, user_id: auth.user.id, name: deck.name, deck },
      { onConflict: 'id' },
    );
    if (error) console.warn('卡组云端保存失败（不影响本地使用）:', error.message);
  } catch (e) {
    console.warn('卡组云端保存异常:', e);
  }
}

export function deleteDeck(id: string): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(loadDecks().filter((d) => d.id !== id)));
}

export { CLASSIC_DECK };
