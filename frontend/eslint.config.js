import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Same as the Vite React template: allow unused constants/components
      // such as the legacy `import React from 'react'`.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', caughtErrors: 'none' }],
    },
  },
  {
    // Classic Web Worker served from /public (uses importScripts).
    files: ['public/workers/**/*.js'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['src/**/*.test.js', 'vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
])
