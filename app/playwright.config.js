const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseURL = process.env.WMS_BASE_URL || 'http://localhost:3000';
module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: fs.existsSync(chrome) ? { executablePath: chrome } : {},
  },
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
