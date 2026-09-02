import { expect, test, type Page } from '@playwright/test';

/**
 * 双人联机 E2E（Playwright 多 browser context 官方支持的多用户场景）：
 * 两个独立 context = 两个独立玩家（各自的 sessionStorage 身份）。
 */

async function loginAsGuest(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(name);
  await page.getByRole('button', { name: '进入大厅' }).click();
  await expect(page.getByText('游戏大厅')).toBeVisible({ timeout: 10_000 });
}

test('双人联机全流程：建房→加入→开局→出牌→对手看到', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // 玩家 A 登录并创建房间
  await loginAsGuest(a, 'E2E猫王');
  await a.getByRole('button', { name: '创建房间' }).first().click();
  await expect(a.getByText('等待室')).toBeVisible({ timeout: 10_000 });
  const codeEl = a.locator('.room-code-big');
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{4}$/);

  // 玩家 B 登录并用房间码加入
  await loginAsGuest(b, 'E2E鱼条');
  await b.getByRole('textbox', { name: '房间码' }).fill(code);
  await b.getByRole('button', { name: '加入', exact: true }).click();
  await expect(b.getByText('等待室')).toBeVisible({ timeout: 10_000 });
  // 双方都能看到对方
  await expect(a.getByText('E2E鱼条')).toBeVisible({ timeout: 10_000 });

  // 房主开局
  await a.getByRole('button', { name: /开始游戏/ }).click();

  // 两端都进入牌桌并拿到 7 张手牌
  for (const page of [a, b]) {
    await expect(page.locator('.handfan .pcard')).toHaveCount(7, { timeout: 15_000 });
    await expect(page.locator('.draw-pile')).toBeVisible();
  }

  // 先手方打出一张不需要目标的牌（或直接摸牌），另一端应看到变化
  const turnTextA = await a.locator('.status-turn').innerText();
  const actor = turnTextA.includes('轮到你了') ? a : b;
  const observer = actor === a ? b : a;

  const drawBtn = actor.getByRole('button', { name: /摸牌/ });
  await expect(drawBtn).toBeEnabled({ timeout: 10_000 });
  const deckBefore = await observer.locator('.pile-count').first().innerText();
  await drawBtn.click();

  // 观察方看到牌堆数变化（摸牌使牌堆-1）
  await expect
    .poll(async () => observer.locator('.pile-count').first().innerText(), { timeout: 15_000 })
    .not.toEqual(deckBefore);

  // 清理
  await ctxA.close();
  await ctxB.close();
});

test('人机练习：单按钮即刻开局', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsGuest(page, 'E2E练习生');
  await page.getByRole('button', { name: /人机练习/ }).click();

  // 自动开局（~1s 内补 2 bot），进入牌桌
  await expect(page.locator('.handfan .pcard')).toHaveCount(7, { timeout: 20_000 });
  // 席位含 AI 玩家
  await expect(page.locator('.seat-v2', { hasText: 'AI·' }).first()).toBeVisible();
  await ctx.close();
});
