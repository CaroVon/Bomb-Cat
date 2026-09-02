import { CLASSIC_DECK, type DeckDef } from '@bombcat/shared';
import { supabase } from './supabase';

const LOCAL_KEY = 'bombcat:customDecks';

export function loadDecks(): DeckDef[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as DeckDef[];
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
