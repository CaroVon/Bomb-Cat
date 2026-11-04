import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // 客户端按浏览器语言选择中/英；E2E 用例按中文按钮名定位，固定中文 locale
    locale: 'zh-CN',
    trace: 'off',
  },
  webServer: [
    {
      command: 'npm run dev -w @bombcat/server',
      port: 2567,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @bombcat/client',
      port: 5173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
