import { describe, expect, it } from 'vitest';
import { BUILTIN_CARDS } from '../src/cards';
import { BUILTIN_CHARACTERS, CHARACTER_RPG } from '../src/characters';
import { OBJECTIVES, RUN_BONUSES, WORLD_RULES } from '../src/rules';
import { CARD_EN, CHAR_EN, OBJECTIVE_EN, RUN_BONUS_EN, WORLD_RULE_EN } from '../src/i18n/content';

/** 提取文本中的阿拉伯数字，排序后作为多重集比较 */
const digits = (s: string): string[] => (s.match(/\d+/g) ?? []).sort();

/**
 * 数字一致性白名单（key = 条目路径）。目前为空：
 * 中文里用汉字写的数（"一张""两张"）英文也用单词写，因此数字多重集应完全一致。
 * 若确有合理例外，在这里加 key 并注释原因。
 */
const DIGIT_ALLOW: ReadonlySet<string> = new Set<string>([]);

const nonEmpty = (s: string | undefined) => typeof s === 'string' && s.trim().length > 0;

function expectSameDigits(key: string, zh: string, en: string) {
  if (DIGIT_ALLOW.has(key)) return;
  expect(digits(en), `${key}: numbers differ\n  zh: ${zh}\n  en: ${en}`).toEqual(digits(zh));
}

describe('内置内容英文文本', () => {
  it('每张内置卡都有英文名称与描述，且数字一致', () => {
    for (const c of BUILTIN_CARDS) {
      const en = CARD_EN[c.id];
      expect(en, `card ${c.id} missing`).toBeDefined();
      expect(nonEmpty(en!.name), `card ${c.id} name`).toBe(true);
      expect(nonEmpty(en!.description), `card ${c.id} description`).toBe(true);
      expectSameDigits(`card:${c.id}`, c.description, en!.description);
    }
  });

  it('每个内置角色都有英文名/副标题/描述/背景，每个技能都有英文，且数字一致', () => {
    for (const ch of BUILTIN_CHARACTERS) {
      const en = CHAR_EN[ch.id];
      expect(en, `character ${ch.id} missing`).toBeDefined();
      expect(nonEmpty(en!.name), `character ${ch.id} name`).toBe(true);
      expect(nonEmpty(en!.title), `character ${ch.id} title`).toBe(true);
      expect(nonEmpty(en!.description), `character ${ch.id} description`).toBe(true);
      if (CHARACTER_RPG[ch.id]?.lore) expect(nonEmpty(en!.lore), `character ${ch.id} lore`).toBe(true);
      expectSameDigits(`char:${ch.id}`, ch.description, en!.description);
      for (const sk of ch.skills) {
        const s = en!.skills?.[sk.id];
        expect(s, `skill ${ch.id}/${sk.id} missing`).toBeDefined();
        expect(nonEmpty(s!.name), `skill ${ch.id}/${sk.id} name`).toBe(true);
        expect(nonEmpty(s!.description), `skill ${ch.id}/${sk.id} description`).toBe(true);
        expectSameDigits(`skill:${ch.id}/${sk.id}`, sk.description, s!.description);
      }
      // 不允许多余的技能 key（防止 id 拼错）
      const validIds = new Set(ch.skills.map((s) => s.id));
      for (const k of Object.keys(en!.skills ?? {})) {
        expect(validIds.has(k), `skill key ${ch.id}/${k} not in characters.ts`).toBe(true);
      }
    }
  });

  it('全局规则 / 秘密任务 / 挑战增益都有英文，且数字一致', () => {
    const groups: [string, { id: string; description: string }[], Record<string, { name: string; description: string }>][] = [
      ['rule', WORLD_RULES, WORLD_RULE_EN],
      ['obj', OBJECTIVES, OBJECTIVE_EN],
      ['bonus', RUN_BONUSES, RUN_BONUS_EN],
    ];
    for (const [kind, defs, map] of groups) {
      for (const d of defs) {
        const en = map[d.id];
        expect(en, `${kind} ${d.id} missing`).toBeDefined();
        expect(nonEmpty(en!.name), `${kind} ${d.id} name`).toBe(true);
        expect(nonEmpty(en!.description), `${kind} ${d.id} description`).toBe(true);
        expectSameDigits(`${kind}:${d.id}`, d.description, en!.description);
      }
    }
  });

  it('英文表里没有孤立 id（对应的中文定义都存在）', () => {
    const check = (map: Record<string, unknown>, ids: string[], kind: string) => {
      const set = new Set(ids);
      for (const k of Object.keys(map)) expect(set.has(k), `${kind} ${k} has no builtin definition`).toBe(true);
    };
    check(CARD_EN, BUILTIN_CARDS.map((c) => c.id), 'card');
    check(CHAR_EN, BUILTIN_CHARACTERS.map((c) => c.id), 'character');
    check(WORLD_RULE_EN, WORLD_RULES.map((r) => r.id), 'rule');
    check(OBJECTIVE_EN, OBJECTIVES.map((o) => o.id), 'obj');
    check(RUN_BONUS_EN, RUN_BONUSES.map((b) => b.id), 'bonus');
  });
});
