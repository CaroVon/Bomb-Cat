import type { CharacterDef } from './types';

/** 角色职责 → 主题色/边框光晕 */
export type CharacterRole = 'control' | 'support' | 'aggressive' | 'trickster';

export const ROLE_LABEL: Record<CharacterRole, string> = {
  control: '控制',
  support: '辅助',
  aggressive: '进攻',
  trickster: '诡诈',
};

export const ROLE_COLOR: Record<CharacterRole, string> = {
  control: '#4a90c2', // 钢蓝
  support: '#5cb87a', // 翠绿
  aggressive: '#e05252', // 赤红
  trickster: '#a335ee', // 暗紫
};

export interface CharacterRPG {
  role: CharacterRole;
  themeColor: string;
  difficulty: 1 | 2 | 3;
  lore: string;
}

/** RPG 属性扩展表（按 id 查找） */
export const CHARACTER_RPG: Record<string, CharacterRPG> = {
  none: {
    role: 'support',
    themeColor: '#8f978d',
    difficulty: 1,
    lore: '一个路过的普通人，在猫与爆炸的世界里寻找下一顿饭。',
  },
  'echo-mage': {
    role: 'trickster',
    themeColor: '#8b5cf6',
    difficulty: 2,
    lore: '曾因过度否认魔法议会的提案而被放逐，从此他的声音总能在关键时刻回响。',
  },
  oracle: {
    role: 'control',
    themeColor: '#4a90c2',
    difficulty: 1,
    lore: '据说她能看见三秒钟后的未来——但她只用来决定午饭吃什么。',
  },
  knight: {
    role: 'support',
    themeColor: '#5cb87a',
    difficulty: 1,
    lore: '铁壁骑士团最后的成员，他的盾牌上刻着"仅限一次"。',
  },
  'phantom-thief': {
    role: 'trickster',
    themeColor: '#a335ee',
    difficulty: 3,
    lore: '只偷他认为是"命运注定属于他"的东西——恰好你的那张牌也是。',
  },
  alchemist: {
    role: 'control',
    themeColor: '#d4a557',
    difficulty: 2,
    lore: '炼金术的第一法则是等价交换，第二法则是先偷再换。',
  },
  'lucky-cat': {
    role: 'support',
    themeColor: '#f59e0b',
    difficulty: 1,
    lore: '传说摸到它的肚子会获得好运，但没人敢在爆炸猫的世界里验证。',
  },
};

/** 预置角色：每个角色由 1 个技能原型数据定义，引擎按原型结算。 */
export const BUILTIN_CHARACTERS: CharacterDef[] = [
  {
    id: 'none',
    name: '路人',
    title: '没有技能',
    emoji: '🙂',
    description: '不选角色，纯靠牌技。',
    skills: [],
  },
  {
    id: 'echo-mage',
    name: '回响法师',
    title: '被否认的牌回到手中',
    emoji: '🧙',
    description: '每局第一张被「否认」的动作牌不会进弃牌堆，而是回到你手里。',
    skills: [
      {
        id: 'echo-return',
        name: '回响',
        description: '每局第一张被否认的动作牌返回手牌。',
        trigger: 'onNoped',
        effect: { kind: 'returnNoped', times: 1 },
      },
    ],
  },
  {
    id: 'oracle',
    name: '预言家',
    title: '回合开始看一眼牌堆顶',
    emoji: '🔮',
    description: '你的每个回合开始时，可以私密查看牌堆顶 1 张牌。',
    skills: [
      {
        id: 'oracle-peek',
        name: '天眼',
        description: '回合开始时私密查看牌堆顶 1 张牌。',
        trigger: 'turnStart',
        effect: { kind: 'peekAtTurnStart', count: 1 },
      },
    ],
  },
  {
    id: 'knight',
    name: '铁壁骑士',
    title: '第一次被偷牌无效',
    emoji: '🛡️',
    description: '每局中第一次被别人偷牌时，偷牌对你无效。',
    skills: [
      {
        id: 'knight-wall',
        name: '铁壁',
        description: '每局第一次被偷牌无效。',
        trigger: 'onStolenFrom',
        effect: { kind: 'immuneSteal', times: 1 },
      },
    ],
  },
  {
    id: 'phantom-thief',
    name: '怪盗基德',
    title: '弃 2 张，指名偷 1 张',
    emoji: '🦹',
    description: '主动技（每局 1 次）：你的回合内弃掉任意 2 张手牌，从指定玩家手中指名偷走 1 张牌。',
    skills: [
      {
        id: 'thief-steal',
        name: '精确犯罪',
        description: '出牌阶段弃 2 张手牌，从指定玩家处指名偷 1 张牌。每局 1 次。',
        trigger: 'active',
        effect: { kind: 'activeSteal', costCards: 2, named: true, uses: 1 },
      },
    ],
  },
  {
    id: 'alchemist',
    name: '炼金术士',
    title: '弃 1 张，回收弃牌堆顶',
    emoji: '⚗️',
    description: '主动技（每局 2 次）：你的回合内弃掉 1 张手牌，从弃牌堆顶拿回 1 张牌到手牌。',
    skills: [
      {
        id: 'alch-recycle',
        name: '等价交换',
        description: '出牌阶段弃 1 张手牌，从弃牌堆顶拿回 1 张牌。每局 2 次。',
        trigger: 'active',
        effect: { kind: 'activeRecycle', costCards: 1, uses: 2 },
      },
    ],
  },
  {
    id: 'lucky-cat',
    name: '幸运绒球',
    title: '开局多 1 张跳过',
    emoji: '🍀',
    description: '游戏开始时，额外获得 1 张「跳过」。',
    skills: [
      {
        id: 'lucky-skip',
        name: '小幸运',
        description: '开局额外获得 1 张跳过。',
        trigger: 'gameStart',
        effect: { kind: 'startWithSkip', count: 1 },
      },
    ],
  },
];

export const BUILTIN_CHARACTER_MAP: ReadonlyMap<string, CharacterDef> = new Map(
  BUILTIN_CHARACTERS.map((c) => [c.id, c]),
);
