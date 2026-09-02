import type { CardDef, DeckDef } from './types';

/**
 * 内置卡牌定义 + 经典卡组。
 * 数值参考原版规则并做了自平衡；全部效果用原语组合，引擎不认识任何具体卡名。
 */
export const BUILTIN_CARDS: CardDef[] = [
  {
    id: 'exploding',
    name: '爆炸猫',
    kind: 'exploding',
    emoji: '💥',
    description: '摸到即爆炸！没有拆解就出局。',
    effects: [],
  },
  {
    id: 'defuse',
    name: '拆解',
    kind: 'defuse',
    emoji: '🔧',
    description: '拆解爆炸猫，把它放回牌堆任意位置。',
    effects: [],
  },
  {
    id: 'attack',
    name: '攻击',
    kind: 'action',
    emoji: '⚡',
    description: '立即结束你的回合且不摸牌，下一位玩家连续行动 2 个回合。',
    effects: [{ type: 'attack' }],
  },
  {
    id: 'targetedAttack',
    name: '精准攻击',
    kind: 'action',
    emoji: '🎯',
    description: '立即结束你的回合，指定任意玩家连续行动 2 个回合。',
    effects: [{ type: 'targetedAttack' }],
  },
  {
    id: 'skip',
    name: '跳过',
    kind: 'action',
    emoji: '🚫',
    description: '立即结束你的回合且不摸牌。',
    effects: [{ type: 'skip' }],
  },
  {
    id: 'favor',
    name: '求赠',
    kind: 'action',
    emoji: '🎁',
    description: '指定一位玩家随机给你 1 张牌（对方可否认）。',
    effects: [{ type: 'stealRandom' }],
  },
  {
    id: 'shuffle',
    name: '洗牌',
    kind: 'action',
    emoji: '🌀',
    description: '把牌堆洗一洗。不需要任何理由。',
    effects: [{ type: 'shuffle' }],
  },
  {
    id: 'peek',
    name: '预知未来',
    kind: 'action',
    emoji: '👁️',
    description: '偷偷看牌堆顶 3 张牌。',
    effects: [{ type: 'peek', count: 3 }],
  },
  {
    id: 'nope',
    name: '否认',
    kind: 'action',
    emoji: '❌',
    description: '否认别人刚打出的牌（在 8 秒否认窗口内打出）。否认可以被否认。',
    effects: [],
  },
  {
    id: 'plain-melon',
    name: '西瓜猫',
    kind: 'plain',
    emoji: '🍉',
    description: '普通猫。打出 2 张同名可偷牌，3 张同名可指名偷牌。',
    effects: [],
    comboable: true,
    color: '#22c55e',
  },
  {
    id: 'plain-potato',
    name: '土豆猫',
    kind: 'plain',
    emoji: '🥔',
    description: '普通猫。打出 2 张同名可偷牌，3 张同名可指名偷牌。',
    effects: [],
    comboable: true,
    color: '#a16207',
  },
  {
    id: 'plain-rainbow',
    name: '彩虹猫',
    kind: 'plain',
    emoji: '🌈',
    description: '普通猫。打出 2 张同名可偷牌，3 张同名可指名偷牌。',
    effects: [],
    comboable: true,
    color: '#8b5cf6',
  },
  {
    id: 'plain-fuzzy',
    name: '毛球猫',
    kind: 'plain',
    emoji: '🧶',
    description: '普通猫。打出 2 张同名可偷牌，3 张同名可指名偷牌。',
    effects: [],
    comboable: true,
    color: '#ec4899',
  },
  /** 原版「屁股猫」位：作为第 5 种普通牌花色，凑对子更灵活 */
  {
    id: 'plain-beard',
    name: '胡子猫',
    kind: 'plain',
    emoji: '🐱',
    description: '普通猫。打出 2 张同名可偷牌，3 张同名可指名偷牌。',
    effects: [],
    comboable: true,
    color: '#f59e0b',
  },
];

export const BUILTIN_CARD_MAP: ReadonlyMap<string, CardDef> = new Map(
  BUILTIN_CARDS.map((c) => [c.id, c]),
);

/** 经典卡组（默认） */
export const CLASSIC_DECK: DeckDef = {
  id: 'classic',
  name: '经典卡组',
  description: '原版味道的标准牌表',
  customCards: [],
  counts: {
    attack: 4,
    targetedAttack: 1,
    skip: 4,
    favor: 4,
    shuffle: 4,
    peek: 5,
    nope: 5,
    'plain-melon': 4,
    'plain-potato': 4,
    'plain-rainbow': 4,
    'plain-fuzzy': 3,
    'plain-beard': 3,
  },
};
