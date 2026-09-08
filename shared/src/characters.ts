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
  voyage: {
    role: 'trickster',
    themeColor: '#4a90c2',
    difficulty: 2,
    lore: '下一次航程也许是在月球。孩子们，还有谁没有收到明信片吗！',
  },
  nana: {
    role: 'aggressive',
    themeColor: '#be0c0c',
    difficulty: 3,
    lore: '同志们，我先走一步。等会张兵再来接我。',
  },
  banana: {
    role: 'control',
    themeColor: '#e5b809',
    difficulty: 2,
    lore: '听说有人曾拜倒在她的香蕉裙下，但应该是滑倒的。',
  },
  pig_king: {
    role: 'trickster',
    themeColor: '#f681d3',
    difficulty: 3,
    lore: '没人知道为什么他成为了众猪之王，但战场永远会变成他的餐桌。',
  },
  chaos_queen: {
    role: 'trickster',
    themeColor: '#9906de',
    difficulty: 3,
    lore: '爱人如养花，逢异惹心潮。',
  },
  future_queen: {
    role: 'trickster',
    themeColor: '#0505f3',
    difficulty: 2,
    lore: '你不是喜欢高智眼镜大厂技术男吗？',
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
  {
    id: 'voyage',
    name: 'Voyage',
    title: '远航船长',
    emoji: '⚓',
    description: '主动技（每局 1 次）：选择任意一名玩家，和对方交换全部手牌，回合立即结束。下一次航程也许是在月球。',
    skills: [
      {
        id: 'voyage-skill',
        name: '大海胸怀无量',
        description: '选择任意一名玩家，和对方交换全部手牌，回合立即结束。每局一次。',
        trigger: 'active',
        effect: { kind: 'activeSwap', uses: 1 },
      },
    ],
  },
  {
    id: 'nana',
    name: 'Nana',
    title: '前苏联最后一滴眼泪',
    emoji: '💧',
    description: '开局没有拆解。死亡后化作眼泪牌流入牌堆——摸到眼泪的玩家可以选择喂给 Nana 一张手牌让她复活，或者拒绝并多摸两张。Nana 手中累积 3 张眼泪时将永远消逝。',
    skills: [
      {
        id: 'nana-tear',
        name: '无尽泪海',
        description: '开局无拆解；死亡后化作眼泪牌；3 张眼泪 = 永久死亡。',
        trigger: 'gameStart',
        effect: { kind: 'nanaTear', maxTears: 3 },
      },
    ],
  },
  {
    id: 'banana',
    name: 'Banana',
    title: '香蕉女王',
    emoji: '🍌',
    description: '没有拆解时可发动大香蕉之怒：全场手牌变为愤怒香蕉！3 张手牌可当任意技能牌打出，4 张可当拆解使用。',
    skills: [
      {
        id: 'banana-rage',
        name: '大香蕉之怒',
        description: '无拆解时发动（1次/局）：全场手牌变为愤怒香蕉 3 回合。覆盖期间：4 张手牌=1 拆解，3 张=任意 action 牌。',
        trigger: 'active',
        effect: { kind: 'bananaRage', overlayTurns: 3, uses: 1 },
      },
    ],
  },
  {
    id: 'pig_king',
    name: 'Pig King',
    title: '猪王',
    emoji: '🐷',
    description: '暴食：每次摸牌必须多摸一张。吞噬：夺取对手手牌进入消化区，3 回合后可以使用。消化 3 次后饱腹 3 回合不能摸牌。',
    skills: [
      {
        id: 'pig-gluttony',
        name: '暴食',
        description: '被动：每次摸牌多摸 1 张。主动（冷却 3 回合）：吞噬对手 1 张非拆解手牌，消化 3 回合后必须打出。消化 3 次后饱腹。',
        trigger: 'active',
        effect: {
          kind: 'pigGluttony',
          extraDraw: 1,
          digestTurns: 3,
          fullTurns: 3,
          fullAfterDigests: 3,
        },
        cooldownTurns: 3,
      },
    ],
  },
  {
    id: 'chaos_queen',
    name: '混沌女王',
    title: '扭曲万象',
    emoji: '🌀',
    description: '场上手牌变化时摸一张（每回合1次）。可扭曲空间反转出牌顺序，或施放混沌之触让全场摸牌变为夺取。',
    skills: [
      {
        id: 'chaos-ripple',
        name: '涟漪',
        description: '被动：场上有玩家手牌数量变化时，摸 1 张牌（每回合最多 1 次）。',
        trigger: 'turnStart',
        effect: { kind: 'chaosRipple', cooldownTurns: 1 },
      },
      {
        id: 'chaos-warp',
        name: '扭曲空间',
        description: '主动：反转出牌顺序（冷却 5 回合）。',
        trigger: 'active',
        effect: { kind: 'chaosWarp', cooldownTurns: 5 },
      },
      {
        id: 'chaos-touch',
        name: '混沌之触',
        description: '主动：接下来一轮所有摸牌变为从随机玩家手中夺取（冷却 5 回合）。',
        trigger: 'active',
        effect: { kind: 'chaosTouch', cooldownTurns: 5 },
      },
    ],
  },
  {
    id: 'future_queen',
    name: 'Future女王',
    title: '命运编织者',
    emoji: '🌠',
    description: '预知未来看 5 张而非 3 张，开局自带 2 张预知未来。命运改写：查看顶 5 张、激活 1 张效果、用手牌替换后自由排列。',
    skills: [
      {
        id: 'future-eye',
        name: '天眼强化',
        description: '被动：预知未来查看 5 张，开局自带 2 张。主动「命运改写」（冷却 5 回合）：查看顶 5 张，激活 1 张效果并用手牌替换。',
        trigger: 'turnStart',
        effect: { kind: 'futureEye', peekCount: 5, bonusPeekCards: 2, cooldownTurns: 5 },
        cooldownTurns: 5,
      },
    ],
  },
];

export const BUILTIN_CHARACTER_MAP: ReadonlyMap<string, CharacterDef> = new Map(
  BUILTIN_CHARACTERS.map((c) => [c.id, c]),
);
