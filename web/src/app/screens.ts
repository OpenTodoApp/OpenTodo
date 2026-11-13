// The app's screens, as Help screen ids (OpenSpec change docs-1-0, design D1):
// every route of the router, every Settings section and sub-page, and every
// dialog with a Help action. The docs build writes the list to
// web/src/generated/screen-ids.json, and the docs check fails for an id that no
// docs page declares in its `screens:` front matter, so no screen ships without
// a guide.
//
// This module has no runtime imports: the docs build loads it directly in Node.
import type { Route } from './router'

/**
 * The guide screen of each route. `null` is a page reached only from a link
 * (an invitation, a reset, a public list) or Help itself, explained by the guide
 * of the screen that makes the link. TypeScript fails when a route is added
 * without an entry; screens.test.ts names it.
 */
export const ROUTE_SCREENS: Record<Route['view'], string | null> = {
  inbox: 'inbox',
  today: 'today',
  upcoming: 'upcoming',
  someday: 'someday',
  anytime: 'anytime',
  day: 'calendar',
  week: 'calendar',
  month: 'calendar',
  plan: 'calendar',
  year: 'calendar',
  completed: 'completed',
  assigned: 'assigned',
  project: 'project',
  task: 'task-panel',
  label: 'label',
  labels: 'labels',
  places: 'locations',
  place: 'locations',
  rules: 'routines',
  projects: 'projects',
  filter: 'filter',
  views: 'filters',
  view: 'saved-filter',
  settings: 'settings',
  'theme-editor': 'themes-files',
  import: 'import',
  triage: 'inbox/triage',
  trash: 'trash',
  feed: 'updates',
  ask: 'ask',
  display: 'display',
  review: 'review',
  stats: 'stats',
  habits: 'habits',
  next: 'next',
  waiting: 'waiting',
  loop: 'loop',
  focus: 'focus',
  notes: 'notes',
  // Reached from a link someone sent or the app made; the guide of that link explains it.
  invite: null,
  'project-invite': null,
  'workspace-invite': null,
  reset: null,
  'confirm-email': null,
  forgot: null,
  verify: null,
  public: null,
  share: null,
  help: null,
}

/**
 * Settings: each section (`settings/<section>`) and the Help screen of each
 * sub-page (its `help` in settingsSections.ts). screens.test.ts keeps this
 * equal to SETTINGS_SECTIONS.
 */
export const SETTINGS_SCREENS: readonly string[] = [
  'settings/about', 'settings/access', 'settings/account', 'settings/activity', 'settings/appearance',
  'settings/assistant', 'settings/assistants', 'settings/attachments', 'settings/backups', 'settings/branding',
  'settings/caldav', 'settings/calendar', 'settings/calendar-feeds', 'settings/calendar-sync', 'settings/capture',
  'settings/data', 'settings/date-time', 'settings/digest', 'settings/email', 'settings/encryption', 'settings/focus',
  'settings/general', 'settings/integrations', 'settings/invitations', 'settings/issues', 'settings/keyboard',
  'settings/language', 'settings/notification-channels', 'settings/notifications', 'settings/outgoing-email',
  'settings/people', 'settings/priorities', 'settings/quick-add', 'settings/security', 'settings/server', 'settings/sso',
  'settings/start-view', 'settings/tokens', 'settings/users', 'settings/voice', 'settings/webhooks',
  'settings/workspaces',
]

/** Dialogs and panels with their own Help action. */
export const DIALOG_SCREENS: readonly string[] = [
  'share-dialog', 'project-fields', 'palette', 'templates', 'demo',
]

/** Every screen id, sorted. */
export const SCREEN_IDS: readonly string[] = [...new Set([
  ...Object.values(ROUTE_SCREENS).filter((s): s is string => s !== null),
  ...SETTINGS_SCREENS,
  ...DIALOG_SCREENS,
])].sort()
