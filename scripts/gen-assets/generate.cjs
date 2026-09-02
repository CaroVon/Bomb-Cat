#!/usr/bin/env node
/**
 * 一键批量出图:
 *   npm run gen-assets          全部(14 卡 + 7 角色 + 3 背景)
 *   npm run gen-assets -- --only=cards|chars|bgs
 *   npm run gen-assets -- --only=exploding,defuse,attack   # 指定 id
 *
 * 失败:跳到下一张,不中断。最后打印 OK / FAIL 总结。
 *
 * .env 读取通过 dotenv(若安装);否则通过 os.environ。
 */
const fs = require('node:fs');
const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
} catch {
  /* dotenv 未装则用进程环境 */
}

const { CARDS, CHARACTERS, BACKGROUNDS } = require('./prompts.cjs');
const { pickProvider } = require('./providers.cjs');

const OUT_ROOT = path.resolve(__dirname, '..', '..', 'client', 'public', 'assets');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { only: null };
  for (const a of args) {
    if (a.startsWith('--only=')) {
      opts.only = a.slice(7).split(',').map((s) => s.trim());
    }
  }
  return opts;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function outPath(group, id, buf) {
  // cards 走 cards/front/,其他组直接 OUT_ROOT/<group>/
  const sub = group === 'cards' ? 'front' : '';
  const dir = sub ? path.join(OUT_ROOT, group, sub) : path.join(OUT_ROOT, group);
  ensureDir(dir);
  // 按图片 magic bytes 自动判定扩展名(minimax image-01 返回 JPEG,不是 PNG,也不带 alpha)
  let ext = 'png';
  if (buf && buf.length >= 4) {
    const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
    if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) ext = 'jpg';
    else if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) ext = 'png';
    else if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) ext = 'gif';
    else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ext = 'webp';
  }
  return path.join(dir, `${id}.${ext}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateOne(fn, item) {
  const t0 = Date.now();
  const buf = await fn(item.prompt, item.negative, item.size);
  const dst = outPath(item.group, item.id, buf);
  fs.writeFileSync(dst, buf);
  return { id: item.id, group: item.group, ok: true, ms: Date.now() - t0, dst };
}

async function run() {
  const { name: provider } = pickProvider();
  console.log(`[gen-assets] provider = ${provider}`);

  const { fn } = pickProvider();
  const args = parseArgs();

  const items = [];
  if (!args.only || args.only.includes('cards') || hasAnyId(args.only, CARDS)) {
    items.push(
      ...CARDS.filter((c) => !args.only || (args.only.includes('cards') || args.only.includes(c.id))).map(
        (c) => ({ group: 'cards', ...c }),
      ),
    );
  }
  if (!args.only || args.only.includes('chars') || hasAnyId(args.only, CHARACTERS)) {
    items.push(
      ...CHARACTERS.filter((c) => !args.only || (args.only.includes('chars') || args.only.includes(c.id))).map(
        (c) => ({ group: 'characters', ...c }),
      ),
    );
  }
  if (!args.only || args.only.includes('bgs') || hasAnyId(args.only, BACKGROUNDS)) {
    items.push(
      ...BACKGROUNDS.filter((c) => !args.only || (args.only.includes('bgs') || args.only.includes(c.id))).map(
        (c) => ({ group: 'lobby', ...c }),
      ),
    );
  }

  if (items.length === 0) {
    console.log('[gen-assets] 没有匹配的资产(--only 解析失败?)');
    return;
  }
  console.log(`[gen-assets] 计划生成 ${items.length} 项`);

  const results = [];
  for (const it of items) {
    process.stdout.write(`  · ${it.group}/${it.id} ... `);
    try {
      const r = await generateOne(fn, it);
      console.log(`OK (${r.ms}ms) -> ${path.relative(process.cwd(), r.dst)}`);
      results.push(r);
      await sleep(400); // 简单节流
    } catch (e) {
      console.log(`FAIL — ${e.message}`);
      results.push({ id: it.id, group: it.group, ok: false, error: e.message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n[gen-assets] 完成: ${ok}/${results.length} 成功`);
  if (ok !== results.length) {
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  FAIL ${r.group}/${r.id}: ${r.error}`);
    }
    process.exitCode = 1;
  }
}

function hasAnyId(onlyList, list) {
  if (!onlyList) return false;
  const set = new Set(list.map((x) => x.id));
  return onlyList.some((x) => set.has(x));
}

run().catch((e) => {
  console.error('[gen-assets] fatal:', e);
  process.exit(2);
});
