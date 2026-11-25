// ESLint has two jobs here: the Rules of Hooks and effect dependencies (OpenSpec
// web-lint-and-test-hygiene), names that assistive technology ignores
// (assistive-tech-semantics, a local rule in eslint/), and the layering of the web
// app (web-layering): src/ui never imports src/app, and screens in src/app read
// local data through src/lib, never IndexedDB. Types are checked by tsc,
// design rules by scripts/ui-check.mjs; formatting and style are deliberately not linted.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import noGenericAriaLabel from './eslint/no-generic-aria-label.js'
import noFixedWait from './eslint/no-fixed-wait.js'

// One lazy() for the app (OpenSpec change lazy-retry-online): React's keeps a failed
// import forever, src/lib/lazy.ts lets a part that failed offline load again.
const reactLazy = { name: 'react', importNames: ['lazy'], message: "Import lazy from src/lib/lazy: React's keeps a failed import (lazy-retry-online)." }

// What the phone UI may import from src/app (phone-ui-trial D1, D4): the hooks and
// models both sets of screens run on, and the editors and sections the phone task
// page shows as they are. Paths are relative to src/app. A desktop screen is never
// listed; when one holds logic a phone screen needs, the logic moves to a hook first.
const PHONE_MAY_IMPORT = [
  // Shared hooks and models.
  'router', 'undoable', 'motion', 'actionError', 'signals', 'taskTrail', 'panel', 'PanelHost', 'useViews', 'DateTimePrefsProvider', 'shortcuts',
  'task-list/useListModel', 'task-list/useClosedList', 'task-list/RowSwipe', 'calendar/TodayAgenda',
  'task-detail/useTaskDetail', 'task-detail/useTaskFacts', 'task-detail/usePropertiesModel', 'task-detail/occurrenceView', 'task-detail/taskPageProps',
  // Editors and sections shown unchanged.
  'task-detail/Facets', 'task-detail/TaskActionsMenu', 'task-detail/TaskNotes', 'task-detail/Subtasks', 'task-detail/FieldsGroup',
  'task-detail/AttachmentsRow', 'task-detail/ConversationTabs', 'task-detail/TaskHead', 'task-detail/TaskPageDialog', 'task-detail/RotationLine',
  'task-detail/WhenControl', 'task-list/EarlierActions', 'habits/TodayStrip', 'TitleField', 'LabelPicker', 'ProjectMark', 'locations/LocationPreview', 'SampleNotice',
  // The task list (phone-lists D1 to D5): its wiring, its groups and row renderer, and the parts of a list shown as they are.
  'task-list/useListScreen', 'task-list/ListGroups', 'task-list/ListHeader', 'task-list/ListChrome', 'task-list/TaskListRow', 'task-list/rowHold', 'task-list/rowDraw', 'task-list/belowLine', 'listDrop',
  'bulk/BulkActions', 'useUrgency', 'ProjectHeader', 'ProjectNote', 'Markdown', 'Sections', 'CloseDayRow', 'routines/InboxSlot', 'calendar/UpcomingAgenda', 'completed/CompletedBar',
]

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
      'no-restricted-imports': ['error', { paths: [reactLazy] }],
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
  {
    // Tests wait for a condition, never for a fixed time (test audit F2): `await
    // flush(40)` before an assertion passes on an idle laptop and fails on a loaded
    // CI runner. Use waitFor from ui/test-utils. A wait that is itself the behaviour
    // under test keeps a reasoned `eslint-disable-next-line test-hygiene/no-fixed-wait -- why`.
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.testkit.{ts,tsx}'],
    plugins: { 'test-hygiene': { rules: { 'no-fixed-wait': noFixedWait } } },
    rules: { 'test-hygiene/no-fixed-wait': 'error' },
  },
  {
    // The design system stands alone (web-layering): primitives are tested and shown
    // in the workbench without the screens, so nothing under src/ui imports src/app.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [reactLazy], patterns: [{ regex: '(^|/)app(/|$)', message: 'src/ui must not import from src/app (web-layering); move what it needs into src/ui or src/lib.' }] }],
    },
  },
  // Screens read local data through src/lib (web-layering, AGENTS.md "data access
  // only via src/lib"): lib/localData.ts and lib/liveTasks.ts hold the shared live
  // snapshots and the one visibility rule. Only the sign-out and storage lifecycle
  // calls of lib/db are open to screens. Tests and test kits seed the database.
  // The phone UI (src/phone, OpenSpec phone-ui-trial D1) is held to the same rule,
  // and the two sets of screens are kept apart: a desktop screen imports the phone
  // UI only where it is chosen (Shell) and switched on (PreferencesPanels), and a
  // phone screen imports from src/app only the shared hooks, models and editors
  // listed in PHONE_MAY_IMPORT, never a desktop screen.
  ...[
    { files: ['src/app/**/*.{ts,tsx}'], ignores: ['src/app/Shell.tsx', 'src/app/PreferencesPanels.tsx'], extra: [{ regex: '(^|/)phone(/|$)', message: 'Only Shell.tsx and PreferencesPanels.tsx import the phone UI (phone-ui-trial D1).' }] },
    { files: ['src/app/Shell.tsx', 'src/app/PreferencesPanels.tsx'], ignores: [], extra: [] },
    { files: ['src/phone/**/*.{ts,tsx}'], ignores: [], extra: [{ regex: `(^|/)app/(?!(${PHONE_MAY_IMPORT.join('|')})$)`, message: 'A phone screen imports from src/app only what PHONE_MAY_IMPORT lists (shared hooks, models and editors), never a desktop screen (phone-ui-trial D1).' }] },
  ].map(({ files, ignores, extra }) => ({
    files,
    ignores: [...ignores, 'src/**/*.test.{ts,tsx}', 'src/**/*.testkit.tsx', 'src/**/*.stories.tsx', 'src/app/stories/**', 'src/phone/stories/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '(^|/)lib/db$', allowImportNames: ['clearLocalData', 'hasLocalData', 'requestPersistentStorage'],
          message: 'Screens read local data through src/lib (lib/localData.ts, lib/liveTasks.ts), not lib/db (web-layering).',
        }, ...extra],
        // Every live read is a named hook in src/lib (wave 4, M5): shared snapshots
        // where one exists (lib/localData.ts), else a hook beside its query.
        paths: [reactLazy, { name: 'dexie-react-hooks', message: 'Screens read live data through a named hook in src/lib (lib/localData.ts or beside the query), not useLiveQuery.' }],
      }],
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.name='db']",
        message: 'Screens read local data through src/lib (lib/localData.ts, lib/liveTasks.ts), not the Dexie database (web-layering).',
      }],
    },
  })),
  // The one place React's lazy() is wrapped.
  { files: ['src/lib/lazy.ts'], rules: { 'no-restricted-imports': 'off' } },
]
