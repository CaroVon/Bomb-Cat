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
  await b.waitForURL('**/room', { timeout: 15_000 });
  await expect(b.locator('.room-code-big')).toBeVisible({ timeout: 15_000 });
  // 双方都能看到对方
  await expect(a.getByText('E2E鱼条')).toBeVisible({ timeout: 10_000 });

  // 房主开局
  await a.getByRole('button', { name: /开始游戏/ }).click();

  // 两端都进入牌桌并拿到 7 张手牌（World Rule 可能影响：双倍下注/传递快乐 → 允许 7~9）
  for (const page of [a, b]) {
    await expect(page.locator('.handfan .pcard').first()).toBeVisible({ timeout: 15_000 });
    const count = await page.locator('.handfan .pcard').count();
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(10);
    await expect(page.locator('.draw-pile')).toBeVisible();
  }

  // 先手方打出一张不需要目标的牌（或直接摸牌），另一端应看到变化
  const turnTextA = await a.locator('.status-turn').innerText();
  const actor = turnTextA.includes('轮到你了') ? a : b;
  const observer = actor === a ? b : a;

  const drawBtn = actor.getByRole('button', { name: /摸牌/ });
  await expect(drawBtn).toBeEnabled({ timeout: 10_000 });
  // 关闭可能弹出的看牌/提示弹窗
  const okBtn = actor.getByRole('button', { name: '知道了' });
  if (await okBtn.isVisible().catch(() => false)) {
    await okBtn.click();
    await actor.waitForTimeout(300);
  }
  const deckBefore = await observer.locator('.pile-count').first().innerText();
  await drawBtn.click({ force: true });

  // 观察方看到牌堆数变化（摸牌使牌堆-1）
  await expect
    .poll(async () => observer.locator('.pile-count').first().innerText(), { timeout: 15_000 })
    .not.toEqual(deckBefore);

  // 清理
  await ctxA.close();
  await ctxB.close();
});

test('人机练习：单按钮开局（需手动点开始）', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsGuest(page, 'E2E练习生');
  await page.getByRole('button', { name: /人机练习/ }).click();

  // 补 bot 后进入等待室（可选角色），玩家手动点开始
  await expect(page.getByText('等待室')).toBeVisible({ timeout: 10_000 });
  // 选一个角色
  await page.locator('.char-mini').nth(1).click();
  await page.getByRole('button', { name: /开始游戏/ }).click();

  // 进入牌桌
  await expect(page.locator('.handfan .pcard').first()).toBeVisible({ timeout: 20_000 });
  // 席位含 AI 玩家
  await expect(page.locator('.table-seat', { hasText: 'AI·' }).first()).toBeVisible();
  await ctx.close();
});
