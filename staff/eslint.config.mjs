import { fixupConfigRules } from '@eslint/compat';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  // eslint-plugin-react (bundled by eslint-config-next) still calls rule-context APIs that
  // ESLint 10 removed; the official compat shim restores them (same fix as the app's config).
  ...fixupConfigRules([...nextVitals, ...nextTs]),
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
