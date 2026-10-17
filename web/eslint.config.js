// ESLint has two jobs here: the Rules of Hooks and effect dependencies (OpenSpec
// web-lint-and-test-hygiene), and names that assistive technology ignores
// (assistive-tech-semantics, a local rule in eslint/). Types are checked by tsc,
// design rules by scripts/ui-check.mjs; formatting and style are deliberately not linted.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import noGenericAriaLabel from './eslint/no-generic-aria-label.js'

export default [
  { ignores: ['node_modules/**', 'storybook-static/**', 'public/**', 'scripts/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    // A suppression that no longer suppresses anything fails the lint, so every
    // remaining eslint-disable comment is load-bearing.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks, a11y: { rules: { 'no-generic-aria-label': noGenericAriaLabel } } },
    // Only the two classic hook rules. The plugin's React Compiler diagnostics
    // (refs, purity, set-state-in-effect, ...) target code compiled by the React
    // Compiler, which this app does not use; see the change's design.md.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'a11y/no-generic-aria-label': 'error',
    },
  },
  {
    // Data-layer tests and test kits: useDatabase(name) opens a named Dexie
    // database (lib/db.ts) and `use` is a local test helper; neither is a React hook.
    files: ['src/**/*.test.ts', 'src/**/*.testkit.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]
