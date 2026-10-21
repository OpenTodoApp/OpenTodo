# Proposal

## Why

The lists keep their budget on paper (header, quick add, first task) but not on screen. Every list shows a "? Help" line under the add field (`web/src/app/QuickAdd.tsx` offers it for the first three adds on a device, which on the demo and on every new browser means always), duplicating the Help icon already in the page header. On the demo the banner is three lines of text pinned above the shell at phone width. On a first visit the Inbox holds a three-step card ("Step 2 of 3: How do you want to work?") that fills a phone screen before a single task. Empty views show an icon, a sentence, a hint line and up to three buttons. None of this is a task; all of it is between the person and their first row. The UX audit named each one (F1 the Help link under the quick add, G7 the demo note, I3 and I4 the first run and the empty states); this change removes them from the list and puts the guidance where it does not cost a row.

## What Changes

- **The Help line under the quick add goes.** Contextual help stays on the page header's Help action, which keeps opening the view's guide section; that section leads with the quick-add guide, and the Help landing's "Add a task with a date" entry stays. The quick add writes nothing about its uses any more.
- **The demo banner is one line at every width**: "Demo: private sandbox, deleted after {idle} h of inactivity. Don't store anything personal." with a "Learn more" link to the demo section of the guide in the Help panel. The idle lifetime comes from the server's status (`demo.sandboxHours.idle`), remembered on the device as today, not from a fixed string. The banner is dismissible per device for the browser session, its full text is available from a "Details" control (a tooltip with a fine pointer, a dialog on touch), and the write-limit notice takes the line's place while it applies, dismissed or not.
- **First-run guidance leaves the list.** The three steps (first task, how you want to work with light or dark, install) become a centred dialog from 640 px up and a bottom sheet below it, opened once per account after the owner's welcome note has closed, one step at a time, every step skippable, closable in any way, and re-openable from Settings → Account → How you work ("Show the start guide again"). The Inbox behind it is the real Inbox: the task added in the first step appears in it, and "Show me around" still creates the sample project as ordinary operations.
- **Empty views say one thing and offer one action**: one sentence, one primary button, centred, with at most one secondary text link; no icon, no hint line, no second button. Keyboard hints move into the button's tooltip. The copy of every view (Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Next, Waiting, project, label, filter, saved filter, Completed, Trash, Calendar day, Inbox triage) is listed in the spec, and all of them render through the one `EmptyState` primitive in `web/src/ui`, with stories.
- **Interface budget**, rows of chrome above the first item, before → after: Inbox on a fresh account 4 (header, quick add, Help line, first-run card) → 2; every other list 3 (header, quick add, Help line) → 2; the demo banner, which sits above the shell on every screen, 3 lines on a phone → 1. Nothing is written for any of this except two per-device dismissals (the banner for the session; the guide's "opened" mark stays the existing synced `first_run` preference).
- No new dependency, route, shortcut, API, op field, setting or environment variable.

Out of scope: the sidebar (`quiet-sidebar`), row content and metadata (`calm-rows`), settings copy and the settings panels' empty lists (`settings-copy`), the dashboard's "Nothing here", the calendar's planning list, the Loop home's closed-loop state, the server side of the demo, and the welcome note itself.

Advances ROADMAP.md: the Design refresh (one visual language on the screens, building on `ui-primitives`) and the UX audit's section I (Help and onboarding), F1 and G7.

No new environment variable. No change to the op log format. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `task-list-presentation`: "Nothing between the header and the list" now says the quick add ends at its field and preview (no help row under it) and that first-run guidance never sits in a list; a new "Empty views" requirement lists every view's empty sentence, primary action and secondary link, and the one-sentence-one-action rule.
- `first-run`: "Three-step first run" becomes the start guide as a dialog or bottom sheet over the real Inbox, opened once after the welcome note, closable in any way, re-openable from Settings; "Empty states name the action first" is removed in favour of the "Empty views" requirement of `task-list-presentation`.
- `demo-mode`: "Demo sign-in and banner" defines the one-line banner, its text with the server's idle lifetime, the "Learn more" link, the session dismissal, the details control and the write-limit notice taking its place.
- `documentation`: "Contextual help" no longer lists the quick add's three-use link; the quick-add guide is reached from each list view's guide section and the Help landing.
- `open-loops`: "Choosing how you work in Settings" gains the "Show the start guide again" action beside the three choices.

## Impact

- Web app only: `web/src/app/QuickAdd.tsx` (the help line, `quickAddUses` and `QUICK_ADD_HELP_USES` leave), `web/src/app/App.tsx` (`DemoBanner`), `web/src/lib/demo.ts` (banner text with the idle lifetime, session dismissal), `web/src/app/FirstRun.tsx` (card → `FirstRunGuide` in a `Dialog`, sheet on phones), `web/src/app/TaskListView.tsx` and `web/src/app/task-list/ListChrome.tsx` (no card in the list, empty states through the primitive), `web/src/app/method/HowYouWorkSection.tsx` (the reopen action), `web/src/app/method/MethodListView.tsx`, `TriageView.tsx`, `TrashView.tsx`, `FilterView.tsx`, `SavedViewView.tsx`, `MonthView.tsx`, `calendar/WeekAgenda.tsx` (empty copy), `web/src/ui/patterns/EmptyState.tsx` and `Patterns.stories.tsx` (the contract), `web/src/ui/overlay/Dialog.tsx` and `Overlay.stories.tsx` (the `sheet` placement). Tests: `firstRun.test.tsx`, `demo.test.tsx`, `budget.test.tsx`, `patterns.test.tsx`, `dialog.test.tsx`, `help/help.test.tsx`.
- Docs: `docs/your-first-task.md` (the card becomes the start guide), `docs/getting-started.md` (the banner, a `demo#try-the-demo` screen id for "Learn more"), `docs/built-in-views.md`, `docs/work-from-the-list.md`, `docs/method/set-up.md`, `docs/interface-guide.md` (the empty-state rule and the budget table), the six locale files under `web/src/locales/`.
- Bundle: about +0.5 KB gzipped (the sheet placement and the banner's details control, minus the help line and the card); the start guide can be a lazy chunk like the help bundle, which takes the first-run code out of the main bundle. Binary, image and runtime memory unchanged.
- No API, server, sync or data-model impact. The demo server already reports `sandboxHours`.
