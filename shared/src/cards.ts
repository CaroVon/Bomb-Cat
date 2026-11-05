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
    id: 'exploding-apple',
    name: '爆炸苹果',
    kind: 'exploding',
    emoji: '🍏',
    description: '摸到即爆炸！邪恶苹果头自己摸到时可以悄悄放回牌堆再摸一张。',
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
  /* ============ 内爆扩展（Imploding，社区口碑第一扩展的核心卡） ============ */
  {
    id: 'reverse',
    name: '反转',
    kind: 'action',
    emoji: '↩️',
    description: '立即反转出牌顺序，然后继续你的回合。',
    effects: [{ type: 'reverse' }],
  },
  {
    id: 'alter-future',
    name: '改变未来',
    kind: 'action',
    emoji: '🔭',
    description: '查看牌堆顶 3 张并重新排列它们的顺序，然后继续你的回合。',
    effects: [{ type: 'alterFuture' }],
  },
  {
    id: 'draw-bottom',
    name: '摸牌底',
    kind: 'action',
    emoji: '🕳️',
    description: '结束你的回合，但从牌堆底而不是顶摸牌。',
    effects: [{ type: 'drawFromBottom' }],
  },
  {
    id: 'feral',
    name: '万能猫',
    kind: 'plain',
    emoji: '🐈‍⬛',
    description: '万能普通猫：可与任意其他普通猫组成对子（偷随机牌）或三连（指名偷牌）。',
    effects: [],
    comboable: true,
    feral: true,
    color: '#71717a',
  },
  /* ============ 果奔扩展（Streaking，口碑第二：藏猫诈唬） ============ */
  {
    id: 'streaking',
    name: '果奔猫',
    kind: 'streaking',
    emoji: '🐱‍💨',
    description: '被动：摸到爆炸猫时可以秘密藏进手牌而不爆炸。持有爆炸猫期间无法获胜；再摸到一张会当场爆炸！',
    effects: [],
  },
  /* ============ Nana 专属：眼泪牌 ============ */
  {
    id: 'tear',
    name: '眼泪',
    kind: 'tear',
    emoji: '💧',
    description: 'Nana 的眼泪。摸到时选择：弃 1 张手牌喂给 Nana 让她复活（眼泪传递给下一位），或拒绝并多摸 2 张（眼泪放回牌堆顶）。',
    effects: [],
  },
  /* ============ 懒懒羊专属：梦境牌（不进普通牌堆，只能从梦里获得） ============ */
  {
    id: 'dream-snooze',
    name: '回笼觉',
    kind: 'dream',
    emoji: '🛌',
    description: '打出：立即结束回合且不摸牌；但你下一次摸牌时要多摸 1 张（摸牌延期，不是免除）。',
    effects: [{ type: 'snooze' }],
  },
  {
    id: 'dream-fleece',
    name: '羊毛毯',
    kind: 'dream',
    emoji: '🧶',
    description: '放在手里即可，不能主动打出：你被攻击时自动盖上，少连续行动 1 回合（最少 1 回合），用完弃掉。',
    effects: [],
  },
  {
    id: 'dream-sense',
    name: '预知梦',
    kind: 'dream',
    emoji: '🔮',
    description: '打出：私密得知牌堆顶 5 张里哪几个位置是爆炸牌（看不到其他牌是什么）。',
    effects: [{ type: 'bombSense', count: 5 }],
  },
  {
    id: 'dream-weave',
    name: '造梦',
    kind: 'dream',
    emoji: '🌙',
    description: '打出：把牌堆顶 3 张里的爆炸牌全部移到牌堆底。',
    effects: [{ type: 'buryBombs', count: 3 }],
  },
  {
    id: 'dream-nightmare',
    name: '噩梦',
    kind: 'dream',
    emoji: '😱',
    description: '拿在手里时，每次摸牌都要多摸 1 张。可以花一次出牌把它打出扔掉（没有其他效果）。',
    effects: [],
  },
  {
    id: 'dream-sleepwalk',
    name: '梦游',
    kind: 'dream',
    emoji: '🚶',
    description: '不进手牌：收到的人下一回合开始时会梦游，自动随机打出一张手里的功能牌（否认、拆解、梦境牌和猫牌除外），效果照常生效。',
    effects: [],
  },
];

/** 梦境牌 id（懒懒羊「数羊」醒来时从中随机抽取） */
export const DREAM_CARD_IDS: readonly string[] = [
  'dream-snooze',
  'dream-fleece',
  'dream-sense',
  'dream-weave',
  'dream-nightmare',
  'dream-sleepwalk',
];

export const BUILTIN_CARD_MAP: ReadonlyMap<string, CardDef> = new Map(
  BUILTIN_CARDS.map((c) => [c.id, c]),
);

/** 经典卡组（默认）——54 张动作牌（4 人基准），超过 4 人按比例放大 */
export const CLASSIC_DECK: DeckDef = {
  id: 'classic',
  name: '经典卡组',
  description: '原版味道的标准牌表',
  customCards: [],
  counts: {
    attack: 4,
    skip: 4,
    favor: 4,
    shuffle: 4,
    peek: 5,
    nope: 5,
    'plain-melon': 6,
    'plain-potato': 6,
    'plain-rainbow': 6,
    'plain-fuzzy': 5,
    'plain-beard': 5,
  },
};

/** 经典卡组随人数缩放：≤4 人维持基准；>4 人每类牌 +floor(count×(n-4)/4)（只增不减，8 人约翻倍） */
export function classicDeckFor(playerCount: number): DeckDef {
  if (playerCount <= 4) return CLASSIC_DECK;
  const counts: Record<string, number> = {};
  for (const [cardId, count] of Object.entries(CLASSIC_DECK.counts)) {
    counts[cardId] = count + Math.floor((count * (playerCount - 4)) / 4);
  }
  return { ...CLASSIC_DECK, counts };
}
