import { defineConfig } from 'vitest/config';

/** Unit tests sit next to the code (src/**\/*.spec.ts); e2e tests boot the whole app (test/**\/*.e2e-spec.ts). */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    globalSetup: ['./test/setup/mongo.global-setup.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      { extends: true, test: { name: 'e2e', include: ['test/**/*.e2e-spec.ts'] } },
    ],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
