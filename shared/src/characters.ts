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
  bigEye: {
    role: 'trickster',
    themeColor: '#9c05f3',
    difficulty: 2,
    lore: '她的双眼一直注视着每一位小猫，不要轻易和她对视。',
  },
  soup: {
    role: 'support',
    themeColor: '#075bf5',
    difficulty: 2,
    lore: '准备好上课了吗孩子们，下面老师要讲这个公式了。',
  },
  xiuying: {
    role: 'support',
    themeColor: '#e8f4ff',
    difficulty: 2,
    lore: '救救我孩子们，奶奶给你好吃的荔枝。',
  },
  apple: {
    role: 'aggressive',
    themeColor: '#fc2104',
    difficulty: 1,
    lore: '参见女王大人。',
  },
  driver: {
    role: 'control',
    themeColor: '#e8b923',
    difficulty: 2,
    lore: '师傅，去哪儿？上了车就是缘分。',
  },
  julia: {
    role: 'trickster',
    themeColor: '#9b2c4a',
    difficulty: 3,
    lore: '风险和收益永远成正比。今天的会议，我只听结论。',
  },
  lazy_sheep: {
    role: 'support',
    themeColor: '#cfd8f0',
    difficulty: 2,
    lore: '一只羊、两只羊……zzz……梦里什么都有。',
  },
  butcher: {
    role: 'aggressive',
    themeColor: '#5e0d02',
    difficulty: 3,
    lore: '白天砍下来的牌，晚上放在口袋里嚼一嚼。',
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
    description: '主动技（冷却 5 回合）：选择一名玩家，指定自己的 3 张手牌与对方随机 3 张互换，回合立即结束。下一次航程也许是在月球。',
    skills: [
      {
        id: 'voyage-skill',
        name: '大海胸怀无量',
        description: '选择一名玩家，指定自己的 3 张手牌，与对方随机 3 张互换（双方手牌均需 ≥3 张），回合立即结束。冷却 5 回合。',
        trigger: 'active',
        effect: { kind: 'voyageSwap', count: 3, cooldownTurns: 5 },
        cooldownTurns: 5,
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
    description: '没有拆解时可发动大香蕉之怒：全场手牌变为愤怒香蕉并洗乱！覆盖持续一轮（所有存活玩家各行动一次）；覆盖期间无法使用同名猫组合，2 张手牌可当任意技能牌打出，4 张可当拆解使用。整局 3 次，冷却 3 回合。',
    skills: [
      {
        id: 'banana-rage',
        name: '大香蕉之怒',
        description: '无拆解时发动（3 次/局，冷却 3 回合）：全场手牌变为愤怒香蕉并洗乱，持续一轮（所有存活玩家各行动一次）。覆盖期间所有人只能盲打单牌；香蕉女王无法直接出牌，2 张手牌=任意技能牌，4 张=1 拆解。',
        trigger: 'active',
        effect: { kind: 'bananaRage', overlayTurns: 1, uses: 3 },
        cooldownTurns: 3,
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
        description: '被动：预知未来查看 5 张，开局自带 2 张。',
        trigger: 'turnStart',
        effect: { kind: 'futureEye', peekCount: 5, bonusPeekCards: 2, cooldownTurns: 5 },
      },
      {
        id: 'future-rewrite',
        name: '命运改写',
        description: '主动（冷却 5 回合）：查看牌堆顶 5 张，激活 1 张立即生效（等同亲自打出），并用 1 张手牌替换它，5 张按任意顺序放回堆顶。',
        trigger: 'active',
        effect: { kind: 'futureRewrite', peekCount: 5, cooldownTurns: 5 },
        cooldownTurns: 5,
      },
    ],
  },
  {
    id: 'bigEye',
    name: '大眼Nana',
    title: '张兵监视者',
    emoji: '👀',
    description: '其他玩家每使用一张功能牌（不含拆解）就积累一个档案（上限 4）。主动「揭发」档案玩家：2 档案看牌面，3 档案看牌+指定弃一张，4 档案看牌+抽一张，冷却 3 回合。她自己无法使用求赠和偷牌效果。',
    skills: [
      {
        id: 'bigeye-expose',
        name: '揭发',
        description:
          '被动：其他玩家每使用一张功能牌（不含拆解）+1 档案（上限 4）；你无法使用求赠和偷牌效果。主动（冷却 3 回合）：揭发一名档案 ≥2 的玩家并清空其档案——2 档案看牌面；3 档案看牌+指定弃一张；4 档案看牌+抽一张。',
        trigger: 'active',
        effect: { kind: 'bigEyeExpose', cooldownTurns: 3, maxArchives: 4 },
        cooldownTurns: 3,
      },
    ],
  },
  {
    id: 'soup',
    name: '数学老师',
    title: 'Super Soup',
    emoji: '📐',
    description: '四则运算（各自独立冷却 4 回合，不能指定自己）：加法=目标立即摸 1 张；减法=目标下次摸牌少摸 1 张；乘法=目标下一张功能牌触发两次；除法=目标下一张功能牌无法触发。',
    skills: [
      {
        id: 'soup-add',
        name: '加法',
        description: '主动（冷却 4 回合）：指定一位其他玩家立即摸一张牌。',
        trigger: 'active',
        effect: { kind: 'mathOp', op: 'add', cooldownTurns: 4 },
        cooldownTurns: 4,
      },
      {
        id: 'soup-sub',
        name: '减法',
        description: '主动（冷却 4 回合）：指定一位其他玩家，其下一次摸牌少摸一张（最少 0 张）。',
        trigger: 'active',
        effect: { kind: 'mathOp', op: 'sub', cooldownTurns: 4 },
        cooldownTurns: 4,
      },
      {
        id: 'soup-mul',
        name: '乘法',
        description: '主动（冷却 4 回合）：指定一位其他玩家，其下一张功能牌的效果触发两次。',
        trigger: 'active',
        effect: { kind: 'mathOp', op: 'mul', cooldownTurns: 4 },
        cooldownTurns: 4,
      },
      {
        id: 'soup-div',
        name: '除法',
        description: '主动（冷却 4 回合）：指定一位其他玩家，其下一张功能牌无法触发（直接进弃牌堆）。',
        trigger: 'active',
        effect: { kind: 'mathOp', op: 'div', cooldownTurns: 4 },
        cooldownTurns: 4,
      },
    ],
  },
  {
    id: 'xiuying',
    name: '秀英',
    title: '冰冻荔枝老奶',
    emoji: '🧙‍♀️',
    description: '开局处于 10 层冰冻：无法出牌/摸牌，且不受任何技能影响（被技能指定时冰冻 -1）。冰冻时可「救救老奶」请求一名玩家帮助解冻（对方可拒绝，同意则给你一张牌并冰冻 -1，本回合可正常行动）。解冻或被帮助的回合可「乖孩子」喂荔枝：集齐 2 颗者随机获得一张普通小猫牌。',
    skills: [
      {
        id: 'ice-frozen',
        name: '冰冻老奶',
        description: '被动：开局 10 层冰冻，无法出牌和摸牌，且不受任何技能影响；被帮助、被技能指定、被功能牌指定时冰冻 -1，归零后恢复正常。',
        trigger: 'gameStart',
        effect: { kind: 'iceFrozen', layers: 10 },
      },
      {
        id: 'ice-help',
        name: '救救老奶',
        description: '主动（冰冻时可用）：请求一名玩家帮助解冻——对方可拒绝；同意则交给你一张牌，冰冻 -1，本回合可以正常出牌和摸牌。被拒后可继续问其他人。',
        trigger: 'active',
        effect: { kind: 'iceHelp', cooldownTurns: 0 },
      },
      {
        id: 'ice-lychee',
        name: '乖孩子',
        description: '主动（解冻或本回合被帮助时可用，每回合 1 次）：喂给一名其他玩家一颗荔枝；集齐 2 颗荔枝的玩家随机获得一张普通小猫牌。',
        trigger: 'active',
        effect: { kind: 'iceLychee', perTurn: 1 },
      },
    ],
  },
  {
    id: 'apple',
    name: '邪恶苹果头',
    title: 'Evil Apple',
    emoji: '🍎',
    description: '被动：开局往牌堆里藏一张「爆炸苹果」——别人摸到等同摸到爆炸猫（拆解后仍会回到牌堆），她自己摸到则悄悄放回牌堆再摸一张。主动「投掷邪恶苹果」（冷却 5 回合）：目标在自己回合可以吃掉它（交一张手牌给你）；不吃的话存在 3 个回合后变成爆炸苹果混入牌堆。',
    skills: [
      {
        id: 'apple-bomb',
        name: '苹果',
        description: '被动：开局往牌堆随机位置藏 1 张爆炸苹果；其他玩家摸到等同爆炸猫（拆解后回到牌堆，数量会随投掷苹果到期而累积）；你自己摸到则悄悄放回牌堆，并再摸一张。',
        trigger: 'gameStart',
        effect: { kind: 'appleBomb', count: 1 },
      },
      {
        id: 'apple-throw',
        name: '投掷邪恶苹果',
        description: '主动（冷却 5 回合）：指定一名没有苹果的玩家，把邪恶苹果扔到他身上——他可以在自己回合内吃掉（交给你一张手牌），否则苹果存在 3 个回合后变成爆炸苹果混入牌堆。',
        trigger: 'active',
        effect: { kind: 'appleThrow', cooldownTurns: 5 },
        cooldownTurns: 5,
      },
    ],
  },
  {
    id: 'butcher',
    name: '屠夫',
    title: 'Butcher',
    emoji: '🔪',
    description: '被动：任何玩家的手牌被别人拿走时（每张）获得 1 层剔骨，最多 5 层。主动「剔骨」：消耗 3 层，随机抽走一名玩家 1 张手牌并封锁他直到其下一回合结束——期间他不能用角色主动技和功能牌（拆解除外），你对他的偷牌与攻击效果翻倍。对同一玩家冷却 5 回合。',
    skills: [
      {
        id: 'butcher-skill',
        name: '剔骨',
        description: '被动：场内任何玩家的手牌被他人拿走时（自己出牌、交牌不算），每张 +1 层剔骨（上限 5）。主动：消耗 3 层，指定一名玩家——随机抽走他 1 张手牌（不计剔骨），并封锁他的主动技与功能牌（拆解除外）直到他的下一回合结束；封锁期间你对他的求赠/对子/三连偷 2 张，他是下家时你的攻击让他连续行动 4 回合（不与「乘」叠加）。对每名玩家冷却 5 回合，自己无冷却。',
        trigger: 'active',
        effect: { kind: 'butcherCleave', maxStacks: 5, cost: 3, targetCooldown: 5 },
      },
    ],
  },
  {
    id: 'driver',
    name: '司机小贾',
    title: '撞大运',
    emoji: '🚕',
    description: '主动「上车」：邀请一名玩家拼车——对方同意就交你一张牌当车费，他的下一回合不用摸牌。主动「变道」：交换两名相邻玩家的座次，改变谁是谁的下家。被动「老司机」：每收满 3 份车费攒 1 层「撞大运」，摸到爆炸牌时自动把它放回牌堆。',
    skills: [
      {
        id: 'driver-ride',
        name: '上车',
        description: '主动（冷却 3 回合，对方同意后才开始计）：邀请一名其他玩家拼车，对方可以拒绝。同意：他自选一张手牌交给你当车费，他的下一回合结束时不用摸牌（只抵一个回合）。拒绝：你本回合可以换人再问，但不能重复问同一个人。',
        trigger: 'active',
        effect: { kind: 'driverRide', cooldownTurns: 3 },
        cooldownTurns: 3,
      },
      {
        id: 'driver-lane',
        name: '变道',
        description: '主动（冷却 4 回合）：选一名玩家，让他和他的下家交换座次（可以包括你自己）。之后的出牌顺序、攻击落点和「下家」判定都随之改变。',
        trigger: 'active',
        effect: { kind: 'driverLane', cooldownTurns: 4 },
        cooldownTurns: 4,
      },
      {
        id: 'driver-luck',
        name: '老司机',
        description: '被动：每收满 3 份车费，获得 1 层「撞大运」（可叠加）。你摸到爆炸猫或爆炸苹果时，自动消耗 1 层，把它放回牌堆随机位置——不爆炸，也不消耗拆解。',
        trigger: 'gameStart',
        effect: { kind: 'driverLuck', faresPerLuck: 3 },
      },
    ],
  },
  {
    id: 'julia',
    name: 'Julia姐',
    title: 'Julia',
    emoji: '💼',
    description: '主动「建仓」：把 1~3 张手牌放进投资组合（暗置，不会被偷，也打不出来），2 个回合后按「大盘」交割——全场每打出一张功能牌大盘 +1，每张猫牌或否认 −1；大盘 ≥ +2 本金翻倍，≤ −2 亏一半，其余原样拿回。主动「平仓」：随时提前撤资，扣 1 张手续费。',
    skills: [
      {
        id: 'julia-invest',
        name: '建仓',
        description: '主动（冷却 3 回合）：从手牌选 1~3 张放进投资组合（爆炸猫、果奔猫、眼泪不能投），同时只能有一笔持仓。持仓期间这些牌不会被偷、被求赠、被吞噬，也不能打出。你的第 2 个回合开始时自动交割：大盘 ≥ +2 牛市，本金全部拿回，并从弃牌堆随机再拿同样张数的非爆炸牌；−1 ~ +1 震荡，原样拿回；≤ −2 熊市，随机亏掉一半（向上取整）。',
        trigger: 'active',
        effect: { kind: 'juliaInvest', maxCards: 3, holdTurns: 2, cooldownTurns: 3 },
        cooldownTurns: 3,
      },
      {
        id: 'julia-cashout',
        name: '平仓',
        description: '主动（无冷却，有持仓时可用）：提前撤资，随机扣 1 张进弃牌堆当手续费，其余拿回手牌。',
        trigger: 'active',
        effect: { kind: 'juliaCashout' },
      },
    ],
  },
  {
    id: 'lazy_sheep',
    name: '懒懒羊',
    title: 'Lazy Sheep',
    emoji: '🐑',
    description: '主动「数羊」：立刻结束回合（照常摸牌）进入梦乡——梦乡里别人偷不到你的牌，但你也不能打否认。下一回合醒来时，从 2 张随机梦境牌里挑 1 张：自己收下，或者送给任意一名玩家。梦境牌是全新的功能牌：好梦自己用，噩梦塞给对手。',
    skills: [
      {
        id: 'sheep-dream',
        name: '数羊',
        description: '主动（冷却 3 回合）：给自己催眠，立刻结束回合（照常摸牌）并进入梦乡，直到你的下一回合开始。梦乡中别人对你的偷牌（求赠、对子、三连、怪盗）落空，但你不能打否认。醒来时翻 2 张随机梦境牌，选 1 张自己收下或送给一名存活玩家，另一张作废。',
        trigger: 'active',
        effect: { kind: 'sheepDream', options: 2, cooldownTurns: 3 },
        cooldownTurns: 3,
      },
    ],
  },
];

export const BUILTIN_CHARACTER_MAP: ReadonlyMap<string, CharacterDef> = new Map(
  BUILTIN_CHARACTERS.map((c) => [c.id, c]),
);
