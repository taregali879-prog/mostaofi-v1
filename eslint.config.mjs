import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', 'evidence/**', 'spec/**', 'governance/**', 'apps/web/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    languageOptions: {
      globals: Object.fromEntries(['process','console','Buffer','fetch','URL','URLSearchParams','Headers','Response','TextEncoder','DOMException','global','AbortController','AbortSignal','setTimeout','clearTimeout','setInterval','clearInterval','localStorage','window','document','FormData','performance','__dirname','describe','it','test','expect','jest','beforeAll','afterAll','beforeEach','afterEach'].map(name => [name, 'readonly'])),
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
    },
  },
);
