// @ts-check
import { tanstackConfig } from '@tanstack/eslint-config'
import tsParser from '@typescript-eslint/parser'
import promisePlugin from 'eslint-plugin-promise'
import securityPlugin from 'eslint-plugin-security'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'
import pluginQuery from '@tanstack/eslint-plugin-query'
import pluginRouter from '@tanstack/eslint-plugin-router'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tanstackConfig,

  {
    ignores: ['**/.netlify/**', '**/routeTree.gen.ts', '**/dist/**'],
  },

  // ── Base config for all TS/JS files ──
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        project: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImportsPlugin,
      sonarjs: sonarjsPlugin,
      promise: promisePlugin,
      security: securityPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: [
            './app/tsconfig.json',
            './scrape/tsconfig.json',
            './db/tsconfig.json',
            './tsconfig.tooling.json',
          ],
        },
      },
    },
    rules: {
      // ── Unused imports ──
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', args: 'after-used', ignoreRestSiblings: true },
      ],

      // ── Promise safety ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-return-wrap': 'warn',

      // ── Bug prevention ──
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-misused-spread': 'error',
      '@typescript-eslint/no-array-delete': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',

      // ── Code quality ──
      '@typescript-eslint/no-unnecessary-type-arguments': 'warn',
      '@typescript-eslint/no-unnecessary-template-expression': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': 'warn',

      // ── Lower priority ──
      '@typescript-eslint/no-confusing-void-expression': 'warn',
      '@typescript-eslint/no-unnecessary-type-conversion': 'warn',
      '@typescript-eslint/prefer-includes': 'warn',
      '@typescript-eslint/prefer-string-starts-ends-with': 'warn',

      // ── Security ──
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'warn',
    },
  },

  // ── React-only: hooks, query, router (scoped to app) ──
  {
    files: ['app/**/*.tsx', 'app/**/*.ts'],
    ...reactHooks.configs.flat.recommended,
  },
  ...pluginQuery.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['app/**/*.tsx', 'app/**/*.ts'],
  })),
  ...pluginRouter.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['app/**/*.tsx', 'app/**/*.ts'],
  })),
]
