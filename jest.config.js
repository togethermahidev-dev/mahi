/**
 * Minimal ts-jest harness scoped to PURE logic tests only.
 *
 * We deliberately avoid `jest-expo` / a React Native test environment: these
 * tests exercise pure functions (no rendering, no native modules), so a plain
 * node environment compiled through ts-jest is faster and far less brittle.
 *
 * Only `*.test.ts` files are picked up. `.tsx` component tests are intentionally
 * out of scope here.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Only pure .ts tests — never .tsx (which would pull in RN rendering).
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  // Mirror the tsconfig `@/*` -> `./src/*` path alias so type-only imports
  // (and any value imports) resolve under ts-jest.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Type-only imports (e.g. `import type { Database }`) are erased and
        // we don't want full type-checking to slow the suite or fail on
        // unrelated app type issues.
        isolatedModules: true,
      },
    ],
  },
};
