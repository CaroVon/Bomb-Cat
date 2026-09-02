import { expect, test } from '@playwright/test';

/** 定制工坊：卡组分享码导出→导入回环 */
test('卡组分享码：导出后可导入还原', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').first().fill('E2E工匠');
  await page.getByRole('button', { name: '进入大厅' }).click();
  await expect(page.getByText('游戏大厅')).toBeVisible({ timeout: 10_000 });

  // 进入定制工坊，基于经典新建并改名
  await page.getByRole('link', { name: '定制工坊' }).click();
  await page.getByRole('button', { name: '基于经典卡组新建' }).click();
  const nameInput = page.locator('.modal input').first();
  await nameInput.fill('回环测试卡组');
  // 在编辑弹窗内加扩展（新卡数量入组）再保存
  await page.locator('.modal').getByRole('button', { name: '+ 内爆扩展' }).click();
  await page.getByRole('button', { name: '保存卡组' }).click();
  await expect(page.locator('.modal')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.char-card', { hasText: '回环测试卡组' })).toBeVisible();

  // 导出分享码
  await page.locator('.char-card', { hasText: '回环测试卡组' }).getByRole('button', { name: '分享' }).click();
  const codeArea = page.locator('.modal textarea');
  await expect(codeArea).toBeVisible();
  const code = (await codeArea.inputValue()).trim();
  expect(code).toMatch(/^BM1\./);
  await page.getByRole('button', { name: '复制并关闭' }).click();

  // 导入（粘贴到顶部导入框）
  await page.getByPlaceholder('粘贴卡组分享码').fill(code);
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await expect(page.getByText(/已导入「回环测试卡组」/)).toBeVisible({ timeout: 10_000 });
  // 卡组列表出现两张同名卡（原版 + 导入副本）
  expect(await page.locator('.char-card', { hasText: '回环测试卡组' }).count()).toBeGreaterThanOrEqual(2);
});

test('分享码防篡改：非法码被拒绝', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').first().fill('E2E审核员');
  await page.getByRole('button', { name: '进入大厅' }).click();
  await page.getByRole('link', { name: '定制工坊' }).click();

  await page.getByPlaceholder('粘贴卡组分享码').fill('BM1.垃圾数据!!!');
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await expect(page.getByText(/解析失败|不合法/).first()).toBeVisible({ timeout: 10_000 });
});
