import { describe, expect, it } from 'vitest';
import { CLASSIC_DECK, BUILTIN_CARD_MAP } from '../src/cards';
import { validateDeck } from '../src/validation';
import type { CardDef, DeckDef } from '../src/types';

const customCard = (over: Partial<CardDef> = {}): CardDef => ({
  id: 'custom:test',
  name: '测试卡',
  kind: 'action',
  emoji: '🧪',
  description: '测试用',
  effects: [{ type: 'shuffle' }],
  ...over,
});

describe('validateDeck', () => {
  it('接受经典卡组', () => {
    const r = validateDeck(CLASSIC_DECK, 4);
    expect(r.ok).toBe(true);
  });

  it('拒绝试图定义爆炸猫数量', () => {
    const r = validateDeck({ ...CLASSIC_DECK, explodingCount: 5 }, 4);
    expect(r.ok).toBe(false);
  });

  it('拒绝不带 custom: 前缀的自定义卡', () => {
    const deck: DeckDef = {
      ...CLASSIC_DECK,
      customCards: [customCard({ id: 'hacker' })],
      counts: { ...CLASSIC_DECK.counts, hacker: 2 },
    };
    const r = validateDeck(deck, 3);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('custom:'))).toBe(true);
  });

  it('拒绝自定义爆炸猫/拆解卡', () => {
    const deck: DeckDef = {
      ...CLASSIC_DECK,
      customCards: [customCard({ id: 'custom:boom', kind: 'exploding' })],
      counts: { ...CLASSIC_DECK.counts, 'custom:boom': 1 },
    };
    const r = validateDeck(deck, 3);
    expect(r.ok).toBe(false);
  });

  it('拒绝不允许的效果原语', () => {
    const deck: DeckDef = {
      ...CLASSIC_DECK,
      customCards: [customCard({ effects: [{ type: 'gainDefuse' as never }] })],
      counts: { ...CLASSIC_DECK.counts, 'custom:test': 1 },
    };
    const r = validateDeck(deck, 3);
    expect(r.ok).toBe(false);
  });

  it('接受合法的自定义卡组', () => {
    const card = customCard({
      effects: [
        { type: 'peek', count: 2 },
        { type: 'stealRandom' },
      ],
    });
    const deck: DeckDef = {
      id: 'my-deck',
      name: '我的卡组',
      customCards: [card],
      counts: { ...CLASSIC_DECK.counts, 'custom:test': 3 },
    };
    const r = validateDeck(deck, 2);
    expect(r.ok, r.errors.join('; ')).toBe(true);
  });

  it('counts 引用不存在的卡会失败', () => {
    const deck: DeckDef = {
      ...CLASSIC_DECK,
      counts: { ...CLASSIC_DECK.counts, 'custom:ghost': 2 },
    };
    const r = validateDeck(deck, 3);
    expect(r.ok).toBe(false);
  });
});

describe('内置数据完整性', () => {
  it('经典卡组引用的卡都存在', () => {
    for (const id of Object.keys(CLASSIC_DECK.counts)) {
      expect(BUILTIN_CARD_MAP.has(id), `缺少内置卡 ${id}`).toBe(true);
    }
  });
});
