# Proposal

## Why

OpenTodo already ships almost every piece of a GTD-style system, but as separate features that each cite "the website's GTD guide": capture from everywhere, Inbox triage, start dates and Someday, `blocked_by` and assignment for waiting-for, project notes for outcomes, a four-step weekly review, statistics and a digest. Nothing ties them into one method the app knows about. A user has to read a guide on another site, translate its words into ours, and wire labels and saved filters together themselves. The review, the only feature that touches all the others, still checks only whether a project has *any* open task. Naming the method, teaching it in the docs, and letting the app speak its words would turn a set of features into a reason to choose OpenTodo. Users then choose how prominent the method is, from a quiet companion to the home screen.

## What Changes

- **Open Loops, a named method.** The method is OpenTodo's own, inspired by GTD. It has five moves (Catch, Clarify, Place, Do, Review), seven principles, seven Places (Inbox, Next, Waiting, Scheduled, Later, Someday, Projects), three Rhythms (Daily check, Weekly review, Monthly look) and three Horizons (Next step, Project, Area). The vocabulary is defined once, translated into the six shipped languages, and used with the same words in the app, the docs and the website. "Open Loops" is a working name. It is kept in one place so a rename before release is a one-file change.
- **"How you work" preference, synced, three values:**
  - `lists` (Lists only): today's sidebar and screens, with no method words and no new markers. This is the value of every existing account. The improved review and the Next, Waiting and Loop home views are still reachable from More.
  - `companion`: the sidebar is unchanged. Screens that serve a move name it and link to the method, and the review follows the Rhythms.
  - `first` (Open Loops first): a Loop home, a sidebar arranged by Places, and a daily check prompt.
  It lives in Settings → You, and the first-run card asks for it. Switching never changes any task or project.
- **Loop home** (`/loop`, `g` then `Shift+L`): five live tiles, one per move, each opening the screen that does it, plus the focus chosen in today's daily check. It's computed on the device and works offline.
- **References to the method in the app.** In `companion` and `first`, each screen that serves a move (Inbox, triage, Next, Waiting, Someday, Projects, Review, Loop home) shows the move's name as a link in its page subtitle. The link opens the method page for that move in the Help panel, through the existing contextual help.
- **Two new derived views, available in every mode:**
  - **Next** (`g` then `Shift+N`): the next action of every active project, meaning its first actionable task in manual order. They're grouped by context, where contexts are labels whose name starts with `@`.
  - **Waiting** (`g` then `Shift+W`): open tasks that are blocked by an open task, or assigned to someone else, grouped by who or what they wait for.
  - Neither view adds a field.
- **Stalled projects.** Derived from completions: a project with open tasks and no completion in 21 days. It's shown in the review and on the Loop home.
- **The review becomes the Rhythms.** The weekly review gains a Waiting step, a project-by-project walk, and a Someday step in three phases:
  - Get clear: Inbox, Mind sweep.
  - Get current: Look back, Waiting, Projects, Look ahead.
  - Get creative: Someday.
  The project walk replaces the "Next actions" list. It shows one card per project, with its outcome note, next action, waiting items and stalled state, and single-key decisions. Each project records when *this user* last reviewed it in the existing personal `project_prefs` entity. The **Daily check** (`/review/daily`, `g` then `Shift+R`: Inbox and overdue, pick up to three tasks as today's focus) and the **Monthly look** (`/review/monthly`: Areas, old Someday items, four-week trend) are new rhythms, each recorded on the user's `review` row.
- **Method documentation.** `docs/method/` holds the method chapter: overview, one page per move, Places, Rhythms, Horizons, "Set up in ten minutes", and "Coming from GTD" (a glossary). It builds into both the docs website and the in-app Help. The Help landing gains a "Learn Open Loops" entry.
- **Website material from the release.** The site bundle carries the method vocabulary in every language (`method.json`) and a `method` fact, so the website's method page (in the website repository) uses the released words and screenshots and only advertises what that version ships.
- **Starter setup.** Choosing Open Loops at first run, or later from Settings, offers to create four context labels (`@home`, `@computer`, `@calls`, `@errands`) as ordinary operations.

Nothing here is **BREAKING**: every new op field is additive (`user_prefs.method`, `project_prefs.reviewed_at`, `review.daily_at`, `review.monthly_at`, `review.focus_date`, `review.focus`), there is no new API route, no new environment variable and no Dexie version change.

Out of scope:
- The website's method landing page, cheat-sheet PDF and demo button. These live in `OpenTodoWebsite`. This change supplies the bundle data and docs they build on.
- A review history (every finished review kept as a record) and review-consistency statistics. That's follow-up `review-history`.
- Push notifications or email when a rhythm is due. The weekly digest already covers the weekly review; in-app markers cover the rest.
- Parallel projects (where every actionable task counts as "next") and a context field on labels. Contexts are the `@` naming convention.
- New assistant skills or MCP prompts for the daily check. The existing `weekly-review` skill keeps its id and is refreshed to follow the new steps in its instructions only.
- Changing what inbox triage does. Its decisions already map onto Places, and only its help copy names them.

ROADMAP: this advances section 3, "Organisation, views and GTD". It builds on rows 2 (`someday-and-evening`), 6 (`task-dependencies`), 12 (`stats-and-review`), 16 (`project-notes`) and 17 (`inbox-triage`) of "Next: Parity and depth", and adds a new row "Open Loops method" (`open-loops-method`).

## Capabilities

### New Capabilities
- `open-loops`: the method's vocabulary as a product definition, the "How you work" preference and its three modes, the Loop home, the in-app references to the method, the context-label convention, and the starter setup.
- `method-views`: the derived Next and Waiting views, the next-action and stalled definitions shared by the web app and the server digest.

### Modified Capabilities
- `weekly-review`: steps regrouped into three phases with Mind sweep, Waiting and Someday, a project-by-project walk replacing the Next actions list, a personal per-project review stamp, and the Daily check and Monthly look rhythms with their markers.
- `app-shell`: the sidebar structure in Open Loops first mode.
- `appearance-preferences`: Loop home, Next and Waiting can be promoted, and promotions are set aside while Open Loops first arranges the sidebar.
- `first-run`: the card asks how the user wants to work.
- `documentation`: the user guide gains the method chapter, and the Help landing gains its entry.
- `site-bundle`: the manifest gains the method fact and the bundle the method vocabulary.

## Impact

- **Web:** `web/src/lib/review.ts` (steps, walk, rhythms), new `web/src/lib/method.ts` (vocabulary, mode, next action, waiting, stalled), `web/src/app/review/*`, new `web/src/app/loop/*`, Next and Waiting views, sidebar (`Shell.tsx`), first-run card, Settings → You, `PageHeader` subtitle link, shortcuts registry, i18n catalogues (six languages).
- **Server:** `internal/sync/ops.go` Schema gains five additive fields. `internal/digest/stats.go` `WithoutNextAction` moves to the shared next-action definition, pinned by a shared fixture with the web app. No new route or job.
- **Docs and bundle:** `docs/method/*.md`, `docs/review-and-statistics.md`, `docs/views.md`, `docs/keyboard.md`, `scripts/site-bundle.mjs` (method vocabulary and fact).
- **Size:** no dependency. Expected web bundle growth under 15 KB gzipped, mostly copy, with the Loop home and the walk lazy-loaded with the review bundle. No binary change beyond embedded docs.
