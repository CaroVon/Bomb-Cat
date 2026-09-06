import { BUILTIN_CARD_MAP } from './cards';
import {
  CUSTOM_CARD_ALLOWED_EFFECTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CardDef,
  type CardEffect,
  type DeckDef,
  type SkillDef,
} from './types';

export const CUSTOM_PREFIX = 'custom:';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function fail(errors: string[], msg: string): false {
  errors.push(msg);
  return false;
}

const isSafeText = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.length <= 24;

/** 校验单张自定义卡定义（防作弊/防注入的第一道门，服务端与客户端共用） */
export function validateCustomCard(card: CardDef, errors: string[]): boolean {
  let ok = true;
  const err = (m: string) => {
    errors.push(m);
    ok = false;
  };

  if (!isSafeText(card.id)) err(`卡牌 id 非法: ${String(card.id)}`);
  else if (!card.id.startsWith(CUSTOM_PREFIX)) {
    err(`自定义卡 id 必须以 "${CUSTOM_PREFIX}" 开头: ${card.id}`);
  } else if (BUILTIN_CARD_MAP.has(card.id)) {
    err(`自定义卡 id 不能与内置卡冲突: ${card.id}`);
  }
  if (!isSafeText(card.name)) err(`${card.id}: 名称非法`);
  if (!isSafeText(card.emoji)) err(`${card.id}: emoji 非法`);
  if (typeof card.description !== 'string' || card.description.length > 120) {
    err(`${card.id}: 描述为空或超过 120 字`);
  }
  if (card.kind === 'exploding' || card.kind === 'defuse' || card.kind === 'streaking') {
    err(`${card.id}: 自定义卡不能是爆炸猫、拆解或果奔猫`);
  } else if (card.kind !== 'action' && card.kind !== 'plain') {
    err(`${card.id}: 卡牌类型必须是 action 或 plain`);
  }
  if (card.feral && card.kind !== 'plain') {
    err(`${card.id}: 只有普通猫可以标记为万能（feral）`);
  }
  if (!Array.isArray(card.effects)) {
    err(`${card.id}: effects 必须是数组`);
    return ok;
  }
  if (card.effects.length > 3) err(`${card.id}: 效果不能超过 3 个`);
  card.effects.forEach((e: CardEffect, i) => {
    if (!e || typeof e.type !== 'string') {
      err(`${card.id}: 第 ${i + 1} 个效果缺少 type`);
      return;
    }
    if (!CUSTOM_CARD_ALLOWED_EFFECTS.includes(e.type)) {
      err(`${card.id}: 效果 ${e.type} 不允许自定义卡使用`);
      return;
    }
    if (e.type === 'stealNamed' && !e.cardId) {
      err(`${card.id}: stealNamed 必须指明 cardId`);
      return;
    }
    const count = e.count ?? 1;
    if (e.type === 'selfDraw' && (count < 1 || count > 2)) {
      err(`${card.id}: selfDraw 数量只能是 1-2`);
    }
    if (e.type === 'peek' && (count < 1 || count > 3)) {
      err(`${card.id}: peek 数量只能是 1-3`);
    }
  });
  return ok;
}

const MIN_DECK_ACTION_CARDS = 12;
const MAX_DECK_ACTION_CARDS = 80;
const MAX_CUSTOM_CARDS = 10;
const MAX_CARD_COPIES = 6;

/**
 * 校验整套自定义卡组。服务端在房主 startGame / setDeck 时调用，
 * 校验失败直接拒绝。客户端在编辑器保存时也调用以提前提示。
 */
export function validateDeck(deck: DeckDef, playerCount: number): ValidationResult {
  const errors: string[] = [];
  let ok = true;
  const err = (m: string) => {
    errors.push(m);
    ok = false;
  };

  if (!isSafeText(deck.name)) err('卡组名称非法');
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    err(`玩家数必须在 ${MIN_PLAYERS}-${MAX_PLAYERS} 人`);
  }
  if (!Array.isArray(deck.customCards)) {
    err('customCards 必须是数组');
    return { ok: false, errors };
  }
  if (deck.customCards.length > MAX_CUSTOM_CARDS) {
    err(`自定义卡不能超过 ${MAX_CUSTOM_CARDS} 张`);
  }

  const ids = new Set<string>();
  for (const card of deck.customCards) {
    if (!validateCustomCard(card, errors)) ok = false;
    if (ids.has(card.id)) err(`自定义卡 id 重复: ${card.id}`);
    ids.add(card.id);
  }

  if (!deck.counts || typeof deck.counts !== 'object') {
    err('counts 必须是对象');
    return { ok: false, errors };
  }

  let total = 0;
  for (const [cardId, count] of Object.entries(deck.counts)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      err(`${cardId}: 数量必须是自然数`);
      continue;
    }
    if (cardId === 'exploding' || cardId === 'defuse') {
      err('爆炸猫与拆解的数量由规则决定，不能自定义');
      continue;
    }
    if (!BUILTIN_CARD_MAP.has(cardId) && !ids.has(cardId)) {
      err(`${cardId}: 既不是内置卡也不在 customCards 中`);
      continue;
    }
    if (count > MAX_CARD_COPIES) err(`${cardId}: 单卡数量不能超过 ${MAX_CARD_COPIES}`);
    total += count;
  }

  if (total < MIN_DECK_ACTION_CARDS) err(`卡组动作牌总数不能少于 ${MIN_DECK_ACTION_CARDS} 张`);
  if (total > MAX_DECK_ACTION_CARDS) err(`卡组动作牌总数不能超过 ${MAX_DECK_ACTION_CARDS} 张`);

  if (deck.explodingCount !== undefined) {
    const expected = playerCount - 1;
    if (deck.explodingCount !== expected) {
      err(`爆炸猫数量固定为玩家数-1（${expected}），当前 ${deck.explodingCount}`);
    }
  }

  return { ok, errors };
}

/** 校验技能定义（自定义角色用；当前版本角色以预置为主，保留接口） */
export function validateSkill(skill: SkillDef, errors: string[]): boolean {
  if (!isSafeText(skill.id)) return fail(errors, `技能 id 非法: ${String(skill.id)}`);
  if (!isSafeText(skill.name)) return fail(errors, `${skill.id}: 技能名非法`);
  if (typeof skill.description !== 'string' || skill.description.length > 120) {
    return fail(errors, `${skill.id}: 描述超过 120 字`);
  }
  if (!skill.effect || typeof skill.effect.kind !== 'string') {
    return fail(errors, `${skill.id}: 缺少 effect.kind`);
  }
  const { effect } = skill;
  switch (effect.kind) {
    case 'gainCardAtStart':
    case 'peekAtTurnStart':
      if ((effect.count ?? 0) < 1 || (effect.count ?? 0) > 3) {
        return fail(errors, `${skill.id}: count 必须在 1-3`);
      }
      break;
    case 'immuneSteal':
    case 'returnNoped':
      if ((effect.times ?? 0) < 1 || (effect.times ?? 0) > 2) {
        return fail(errors, `${skill.id}: times 必须在 1-2`);
      }
      break;
    case 'activeSteal':
    case 'activeRecycle':
      if ((effect.costCards ?? 0) < 1 || (effect.costCards ?? 0) > 2) {
        return fail(errors, `${skill.id}: costCards 必须在 1-2`);
      }
      if ((effect.uses ?? 0) < 1 || (effect.uses ?? 0) > 3) {
        return fail(errors, `${skill.id}: uses 必须在 1-3`);
      }
      break;
    case 'activeSwap':
      if ((effect.uses ?? 0) < 1 || (effect.uses ?? 0) > 3) {
        return fail(errors, `${skill.id}: uses 必须在 1-3`);
      }
      break;
    case 'startWithSkip':
      if ((effect.count ?? 0) < 1 || (effect.count ?? 0) > 2) {
        return fail(errors, `${skill.id}: count 必须在 1-2`);
      }
      break;
    default:
      return fail(errors, `${skill.id}: 未知技能原型`);
  }
  return true;
}
