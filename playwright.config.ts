import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
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
