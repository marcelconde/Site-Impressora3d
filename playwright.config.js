import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js', workers: 1,
  use: { baseURL: 'http://localhost:3000', serviceWorkers: 'block', headless: true, launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
});
