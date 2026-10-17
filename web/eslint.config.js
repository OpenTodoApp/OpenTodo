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
    // Function size (OpenSpec web-component-structure): a component or hook longer
    // than 250 lines is split into hooks, pure functions in src/lib and smaller
    // bodies. Tests, stories and test kits are exempt (a describe block is long).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*.testkit.{ts,tsx}', 'src/**/*.stories.{ts,tsx}'],
    rules: { 'max-lines-per-function': ['error', { max: 250, IIFEs: true }] },
  },
  // Allow-list: functions that were already longer than 250 lines when the limit
  // came in. Each entry is a ceiling a little above its size then; lower it as the
  // function is split and drop the entry once it fits. Never raise one.
  ...[
    ['src/app/Sidebar.tsx', 440], // Sidebar (426): projects tree, counts, drag and its menus in one component
    ['src/app/AuthScreen.tsx', 320], // AuthScreen (309): sign-in, setup, second factor and SSO steps
    ['src/app/TimelineView.tsx', 270], // TimelineView (263): bars, drag and keyboard of the project timeline
    ['src/app/App.tsx', 270], // App (256): boot, auth state and routing
    ['src/app/FilterView.tsx', 260], // FilterView (254): query editor, saved views and results
    ['src/lib/db.ts', 290], // the Dexie constructor (277): one schema version per release, kept together on purpose
  ].map(([file, max]) => ({ files: [file], rules: { 'max-lines-per-function': ['error', { max, IIFEs: true }] } })),
  {
    // Data-layer tests and test kits: useDatabase(name) opens a named Dexie
    // database (lib/db.ts) and `use` is a local test helper; neither is a React hook.
    files: ['src/**/*.test.ts', 'src/**/*.testkit.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]
