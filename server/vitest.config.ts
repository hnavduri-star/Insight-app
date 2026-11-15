import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://insight:insight@localhost:5432/insight_test' },
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
  },
});
