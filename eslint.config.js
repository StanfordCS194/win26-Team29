//  @ts-check
import { tanstackConfig } from '@tanstack/eslint-config'
import tsParser from '@typescript-eslint/parser'
import promisePlugin from 'eslint-plugin-promise'
import securityPlugin from 'eslint-plugin-security'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'

export default [
  ...tanstackConfig,

  {
    ignores: ['**/.netlify/**', '**/routeTree.gen.ts'],
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './app/tsconfig.json',
          './scrape/tsconfig.json',
          './db/tsconfig.json',
          './tsconfig.tooling.json',
        ],
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
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', args: 'after-used', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-return-wrap': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'warn',
    },
  },
]
