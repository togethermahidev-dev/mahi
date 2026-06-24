// Flat ESLint config for an Expo / React Native (TypeScript) project.
// Kept intentionally minimal and lenient: Expo's shared config provides the
// React Native rule baseline, eslint-config-prettier turns off any formatting
// rules so Prettier is the single source of truth for style.
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      'dist/**',
      'build/**',
      'graphify-out/**',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      '.expo/**',
    ],
  },
  {
    rules: {
      // Prefer warnings over errors so existing code is not flooded with
      // blocking failures. Tighten these incrementally over time.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
      'react/no-unescaped-entities': 'off',

      // The React Compiler rule family (shipped as errors by eslint-config-expo
      // 56) flags long-standing, working React Native patterns such as
      // `useRef(new Animated.Value(0)).current`. Downgrade to warnings so they
      // surface for incremental cleanup without blocking `pnpm lint`.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
