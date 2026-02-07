import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Exclude GitHub E2E tests by default (run separately via --include pattern)
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
    // Increased timeout for E2E tests that make real API calls
    testTimeout: 30000,
    // Hook timeout for beforeAll/afterAll with cleanup
    hookTimeout: 60000,
  },
});
