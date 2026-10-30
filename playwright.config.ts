import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 60_000, retries: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run build && npm run start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 180_000 },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
