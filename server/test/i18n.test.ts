import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MESSAGES, decodeMsg, formatMsg } from '@bombcat/shared';
import { GameEngine, type Rng } from '../src/engine/Engine.js';
import type { EngineEvent } from '../src/engine/types.js';
import { decide } from '../src/ai/BotBrain.js';

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

function seededRng(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('i18n 消息表', () => {
  it('每条消息 zh/en 非空且占位符一致，en 模板不含中文', () => {
    const keys = Object.keys(MESSAGES);
    expect(keys.length).toBeGreaterThan(100);
    for (const k of keys) {
      const { zh, en } = MESSAGES[k]!;
      expect(zh, k).toBeTruthy();
      expect(en, k).toBeTruthy();
      expect(new Set(placeholders(en)), k).toEqual(new Set(placeholders(zh)));
      expect(CJK.test(en), `${k}: ${en}`).toBe(false);
      expect(/^(log|err|note|room)\./.test(k), k).toBe(true);
    }
  });

  it('源码中引用的消息键都存在于 MESSAGES', () => {
    const files = ['../src/engine/Engine.ts', '../src/engine/objectives.ts', '../src/rooms/GameRoom.ts'];
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      for (const m of src.matchAll(/'((?:log|err|note|room)\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter((k) => !MESSAGES[k]);
    expect(missing).toEqual([]);
    // Engine 里不应再有直接传中文的 log / invalid 调用
    const engine = readFileSync(fileURLToPath(new URL('../src/engine/Engine.ts', import.meta.url)), 'utf8');
    expect(engine.match(/this\.(log|invalid)\([^,]+,\s*[`'"][^'`"]*[一-鿿]/g)).toBeNull();
  });
});

describe('i18n 引擎输出', () => {
  const CAST: Array<Record<string, string>> = [
    { Alice: 'butcher', Bob: 'phantom-thief', Carol: 'none', Dave: 'oracle' },
    { Alice: 'knight', Bob: 'alchemist', Carol: 'voyage', Dave: 'chaos_queen' },
    { Alice: 'future_queen', Bob: 'soup', Carol: 'bigEye', Dave: 'none' },
  ];

  it('机器人整局对弈：logMsgs 可解码，en 渲染无残留占位符与中文，zh 渲染与 logLines 一致', () => {
    let checked = 0;
    for (const [ci, cast] of CAST.entries()) {
      for (const seed of [11, 12, 13]) {
        const e = new GameEngine(seededRng(seed * 100 + ci));
        for (const name of Object.keys(cast)) e.addPlayer(`s:${name}`, '', name);
        for (const [name, ch] of Object.entries(cast)) e.setCharacter(`s:${name}`, ch);
        const seen = new Set<string>(e.logMsgs);
        const invalids: EngineEvent[] = [];
        const collect = (ev: EngineEvent[]) => {
          for (const x of ev) if (x.type === 'invalid') invalids.push(x);
          for (const m of e.logMsgs) seen.add(m);
        };
        collect(e.startGame(e.hostSessionId, null, {}));
        // 故意触发几条被拒操作
        collect(e.drawCard('s:nobody'));
        collect(e.playCard(e.current()!.sessionId, { instanceId: 'nope#0' }));

        for (let i = 0; i < 5000 && e.phase === 'playing'; i++) {
          if (e.subPhase === 'awaiting-nope') {
            collect(e.resolveNopes());
            continue;
          }
          const sid =
            e.subPhase === 'awaiting-defuse'
              ? e.pendingDefuse!.sessionId
              : e.subPhase === 'awaiting-alter'
                ? e.pendingAlter!.sessionId
                : e.current()!.sessionId;
          const d = decide(e, sid, null);
          if (!d) throw new Error('bot 无决策: ' + e.subPhase);
          let ev: EngineEvent[];
          if (d.kind === 'draw') ev = e.drawCard(sid);
          else if (d.kind === 'defuse') ev = e.defusePosition(sid, d.position);
          else if (d.kind === 'alter') ev = e.alterFutureOrder(sid, d.order);
          else if (d.kind === 'butcherCleave') ev = e.useSkill(sid, { skillId: d.skillId, targetSessionId: d.targetSessionId });
          else if (d.kind === 'play') {
            ev = e.playCard(sid, d);
            if (ev.some((x) => x.type === 'invalid')) {
              collect(ev);
              ev = e.drawCard(sid);
            }
          } else ev = e.drawCard(sid);
          collect(ev);
        }
        expect(e.phase).toBe('finished');

        // zh 渲染与 logLines 一一对应
        expect(e.logMsgs.length).toBe(e.logLines.length);
        e.logMsgs.forEach((m, i) => expect(formatMsg('zh', m)).toBe(e.logLines[i]));

        for (const m of seen) {
          const msg = decodeMsg(m);
          expect(msg, m).not.toBeNull();
          expect(MESSAGES[msg!.k], m).toBeDefined();
          const en = formatMsg('en', msg);
          expect(en, m).not.toMatch(/\{\w+\}/);
          expect(CJK.test(en), `${m} → ${en}`).toBe(false);
          checked++;
        }
        for (const x of invalids) {
          if (x.type !== 'invalid') continue;
          expect(formatMsg('zh', x.msg)).toBe(x.message);
          const en = formatMsg('en', x.msg);
          expect(en).not.toMatch(/\{\w+\}/);
          expect(CJK.test(en), en).toBe(false);
        }
        expect(invalids.length).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
