import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const databaseUrl = join(process.env.RUNNER_TEMP ?? tmpdir(), 'descenders-e2e-pglite');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'pnpm demo && pnpm build && pnpm start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/signin',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: 'synthetic-e2e-secret-with-at-least-thirty-two-characters',
      AUTH_URL: 'http://127.0.0.1:3100',
      AUTH_DEV_LOGIN: '1',
      CURRENT_SEASON: '2026',
    },
  },
});
