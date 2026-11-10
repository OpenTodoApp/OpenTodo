// The app's lint (OpenSpec change native-app-foundation D2): the Rules of Hooks, and
// the shared-code boundary. The app reaches web/src/lib only through @shared/*, never
// a web screen or building block, and never a browser-only package. A shared module
// that imports one of those packages is reported by scripts/shared-modules.mjs.
// Types are checked by tsc; formatting is not linted.
const tseslint = require('typescript-eslint')
const reactHooks = require('eslint-plugin-react-hooks')

const BROWSER_ONLY = ['react-dom', 'react-dom/*', 'dexie-react-hooks', 'prosemirror-*', 'maplibre-gl', 'maplibre-gl/*']

module.exports = [
  { ignores: ['node_modules/**', 'ios/**', 'android/**', '.expo/**', 'coverage/**', 'types/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', {
        paths: BROWSER_ONLY.filter((p) => !p.includes('*')).map((name) => ({ name, message: 'A browser-only package: the app draws native views (design D2).' })),
        patterns: [
          { group: BROWSER_ONLY.filter((p) => p.includes('*')), message: 'A browser-only package: the app draws native views (design D2).' },
          { regex: '(^|/)web/src/(app|ui)(/|$)', message: 'The app imports web screens and building blocks never; shared code is @shared/* (web/src/lib).' },
          { regex: '^@shared/.*\\.\\./', message: '@shared/* is web/src/lib only.' },
          // Shared vectors and fixtures (JSON) are read by path; code goes through @shared/*.
          { regex: '^(\\.\\./)+web/src/(?!locales(/|$))(?!.*\\.json$)', message: 'Import shared code as @shared/*, so the boundary check sees it.' },
        ],
      }],
    },
  },
]
