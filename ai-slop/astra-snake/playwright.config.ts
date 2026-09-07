import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5186', viewport: { width: 1280, height: 800 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--use-angle=metal'] } },
  webServer: { command: 'npm run dev -- --port 5186 --strictPort', cwd: fileURLToPath(new URL('../..', import.meta.url)), url: 'http://127.0.0.1:5186/ai-slop/astra-snake/', reuseExistingServer: true, timeout: 15000 },
});
