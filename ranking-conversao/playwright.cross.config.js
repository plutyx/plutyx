import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  testMatch:/(public-surfaces|experience)\.spec\.js/,
  fullyParallel:false,
  workers:5,
  retries:0,
  timeout:30000,
  expect:{timeout:15000},
  reporter:'line',
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'desktop-firefox',use:{...devices['Desktop Firefox']}},
    {name:'desktop-webkit',use:{...devices['Desktop Safari']}},
    {name:'android-chromium',use:{...devices['Pixel 7']}},
    {name:'ios-webkit',use:{...devices['iPhone 15']}}
  ]
});
