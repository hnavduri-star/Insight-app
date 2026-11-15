import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', OPEN_ACCESS: '', ADMIN_EMAILS: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', BILLING_TEST_MODE: '', TEST_PRICE_MONTHLY_USD: '', TEST_PRICE_ANNUAL_USD: '', STRIPE_SECRET_KEY: '', DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://insight:insight@localhost:5432/insight_test' },
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
  },
});
