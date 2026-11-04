/**
 * 双语（中文 / English）基础设施——前后端共用的契约。
 *
 * 设计：
 * - 内置卡牌/角色/规则/任务的中文文本仍在原定义里（cards.ts / characters.ts / rules.ts）；
 *   英文文本在 content.ts，按 id 查找，缺失时回退中文。
 * - 服务端日志与报错不再只发中文：发送 LocMsg（消息键 + 参数），客户端按自己的语言渲染。
 *   消息模板在 messages.ts，`{name}` 为占位符。
 * - 参数值若是以下"引用"字符串，渲染时会按语言替换成本地化名称：
 *     '@card:<cardId>'      卡牌名
 *     '@cards:<id>,<id>'    多张卡牌名，以「+」连接
 *     '@char:<characterId>' 角色名
 *     '@skill:<charId>/<skillId>' 技能名
 *     '@rule:<worldRuleId>' 全局规则名
 *     '@obj:<objectiveId>'  秘密任务名
 *   用 ref.card(id) 等辅助函数生成，别手写。
 */
import type { CardDef, CharacterDef } from '../types';
import { BUILTIN_CARD_MAP } from '../cards';
import { BUILTIN_CHARACTER_MAP, CHARACTER_RPG, ROLE_LABEL, type CharacterRole } from '../characters';
import { OBJECTIVE_MAP, RUN_BONUS_MAP, WORLD_RULE_MAP } from '../rules';
import { MESSAGES } from './messages';
import {
  CARD_EN,
  CHAR_EN,
  OBJECTIVE_EN,
  ROLE_LABEL_EN,
  RUN_BONUS_EN,
  WORLD_RULE_EN,
} from './content';

export type Lang = 'zh' | 'en';

/** 可本地化消息：消息键 + 参数（参数值可为引用字符串，见文件头） */
export interface LocMsg {
  k: string;
  p?: Record<string, string | number>;
}

export { MESSAGES } from './messages';
export * from './content';

/* ---------------- 引用生成 ---------------- */

export const ref = {
  card: (cardId: string) => `@card:${cardId}`,
  cards: (cardIds: string[]) => `@cards:${cardIds.join(',')}`,
  char: (characterId: string) => `@char:${characterId}`,
  skill: (characterId: string, skillId: string) => `@skill:${characterId}/${skillId}`,
  rule: (ruleId: string) => `@rule:${ruleId}`,
  obj: (objectiveId: string) => `@obj:${objectiveId}`,
};

/* ---------------- 内容查找 ---------------- */

/** 卡牌名称/描述（自定义卡 custom: 前缀保留玩家原文） */
export function cardText(def: Pick<CardDef, 'id' | 'name' | 'description'>, lang: Lang): { name: string; description: string } {
  if (lang === 'en') {
    const en = CARD_EN[def.id];
    if (en) return en;
  }
  return { name: def.name, description: def.description };
}

export function cardName(cardId: string, lang: Lang): string {
  const def = BUILTIN_CARD_MAP.get(cardId);
  if (lang === 'en' && CARD_EN[cardId]) return CARD_EN[cardId]!.name;
  return def?.name ?? cardId;
}

export interface CharTextOut {
  name: string;
  title: string;
  description: string;
  lore: string;
  skill: (skillId: string, fallback: { name: string; description: string }) => { name: string; description: string };
}

/** 角色文本（名字 / 英文副标题 / 描述 / 背景 / 技能） */
export function charText(def: Pick<CharacterDef, 'id' | 'name' | 'description'> & { title?: string }, lang: Lang): CharTextOut {
  const en = lang === 'en' ? CHAR_EN[def.id] : undefined;
  const zhLore = CHARACTER_RPG[def.id]?.lore ?? '';
  return {
    name: en?.name ?? def.name,
    title: en?.title ?? def.title ?? '',
    description: en?.description ?? def.description,
    lore: en?.lore ?? zhLore,
    skill: (skillId, fallback) => en?.skills?.[skillId] ?? fallback,
  };
}

export function charName(characterId: string, lang: Lang): string {
  if (lang === 'en' && CHAR_EN[characterId]) return CHAR_EN[characterId]!.name;
  return BUILTIN_CHARACTER_MAP.get(characterId)?.name ?? (characterId === 'none' ? '路人' : characterId);
}

export function roleLabel(role: CharacterRole, lang: Lang): string {
  return lang === 'en' ? ROLE_LABEL_EN[role] : ROLE_LABEL[role];
}

export function worldRuleText(ruleId: string, lang: Lang): { name: string; description: string } | null {
  const def = WORLD_RULE_MAP.get(ruleId);
  if (!def) return null;
  if (lang === 'en' && WORLD_RULE_EN[ruleId]) return WORLD_RULE_EN[ruleId]!;
  return { name: def.name, description: def.description };
}

export function objectiveText(objId: string, lang: Lang): { name: string; description: string } | null {
  const def = OBJECTIVE_MAP.get(objId);
  if (!def) return null;
  if (lang === 'en' && OBJECTIVE_EN[objId]) return OBJECTIVE_EN[objId]!;
  return { name: def.name, description: def.description };
}

export function runBonusText(bonusId: string, lang: Lang): { name: string; description: string } | null {
  const def = RUN_BONUS_MAP.get(bonusId);
  if (!def) return null;
  if (lang === 'en' && RUN_BONUS_EN[bonusId]) return RUN_BONUS_EN[bonusId]!;
  return { name: def.name, description: def.description };
}

/* ---------------- 消息格式化 ---------------- */

function resolveRef(v: string, lang: Lang): string {
  if (!v.startsWith('@')) return v;
  const i = v.indexOf(':');
  if (i < 0) return v;
  const kind = v.slice(1, i);
  const id = v.slice(i + 1);
  switch (kind) {
    case 'card':
      return cardName(id, lang);
    case 'cards':
      return id
        .split(',')
        .filter(Boolean)
        .map((c) => cardName(c, lang))
        .join('+');
    case 'char':
      return charName(id, lang);
    case 'skill': {
      const [charId, skillId] = id.split('/');
      const ch = BUILTIN_CHARACTER_MAP.get(charId ?? '');
      const sk = ch?.skills.find((s) => s.id === skillId);
      if (!sk) return skillId ?? id;
      return lang === 'en' ? (CHAR_EN[charId!]?.skills?.[skillId!]?.name ?? sk.name) : sk.name;
    }
    case 'rule':
      return worldRuleText(id, lang)?.name ?? id;
    case 'obj':
      return objectiveText(id, lang)?.name ?? id;
    default:
      return v;
  }
}

/** 编码为可放进 schema 字符串数组 / 消息字段的 JSON 字符串 */
export function encodeMsg(k: string, p?: LocMsg['p']): string {
  return JSON.stringify(p ? { k, p } : { k });
}

/** 尝试把字符串解析成 LocMsg（不是则返回 null，按原文显示） */
export function decodeMsg(s: string): LocMsg | null {
  if (!s || s[0] !== '{') return null;
  try {
    const o = JSON.parse(s) as LocMsg;
    return typeof o?.k === 'string' ? o : null;
  } catch {
    return null;
  }
}

/** 渲染消息：LocMsg / 编码字符串 / 纯文本 均可 */
export function formatMsg(lang: Lang, msg: LocMsg | string | null | undefined): string {
  if (msg == null) return '';
  const m = typeof msg === 'string' ? decodeMsg(msg) : msg;
  if (!m) return String(msg);
  const tpl = MESSAGES[m.k]?.[lang] ?? MESSAGES[m.k]?.zh ?? m.k;
  return tpl.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = m.p?.[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === 'string' ? resolveRef(v, lang) : String(v);
  });
}
