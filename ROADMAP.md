# Roadmap

OpenTodo set out to replace commercial task managers for people who want to own their data. That roadmap is complete, 1.0 is out, and 1.x only grows ([stability](docs/stability.md)). This file says what is being built now, what comes next, and which milestones the work so far belonged to.

Every item is an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change: a proposal, a design, spec deltas and tasks under `openspec/changes/<name>/`, moved to `openspec/changes/archive/` when it ships. This file carries no status. The [roadmap page](docs/roadmap.md) works each one out from the repository at every docs build (shipped in which release, in progress with how many tasks done, or planned), and the [changelog](CHANGELOG.md) says what each release brought.

To pick something up, read the change, comment on its issue and open a pull request. A new idea starts as an [issue](https://github.com/OpenTodoApp/OpenTodo/issues), then `/opsx:propose "<idea>"` ([the workflow](docs/contributing/openspec.md)). After editing this file, run `make docs`.

## Principles that do not change

- **The device is the source of truth.** The server syncs. Nothing should require the network to work, and each feature works offline, on end-to-end encrypted accounts and through the API, `ot` and MCP, or says clearly where it degrades.
- **One container, one volume, no mandatory configuration.**
- **Calm by default.** Every new primitive is an opt-in. Someone who wants a simple list never meets it.
- **You approve every change.** Re-planning, the assistant and rules propose; you confirm, and one Undo takes it back. No autopilot.
- **No enterprise bloat.** No story points, velocity charts or permission matrices.
- **Free forever.** No telemetry, no paid tier, AGPL forever. The only default outbound destination is the map provider (OpenStreetMap-based), which the owner can change or turn off.

## Milestones

### Now

Open changes, most of them part built.

| Change | What | Issues |
| --- | --- | --- |
| [`signed-web-app`](openspec/changes/signed-web-app/) | The installed app checks every update against a file list signed at release, so a compromised server cannot serve changed code; report-only first |  |
| [`external-security-review`](openspec/changes/external-security-review/) | A threat model and disclosure policy; an independent security review is optional, depending on funding |  |
| [`caldav-verified`](openspec/changes/caldav-verified/) | CalDAV verified on real clients | [#9](https://github.com/OpenTodoApp/OpenTodo/issues/9) |
| [`play-production`](openspec/changes/play-production/) | Google Play production, F-Droid and reproducible builds: reproducible builds, the F-Droid metadata and the Play upload are in; the store listings wait for the owner's Play Console and F-Droid steps | [#603](https://github.com/OpenTodoApp/OpenTodo/issues/603) |
| [`ios-shell`](openspec/changes/ios-shell/) | The iPhone and iPad app: first-run server screen, reminders on the phone without a push service, the share sheet, a Today widget, Face ID unlock |  |
| [`ios-distribution`](openspec/changes/ios-distribution/) | The iPhone app in TestFlight and the App Store | [#105](https://github.com/OpenTodoApp/OpenTodo/issues/105) |
| [`apple-shortcuts`](openspec/changes/apple-shortcuts/) | Siri, Shortcuts, the Action Button and iOS widgets |  |
| [`focus-live-activity`](openspec/changes/focus-live-activity/) | Focus as a Live Activity and in the Dynamic Island |  |
| [`location-reminders`](openspec/changes/location-reminders/) | Reminders when you arrive at or leave a place. Shipped on Android; iOS follows |  |
| [`mobile-native-feel`](openspec/changes/mobile-native-feel/) | The phone apps made to feel native: the plan and the order, one change per step |  |
| [`tablet-shells`](openspec/changes/tablet-shells/) | iPad and Android tablets: hardware keyboard shortcuts, a trackpad pointer, split view and resizable windows |  |
| [`app-sso-system-browser`](openspec/changes/app-sso-system-browser/) | Single sign-on in the apps through the system browser, for providers that refuse an embedded web view | [#1553](https://github.com/OpenTodoApp/OpenTodo/issues/1553) |
| [`android-home-network-notice`](openspec/changes/android-home-network-notice/) | The Android app says when the server address only works at home |  |
| [`android-reveal-on-paint`](openspec/changes/android-reveal-on-paint/) | The Android app shows the web app at its first drawn frame, as the iPhone app does | [#1755](https://github.com/OpenTodoApp/OpenTodo/issues/1755) |
| [`android-unicode-address`](openspec/changes/android-unicode-address/) | A server address typed in Unicode works in the Android app; both apps share one set of address cases |  |
| [`android-urgent-alarms`](openspec/changes/android-urgent-alarms/) | Urgent reminders ring as full-screen alarms in the Android app; built, the device run is open | [#2023](https://github.com/OpenTodoApp/OpenTodo/issues/2023) |
| [`android-quick-add-notification`](openspec/changes/android-quick-add-notification/) | A quick-add notification in the Android app: add a task from the notification shade in any app | [#2046](https://github.com/OpenTodoApp/OpenTodo/issues/2046) |
| [`ios-microphone-origin`](openspec/changes/ios-microphone-origin/) | The iPhone app grants the microphone to the configured server only, without a second prompt |  |
| [`ios-quick-look`](openspec/changes/ios-quick-look/) | An attached image or PDF opens in Quick Look in the iPhone app, without saving it first |  |
| [`ios-web-location`](openspec/changes/ios-web-location/) | "Use my location" in a task's location editor works in the iPhone app |  |
| [`click-selects-title`](openspec/changes/click-selects-title/) | One click rule in every list: a first click selects the row (and shows it beside the list), a second click edits its title, `a` adds a subtask after a click; "Click a task to" goes | [#1405](https://github.com/OpenTodoApp/OpenTodo/issues/1405) |
| [`day-manual-order`](openspec/changes/archive/2026-11-24-day-manual-order/) | **Shipped.** Arrange a day by hand in Today (any grouping) and Upcoming, one order for both; a day's tasks by part of the day under Due date | [#1480](https://github.com/OpenTodoApp/OpenTodo/issues/1480) |
| [`new-project-top-level`](openspec/changes/new-project-top-level/) | New project in the sidebar starts at the top level, whatever project is on screen | [#1759](https://github.com/OpenTodoApp/OpenTodo/issues/1759) |
| [`drag-edge-scroll`](openspec/changes/drag-edge-scroll/) | Dragging a task or a project on a phone scrolls the list at its edge | [#1760](https://github.com/OpenTodoApp/OpenTodo/issues/1760) |
| [`formatting-row-pressed`](openspec/changes/formatting-row-pressed/) | The formatting row shows which formatting is on | [#1477](https://github.com/OpenTodoApp/OpenTodo/issues/1477) |
| [`task-completion-sound`](openspec/changes/task-completion-sound/) | An optional short sound when a task is completed | [#1460](https://github.com/OpenTodoApp/OpenTodo/issues/1460) |
| [`transitions-push-only`](openspec/changes/transitions-push-only/) | The slide only when opening a task or Settings and going back; switching lists changes the page at once |  |
| [`first-copy-skeleton`](openspec/changes/first-copy-skeleton/) | A new device keeps the skeleton until its first copy arrives, instead of an empty list |  |
| [`precache-device-language`](openspec/changes/precache-device-language/) | A first install downloads the device's language only, not all of them | [#1746](https://github.com/OpenTodoApp/OpenTodo/issues/1746) |
| [`perf-relative-budgets`](openspec/changes/perf-relative-budgets/) | Server time budgets relative to the speed of the machine that runs the benchmark | [#1656](https://github.com/OpenTodoApp/OpenTodo/issues/1656) |

### Next

Specified or named, not started.

| Change | What | Issues |
| --- | --- | --- |
| `routines-shared-notify` | A "members" recipient for Notify me in shared routines, mutable per routine | [#741](https://github.com/OpenTodoApp/OpenTodo/issues/741) |
| [`telegram-channel`](openspec/changes/telegram-channel/) | Telegram as a notification channel (postponed by the owner on 2026-11-10) |  |
| `desktop-shell` | Desktop app for macOS and Windows: the embedded server plus a window, a tray icon and native notifications | |
| [`ios-push-relay`](openspec/changes/ios-push-relay/) | Reminders on time in the iPhone app through a push relay run by the project: content-free wake-ups, off until the owner and the user turn it on | [#1377](https://github.com/OpenTodoApp/OpenTodo/issues/1377) |

### [0.17 "Calm constraints"](https://github.com/OpenTodoApp/OpenTodo/milestone/1)

Method primitives and the community's quick wins.

| Change | What | Issues |
| --- | --- | --- |
| [`project-flow-modes`](openspec/changes/archive/2026-10-30-project-flow-modes/) | Projects and sections that are Parallel, Sequential (only the next task is available) or an Area | [#574](https://github.com/OpenTodoApp/OpenTodo/issues/574) |
| [`project-review-cadence`](openspec/changes/archive/2026-10-30-project-review-cadence/) | A review interval per project, so the weekly review shows only the projects that are due | [#575](https://github.com/OpenTodoApp/OpenTodo/issues/575) |
| [`today-closed-list`](openspec/changes/archive/2026-10-30-today-closed-list/) | An optional Today limit with a "Waiting for a slot" drawer, a Done today list and Log a win |  |
| [`day-parts`](openspec/changes/archive/2026-10-30-day-parts/) | Morning, Afternoon and Evening groups in Today |  |
| [`paste-to-tasks`](openspec/changes/archive/2026-10-30-paste-to-tasks/) | Paste several lines, get one task per line | [#578](https://github.com/OpenTodoApp/OpenTodo/issues/578) |
| [`add-position`](openspec/changes/archive/2026-10-30-add-position/) | Add new tasks at the top or the bottom; the Add row stays reachable | [#540](https://github.com/OpenTodoApp/OpenTodo/issues/540), [#541](https://github.com/OpenTodoApp/OpenTodo/issues/541) |
| [`focus-everywhere`](openspec/changes/archive/2026-10-30-focus-everywhere/) | Focus in the sidebar, on tasks and in the task menu, with presets, +5/+15 min and optional noise | [#543](https://github.com/OpenTodoApp/OpenTodo/issues/543), [#553](https://github.com/OpenTodoApp/OpenTodo/issues/553), [#535](https://github.com/OpenTodoApp/OpenTodo/issues/535) |
| [`sidebar-polish`](openspec/changes/archive/2026-10-30-sidebar-polish/) | Counts, reorderable destinations, icons for saved views, a kept draft | [#545](https://github.com/OpenTodoApp/OpenTodo/issues/545), [#562](https://github.com/OpenTodoApp/OpenTodo/issues/562), [#560](https://github.com/OpenTodoApp/OpenTodo/issues/560), [#559](https://github.com/OpenTodoApp/OpenTodo/issues/559) |
| [`default-reminders`](openspec/changes/archive/2026-10-30-default-reminders/) | A default reminder for dated or timed tasks | [#546](https://github.com/OpenTodoApp/OpenTodo/issues/546) |
| [`assistant-providers-fix`](openspec/changes/archive/2026-10-30-assistant-providers-fix/) | Gemini and other OpenAI-compatible providers | [#501](https://github.com/OpenTodoApp/OpenTodo/issues/501) |

### [0.18 "The mindful daily planner"](https://github.com/OpenTodoApp/OpenTodo/milestone/2)

What paid planners charge for, free.

| Change | What | Issues |
| --- | --- | --- |
| [`meeting-aware-capacity`](openspec/changes/archive/2026-10-30-meeting-aware-capacity/) | Busy calendar events count toward the day's capacity |  |
| [`replan-the-day`](openspec/changes/archive/2026-10-30-replan-the-day/) | Re-plan the rest of the day: a preview, one confirm, one Undo |  |
| [`calendar-frames`](openspec/changes/archive/2026-10-30-calendar-frames/) | Recurring background frames on the calendar (Deep work 9–11) | [#555](https://github.com/OpenTodoApp/OpenTodo/issues/555) |
| [`calendar-slots`](openspec/changes/archive/2026-10-30-calendar-slots/) | Several small tasks in one calendar block |  |
| [`bento-daily-check`](openspec/changes/archive/2026-10-30-bento-daily-check/) | A Large, a Medium and a Small task in the Daily check | [#597](https://github.com/OpenTodoApp/OpenTodo/issues/597) |
| [`task-energy`](openspec/changes/archive/2026-10-30-task-energy/) | An energy property (deep, medium, low) with a filter and quick-add token |  |
| [`urgency-sort`](openspec/changes/archive/2026-11-10-urgency-sort/) | A deterministic urgency score sort, and sort by a custom field | [#404](https://github.com/OpenTodoApp/OpenTodo/issues/404) |
| [`calendar-clarity`](openspec/changes/archive/2026-10-30-calendar-clarity/) | Deadlines on the calendar, add with the mouse, colour by label, filters, a project Calendar layout | [#554](https://github.com/OpenTodoApp/OpenTodo/issues/554), [#555](https://github.com/OpenTodoApp/OpenTodo/issues/555), [#556](https://github.com/OpenTodoApp/OpenTodo/issues/556) |

### [0.19 "Series and time"](https://github.com/OpenTodoApp/OpenTodo/milestone/3)

Recurring depth, calendar range, and notes that stay cheap to store and easy to find.

| Change | What | Issues |
| --- | --- | --- |
| [`series-occurrences`](openspec/changes/archive/2026-10-31-series-occurrences/) | Future occurrences of repeating tasks and habits in Day, Week and Month | [#550](https://github.com/OpenTodoApp/OpenTodo/issues/550), [#537](https://github.com/OpenTodoApp/OpenTodo/issues/537) |
| [`series-exceptions`](openspec/changes/archive/2026-10-31-series-exceptions/) | Move, skip or edit one occurrence alone | [#551](https://github.com/OpenTodoApp/OpenTodo/issues/551) |
| [`series-split`](openspec/changes/archive/2026-10-31-series-split/) | "This and following": edit from one occurrence onward | [#552](https://github.com/OpenTodoApp/OpenTodo/issues/552) |
| [`series-all-scope`](openspec/changes/archive/2026-10-31-series-all-scope/) | "All occurrences": only future ones or also past ones | — |
| [`multi-day-tasks`](openspec/changes/archive/2026-10-31-multi-day-tasks/) | Tasks that span days on the calendar | [#558](https://github.com/OpenTodoApp/OpenTodo/issues/558) |
| [`year-view`](openspec/changes/archive/2026-10-31-year-view/) | Several months and a Year view | [#557](https://github.com/OpenTodoApp/OpenTodo/issues/557) |
| [`board-polish`](openspec/changes/archive/2026-10-31-board-polish/) | Fold a board column, preview notes on cards | [#561](https://github.com/OpenTodoApp/OpenTodo/issues/561) |
| [`accent-colour`](openspec/changes/archive/2026-10-31-accent-colour/) | Your own accent colour, with contrast guaranteed | [#563](https://github.com/OpenTodoApp/OpenTodo/issues/563) |
| [`notes-compaction`](openspec/changes/archive/2026-10-31-notes-compaction/) | The server drops superseded note versions after 30 days and reclaims the space | [#652](https://github.com/OpenTodoApp/OpenTodo/issues/652) |
| [`notes-save-cadence`](openspec/changes/archive/2026-10-31-notes-save-cadence/) | Notes save on the device at every pause and sync after 3 s quiet | [#653](https://github.com/OpenTodoApp/OpenTodo/issues/653) |
| [`notes-toolbar-desktop`](openspec/changes/archive/2026-10-31-notes-toolbar-desktop/) | A Formatting toggle beside notes on a computer | [#654](https://github.com/OpenTodoApp/OpenTodo/issues/654) |
| [`notes-overview`](openspec/changes/archive/2026-10-31-notes-overview/) | A Notes page with standalone notes and search on the device | [#655](https://github.com/OpenTodoApp/OpenTodo/issues/655) |

The notes overview depends on `notes-compaction` and `notes-save-cadence`, which keep many long, often-edited notes cheap to store and sync; its budgets are part of `performance-10k`.

### [0.20 "Everywhere"](https://github.com/OpenTodoApp/OpenTodo/milestone/4)

Phones, Apple, Obsidian and voice.

| Change | What | Issues |
| --- | --- | --- |
| [`focus-session-readable`](openspec/changes/archive/2026-10-31-focus-session-readable/) | The running Focus session readable by the shells and agents | [#604](https://github.com/OpenTodoApp/OpenTodo/issues/604) |
| [`obsidian-origin`](openspec/changes/archive/2026-10-31-obsidian-origin/) | An `obsidian` origin that links a task back to its note | [#605](https://github.com/OpenTodoApp/OpenTodo/issues/605) |
| [`view-project-drops`](openspec/changes/archive/2026-11-14-view-project-drops/) | In views grouped by project, drop a task into another project's group to move it, or onto a task to nest it | [#1211](https://github.com/OpenTodoApp/OpenTodo/issues/1211) |
| [`today-project-drops`](openspec/changes/archive/2026-11-14-today-project-drops/) | Move, place and nest tasks in Today's project groups | [#1211](https://github.com/OpenTodoApp/OpenTodo/issues/1211) |
| [`today-context-subtasks`](openspec/changes/archive/2026-11-16-today-context-subtasks/) | Show undated and later subtasks as context in Today, with explicit moves in project groups | [#1404](https://github.com/OpenTodoApp/OpenTodo/issues/1404) |
| [`board-completed-column`](openspec/changes/archive/2026-11-14-board-completed-column/) | Show completed tasks on a project board: a Completed column at the end; drop a card there to complete it | [#1291](https://github.com/OpenTodoApp/OpenTodo/issues/1291) |
| [`completed-view-review`](openspec/changes/archive/2026-11-14-completed-view-review/) | Completed for reviews: narrow to projects, group by project, search, and done rows without a strikethrough | [#1325](https://github.com/OpenTodoApp/OpenTodo/issues/1325) |
| [`quick-add-links`](openspec/changes/archive/2026-11-22-quick-add-links/) | A link typed or pasted into quick add becomes a link attachment, with a chip like a date's | [#1743](https://github.com/OpenTodoApp/OpenTodo/issues/1743) |
| [`away-periods`](openspec/changes/archive/2026-11-20-away-periods/) | Away: mark a period, also after the fact, that skips the repeating occurrences in it in one Undo, keeps streaks and pauses reminders | [#805](https://github.com/OpenTodoApp/OpenTodo/issues/805) |
| [`workspace-activity`](openspec/changes/archive/2026-11-20-workspace-activity/) | A workspace Activity page for retrospectives: every project, a date range, several kinds at once, tracked time, filters remembered on the device | [#1443](https://github.com/OpenTodoApp/OpenTodo/issues/1443) |
| [`workspace-feature-switches`](openspec/changes/archive/2026-11-24-workspace-feature-switches/) | Feature switches per workspace: the owner and admins turn Notes, Calendar, Habits, Time tracking, Focus, Routines, Reviews and Locations on or off for everyone in it; off hides, never deletes | [#1637](https://github.com/OpenTodoApp/OpenTodo/issues/1637) |
| [`caldav-push`](openspec/changes/archive/2026-11-21-caldav-push/) | Push to calendar apps: a change on any device wakes a subscribed CalDAV client (WebDAV-Push), off until the owner turns it on | [#1585](https://github.com/OpenTodoApp/OpenTodo/issues/1585) |
| [`drag-ticked-together`](openspec/changes/archive/2026-11-20-drag-ticked-together/) | Drag several ticked tasks within a list to reorder or nest them in one move, with one Undo | [#1498](https://github.com/OpenTodoApp/OpenTodo/issues/1498) |
| [`quarter-view-and-plan-spans`](openspec/changes/archive/2026-11-20-quarter-view-and-plan-spans/) | A Quarter view in the Calendar (three months at a glance, `g q`), and 3-day and custom Plan spans | [#1026](https://github.com/OpenTodoApp/OpenTodo/issues/1026) |
| [`spans-stay-in-sections`](openspec/changes/archive/2026-11-20-spans-stay-in-sections/) | A multi-day task stays in its section with its dates instead of folding into Later before its first day | [#1572](https://github.com/OpenTodoApp/OpenTodo/issues/1572) |
| [`notes-page-own-notes`](openspec/changes/archive/2026-11-20-notes-page-own-notes/) | The Notes page lists your notes and project notes; task descriptions are one `kind:task` chip away | [#1478](https://github.com/OpenTodoApp/OpenTodo/issues/1478) |
| [`calsync-repeat-marker`](openspec/changes/archive/2026-11-20-calsync-repeat-marker/) | Repeating tasks show 🔁 before their title in a synced calendar; the marker never comes back as a rename | [#1231](https://github.com/OpenTodoApp/OpenTodo/issues/1231) |
| [`calendar-event-edits`](openspec/changes/archive/2026-11-24-calendar-event-edits/) | Move, resize, rename and delete the events of a connected calendar in Day and Week, off until turned on per connection; assistants may move and rename them with a second switch, with Undo | [#1233](https://github.com/OpenTodoApp/OpenTodo/issues/1233) |
| [`cli-subtasks`](openspec/changes/archive/2026-11-19-cli-subtasks/) | Subtasks in `ot`: `--parent` on `add`, `edit` and `list`, `--subtasks` cascades on `done`, `rm` and `edit`, and the tree in `list` and `task show` | [#1575](https://github.com/OpenTodoApp/OpenTodo/issues/1575) |
| [`repeat-field-language`](openspec/changes/archive/2026-11-18-repeat-field-language/) | A task's Repeat field reads repeat phrases in the languages quick add reads, and stores the English rule | [#1427](https://github.com/OpenTodoApp/OpenTodo/issues/1427) |
| [`repeat-rule-words`](openspec/changes/archive/2026-11-18-repeat-rule-words/) | A repeat rule is shown in the interface language wherever the app shows one; the Repeat field still takes English | [#1427](https://github.com/OpenTodoApp/OpenTodo/issues/1427) |
| [`theme-title-weight`](openspec/changes/archive/2026-11-18-theme-title-weight/) | A theme can set how heavy task titles are (`titleWeight`), with the control in the theme editor | [#1469](https://github.com/OpenTodoApp/OpenTodo/issues/1469) |
| [`subtask-panel-order`](openspec/changes/archive/2026-11-19-subtask-panel-order/) | Reorder a task's subtasks from the task panel and the task page: drag the handle, Alt+arrows on it, or Move up and Move down | [#1577](https://github.com/OpenTodoApp/OpenTodo/issues/1577) |
| [`app-links`](openspec/changes/archive/2026-11-20-app-links/) | Opt-in links to other apps (`zotero:`, `mid:`, `onenote:`…) in notes and origins, checked on the viewer's device | [#1287](https://github.com/OpenTodoApp/OpenTodo/issues/1287) |
| [`obsidian-plugin`](openspec/changes/archive/2026-11-21-obsidian-plugin/) | An Obsidian community plugin, mobile included (built and released; waiting for the directory listing) | [#606](https://github.com/OpenTodoApp/OpenTodo/issues/606) |
| [`obsidian-vault-sync`](openspec/changes/archive/2026-11-21-obsidian-vault-sync/) | Vault sync from inside Obsidian (built; waiting for the manual runs on devices) | [#607](https://github.com/OpenTodoApp/OpenTodo/issues/607) |
| [`voice-ramble`](openspec/changes/archive/2026-10-31-voice-ramble/) | Speak a brain dump or drop a photo of notes; review the proposed tasks | [#608](https://github.com/OpenTodoApp/OpenTodo/issues/608) |
| [`outlook-calendar-sync`](openspec/changes/archive/2026-10-31-outlook-calendar-sync/) | Microsoft 365 and Outlook in calendar sync | [#609](https://github.com/OpenTodoApp/OpenTodo/issues/609) |
| [`agent-tools-complete`](openspec/changes/archive/2026-10-31-agent-tools-complete/) | Agent and MCP tools for reminders, project notes, sections, fields, time and Focus | [#565](https://github.com/OpenTodoApp/OpenTodo/issues/565) |

**Themes (prioritised).** Real themes, the way code editors have them, from [#638](https://github.com/OpenTodoApp/OpenTodo/issues/638). They start alongside `routines-engine` and run in parallel, in this order:

| Change | What | Issues |
| --- | --- | --- |
| [`theme-engine`](openspec/changes/archive/2026-11-01-theme-engine/) | A documented theme format, tokens derived from a few seeds, applied before the first paint, chosen per light and dark side and synced, with a contrast gate; OpenTodo Light and Dark become themes | [#708](https://github.com/OpenTodoApp/OpenTodo/issues/708) |
| [`theme-catalogue`](openspec/changes/archive/2026-11-01-theme-catalogue/) | Built-in editor palettes (Solarized, Gruvbox, Catppuccin, Rosé Pine, Tokyo Night, One, Nord, Dracula), credited and AA-checked | [#709](https://github.com/OpenTodoApp/OpenTodo/issues/709) |
| [`theme-editor`](openspec/changes/archive/2026-11-01-theme-editor/) | Your own themes: seeds, every token, live preview and contrast fixes, files, VS Code theme import | [#710](https://github.com/OpenTodoApp/OpenTodo/issues/710) |
| [`theme-instance-default`](openspec/changes/archive/2026-11-01-theme-instance-default/) | The owner's default theme and server themes for every member | [#711](https://github.com/OpenTodoApp/OpenTodo/issues/711) |

### [0.21 "Horizons and home"](https://github.com/OpenTodoApp/OpenTodo/milestone/5)

Longer horizons, and the household.

| Change | What | Issues |
| --- | --- | --- |
| [`time-sectors`](openspec/changes/archive/2026-11-02-time-sectors/) | This week, Next week, This month, Next quarter, without a fake due date | [#579](https://github.com/OpenTodoApp/OpenTodo/issues/579) |
| [`plan-objectives`](openspec/changes/archive/2026-11-02-plan-objectives/) | Quarterly and weekly objectives as small cards in Plan and the weekly review | [#580](https://github.com/OpenTodoApp/OpenTodo/issues/580) |
| [`reusable-lists`](openspec/changes/archive/2026-11-02-reusable-lists/) | Grocery mode: adding an existing item reopens it | [#581](https://github.com/OpenTodoApp/OpenTodo/issues/581) |
| [`chore-rotation`](openspec/changes/archive/2026-11-02-chore-rotation/) | Recurring tasks that rotate between members of a group | [#582](https://github.com/OpenTodoApp/OpenTodo/issues/582) |
| [`more-languages`](openspec/changes/archive/2026-11-12-more-languages/) | Dutch, quick add in Dutch, and a kit for community languages | [#584](https://github.com/OpenTodoApp/OpenTodo/issues/584) |
| [`simplified-chinese`](openspec/changes/archive/2026-11-11-simplified-chinese/) | Simplified Chinese (简体中文) | [#883](https://github.com/OpenTodoApp/OpenTodo/issues/883) |
| [`japanese`](openspec/changes/japanese/) | Japanese (日本語) as a community language, reviewed by a native speaker | [#884](https://github.com/OpenTodoApp/OpenTodo/issues/884) |
| [`arabic-rtl`](openspec/changes/arabic-rtl/) | Arabic (العربية) as a community language, and the app laid out right to left | [#885](https://github.com/OpenTodoApp/OpenTodo/issues/885) |
| [`priority-names`](openspec/changes/archive/2026-11-10-priority-names/) | Rename the four priorities |  |

### [1.0 "Trust"](https://github.com/OpenTodoApp/OpenTodo/milestone/6)

The release that makes OpenTodo the default choice.

| Change | What | Issues |
| --- | --- | --- |
| [`stability-contract`](openspec/changes/archive/2026-11-03-stability-contract/) | A frozen v1 API and op schema, upgrade paths from any 0.x, an export guarantee | [#587](https://github.com/OpenTodoApp/OpenTodo/issues/587) |
| [`accessibility-aa`](openspec/changes/archive/2026-11-03-accessibility-aa/) | WCAG 2.2 AA on every screen, with a conformance statement |  |
| [`performance-10k`](openspec/changes/archive/2026-11-09-performance-10k/) | Budgets and tests for 10,000 tasks, on phones too |  |
| [`notes-compaction-at-scale`](openspec/changes/archive/2026-11-03-notes-compaction-at-scale/) | A year of note history compacted in a minute without holding writes back; a new device downloads only the latest notes | [#590](https://github.com/OpenTodoApp/OpenTodo/issues/590) |
| [`migration-everywhere`](openspec/changes/archive/2026-11-03-migration-everywhere/) | A switch guide and checked importer for every competitor | [#591](https://github.com/OpenTodoApp/OpenTodo/issues/591) |
| [`docs-1-0`](openspec/changes/archive/2026-11-06-docs-1-0/) | Complete user, self-host and API docs and a contributor guide |  |

### [1.1 "Routines"](https://github.com/OpenTodoApp/OpenTodo/milestone/7)

Multi-step routines with AI steps, built on Automations: every existing rule becomes a one-card routine, nothing to migrate.

| Change | What | Issues |
| --- | --- | --- |
| [`routines-engine`](openspec/changes/archive/2026-11-01-routines-engine/) | Rules grow into routines: typed steps, manual runs, Test, step-by-step run log, Undo a run, full CLI and MCP | [#658](https://github.com/OpenTodoApp/OpenTodo/issues/658) |
| [`routines-editor`](openspec/changes/archive/2026-11-01-routines-editor/) | Sentence-card editor with live previews, run history, and "Routines since your last visit" in the Inbox | [#659](https://github.com/OpenTodoApp/OpenTodo/issues/659) |
| [`routines-dynamic-data`](openspec/changes/archive/2026-11-01-routines-dynamic-data/) | Data flows instead of hand-picked tasks: task steps act on each task of a list, Pick (first, last, all, where), the editor wires the trigger, earlier outputs and the loop item; Get the date, a task's project, subtasks, completed tasks, "not changed for", days of the month; pickers next to the word, text edited in the card | [#722](https://github.com/OpenTodoApp/OpenTodo/issues/722) |
| [`routines-find-scope`](openspec/changes/archive/2026-11-01-routines-find-scope/) | Find tasks and scheduled triggers find what the app's lists show: never the Trash or a project in it, archived projects only when asked ("Archived projects" on the card) | [#734](https://github.com/OpenTodoApp/OpenTodo/issues/734) |
| [`routines-starters`](openspec/changes/archive/2026-11-01-routines-starters/) | Eleven starter routines in the template library, tested against seeded data, offered on the Routines page with inline choices | [#660](https://github.com/OpenTodoApp/OpenTodo/issues/660) |
| [`routines-describe-it`](openspec/changes/archive/2026-11-01-routines-describe-it/) | "Describe it": the AI drafts a routine from one sentence into the editor, never saving or running it | [#735](https://github.com/OpenTodoApp/OpenTodo/issues/735) |
| [`routines-ai-step`](openspec/changes/archive/2026-11-01-routines-ai-step/) | Ask AI and Summarise steps, proposals by default, a bounded "apply without asking", device runs for encrypted accounts | [#661](https://github.com/OpenTodoApp/OpenTodo/issues/661) |
| [`routines-shared`](openspec/changes/archive/2026-11-01-routines-shared/) | Routines that belong to a shared project and run as whoever turned them on | [#662](https://github.com/OpenTodoApp/OpenTodo/issues/662) |
| [`routines-shared-email`](openspec/changes/archive/2026-11-09-routines-shared-email/) | Email project members in shared routines, with a stop link per member | [#741](https://github.com/OpenTodoApp/OpenTodo/issues/741) |
| [`routine-conditions`](openspec/changes/archive/2026-11-10-routine-conditions/) | A routine works in one workspace or every workspace and never moves a task into another workspace; conditions get Is not and No project; another workspace's project is named with its workspace | [#1132](https://github.com/OpenTodoApp/OpenTodo/issues/1132), [#1134](https://github.com/OpenTodoApp/OpenTodo/issues/1134) |

The five changes land in this order. Routines never fetch URLs or feeds: outbound requests stay with configured webhooks, delivery channels and the owner's SMTP server.

### Notes area

Notes that link to each other, a calm home for them, and a picture of what is connected.

| Change | What | Issues |
| --- | --- | --- |
| [`note-links`](openspec/changes/archive/2026-11-09-note-links/) | Link notes, tasks and projects with `[[`; Linked references on each | |
| [`notes-home`](openspec/changes/archive/2026-11-09-notes-home/) | The Notes page as a home: write from the search field, pinned notes, unlinked notes | |
| [`notes-graph`](openspec/changes/archive/2026-11-09-notes-graph/) | Connections: a local graph of what links to and from an item | |
| [`notes-graph-page`](openspec/changes/archive/2026-11-13-notes-graph-page/) | The graph of all notes: Graph mode of the Notes page, pan, zoom, topics by project and label | |
| [`note-pane-width`](openspec/changes/archive/2026-11-09-note-pane-width/) | A note beside the Notes list resizes by its left edge and keeps a readable column | |
| [`notes-space`](openspec/changes/archive/2026-11-13-notes-space/) | A Tasks and Notes switch in the sidebar, one-line note rows, and search tokens (`in:`, `@label`, `kind:`, `linked:`, `changed:`) as chips | |
| [`notes-in-routines`](openspec/changes/archive/2026-11-13-notes-in-routines/) | Routines work with standalone notes: note triggers, Find, Create and Change notes, Turn into task, a Note type | |
| [`note-attachments`](openspec/changes/archive/2026-11-13-note-attachments/) | Images and files in standalone notes | |
| [`note-checklist-tasks`](openspec/changes/archive/2026-11-13-note-checklist-tasks/) | Turn checklist lines of a note into tasks, each line becoming a link to its task | |
| [`unlinked-mentions`](openspec/changes/archive/2026-11-13-unlinked-mentions/) | Unlinked mentions below Linked references, linked in one step | |
| [`note-search-operators`](openspec/changes/archive/2026-11-13-note-search-operators/) | `OR`, `title:`, `text:` and a `changed:` range in note search, the same in the CLI and MCP | |
| [`notes-sort`](openspec/changes/archive/2026-11-13-notes-sort/) | Sort the Notes list by last change, creation or title | |
| [`notes-bulk-actions`](openspec/changes/archive/2026-11-13-notes-bulk-actions/) | Select several notes to move, label, pin, trash or turn into tasks at once | |
| [`note-markdown-source`](openspec/changes/archive/2026-11-13-note-markdown-source/) | Edit a note's Markdown source as plain text | |
| [`note-outline`](openspec/changes/archive/2026-11-13-note-outline/) | An outline of a long note's headings | |
| [`note-templates`](openspec/changes/archive/2026-11-13-note-templates/) | Start a note from a template, with built-in ones and a routine step | |
| [`daily-notes`](openspec/changes/archive/2026-11-14-daily-notes/) | One note per day, opened from Today, that routines can add to | |
| [`note-public-links`](openspec/changes/archive/2026-11-14-note-public-links/) | A read-only public link for one note | |
| [`note-webhooks`](openspec/changes/archive/2026-11-13-note-webhooks/) | Opt-in note events for webhooks | |
| [`vault-notes`](openspec/changes/archive/2026-11-14-vault-notes/) | Standalone notes as Markdown files in `ot vault` | |

The changes land in this order; each ships on its own. Links are computed on the device, so they work offline and with end-to-end encryption, and the server keeps no link table.

### Assistant area

The assistant's answers show the app's own interface (`assistant-generative-ui`, `assistant-map-lookup`). These changes build on that, in four waves.

| Change | What | Issues |
| --- | --- | --- |
| [`assistant-eval`](openspec/changes/archive/2026-11-21-assistant-eval/) | Recorded scenarios against a real provider, which check the tool calls a model makes (blocks used, nothing written, no map claims), run by hand with `make assistant-eval` | |
| [`assistant-usage-cache`](openspec/changes/archive/2026-11-10-assistant-usage-cache/) | Input read from the provider's cache counts at a tenth toward the monthly cap, and each answer names it | |
| [`assistant-device-reads`](openspec/changes/archive/2026-11-10-assistant-device-reads/) | The on-device assistant (encrypted accounts) reads time entries, frames, slots and notes like the server's | |
| [`assistant-time-blocks`](openspec/changes/archive/2026-11-21-assistant-time-blocks/) | Time, free time and deadlines blocks; `find_free_time` as a read tool for the assistant and MCP | |
| [`assistant-project-blocks`](openspec/changes/archive/2026-11-21-assistant-project-blocks/) | Board, timeline, activity, stats, task and habit blocks, offered by relevance | |
| [`assistant-followups`](openspec/changes/archive/2026-11-21-assistant-followups/) | Up to three follow-up suggestions under an answer, sent with one tap | |
| [`assistant-proposal-editing`](openspec/changes/archive/2026-11-10-assistant-proposal-editing/) | Edit proposals in every shape, drag them in the calendar, proposals that grow over turns, before and after | |
| [`assistant-memory`](openspec/changes/archive/2026-11-10-assistant-memory/) | The assistant remembers facts you confirm: synced and encrypted like settings, managed in Settings, never sent to MCP or routines | |
| [`assistant-in-context`](openspec/changes/archive/2026-11-21-assistant-in-context/) | Rewrite this, Find a slot, What's next? and Brief me, started from a task, a project or Today | |
| [`assistant-routine-blocks`](openspec/changes/archive/2026-11-10-assistant-routine-blocks/) | Routines' AI steps show the day's agenda, deadlines and tasks as blocks in the routine inbox | |
| [`assistant-lean-tools`](openspec/changes/archive/2026-11-13-assistant-lean-tools/) | Write tools only once the model asks for them, so questions send far fewer tokens | |
| [`assistant-eval-gaps`](openspec/changes/archive/2026-11-21-assistant-eval-gaps/) | What the first real eval run found: sections in project reads, labels found by their plural, one task as a link, answers always in words | |
| [`mcp-blocks`](openspec/changes/archive/2026-11-10-mcp-blocks/) | Blocks for external agents that support MCP Apps, rendered by the host from self-contained HTML; a spike first | |
| [`assistant-tool-sources`](openspec/changes/archive/2026-11-14-assistant-tool-sources/) | Each read in an answer shows what it returned ("Looked at 3 tasks"), so invented rows cannot pass as data | [#1317](https://github.com/OpenTodoApp/OpenTodo/issues/1317) |

They land in waves:
1. the evaluation suite, the usage accounting and the device reads;
2. the new blocks, follow-ups and proposal editing;
3. memory and the assistant in context;
4. routines with blocks, fewer tools per turn, and MCP blocks.

Each change ships on its own. Blocks keep carrying ids only, rendered on the device, except over MCP, where the host can't read the device's data.

### UX polish (2026-11 feedback)

These changes come from the owner's November review of the screens used every day. Each one gives a screen a single job and lets the layout carry it.

| Change | What | Issues |
| --- | --- | --- |
| [`sidebar-brand-and-row-grid`](openspec/changes/archive/2026-11-10-sidebar-brand-and-row-grid/) | The workspace gets its own picture and OpenTodo a quiet brand line with the version in the sidebar's footer. Task rows get one grid of fixed slots, with marks on the title's baseline. The task panel fits its width, with quieter subtasks and a compact estimate editor. Upcoming summarises later days | |
| [`one-line-label-fit`](openspec/changes/archive/2026-11-14-one-line-label-fit/) | One line rows fit labels in their column, with an ellipsis for a long first label and a count for labels that do not fit | [#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089) |
| [`when-picker`](openspec/changes/archive/2026-11-10-when-picker/) | The Do on editor gets a date field that shows an example, one "time of day" row (Any time, Morning, Afternoon, Evening, Time) and the zone beside the time | |
| [`focus-redesign`](openspec/changes/archive/2026-11-10-focus-redesign/) | Focus becomes one stage: the task, the time left and one control. Settings, the mode and today's sessions move behind a quiet menu, and breaks are a calm state | |
| [`close-the-day-redesign`](openspec/changes/archive/2026-11-10-close-the-day-redesign/) | Close the day becomes three steps (done, what moves, tomorrow's first thing), keyboard-first, with one write and one Undo | |
| [`task-progress`](openspec/changes/archive/2026-11-10-task-progress/) | A parent's progress as a small ring before its subtask count and a percentage in the task panel; a project's progress next to its title | [#1107](https://github.com/OpenTodoApp/OpenTodo/issues/1107) |
| [`loop-guided-dashboard`](openspec/changes/archive/2026-11-10-loop-guided-dashboard/) | The Loop home names the next step and why. A stepper shows only the moves with work, and each move opens in place | |
| [`project-icons-in-ui`](openspec/changes/archive/2026-11-15-project-icons-in-ui/) | Project icons appear at existing project marks across the app and beside tinted project group names | [#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089), [#1210](https://github.com/OpenTodoApp/OpenTodo/issues/1210) |
| [`task-group-separators`](openspec/changes/archive/2026-11-21-task-group-separators/) | Wide One line and Detailed lists show a faint separator between top-level task groups | [#1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089) |
| [`p3-completion-outline`](openspec/changes/archive/2026-11-22-p3-completion-outline/) | Open P3 tasks use an empty blue completion circle | [#1752](https://github.com/OpenTodoApp/OpenTodo/issues/1752) |

Each change ships on its own, in any order. Only `sidebar-brand-and-row-grid` adds an op field: an additive `user_prefs.upcoming_later`. The others change interface only, and every value they write reads the same in 1.0 clients.

### Habits area

Habits get their own place: easy to start, forgiving on a bad day, connected to notes and the assistant, and invisible for anyone who turns them off. Planned on 2026-11-12 from the owner's feedback and a study of habit trackers and the research behind them.

| Change | What | Issues |
| --- | --- | --- |
| [`habits-home`](openspec/changes/archive/2026-11-13-habits-home/) | A Habits switch where off means off, a Habits screen and Today strip, one-step creation, a forgiving measure and strength, the tiny version, editing past days, graduating, and a calm visual language | |
| [`habit-notes`](openspec/changes/archive/2026-11-14-habit-notes/) | The habit's note, a note on each check-in, habits in `[[` links, Make habits from a note, habits in the weekly review | |
| [`habits-assistant`](openspec/changes/archive/2026-11-14-habits-assistant/) | Habit numbers on the server, `list_habits`, `get_habit` and `log_habit`, a habits route and `ot habits`, Start a habit and How are my habits?, check-ins from capture, routine steps | |
| [`habit-targets`](openspec/changes/archive/2026-11-14-habit-targets/) | Times per week or month, and daily amounts that add up exactly across devices | |

They land in this order; each ships on its own. Every number stays derived from the records that already sync, and the server computes the same numbers from the same vectors.

### Shells that feel native

The phone apps stay web-view shells and are made to feel like apps, in the order of [`mobile/AUDIT.md`](mobile/AUDIT.md).

| Change | What | Issues |
| --- | --- | --- |
| [`shell-repairs`](openspec/changes/archive/2026-11-21-shell-repairs/) | Saving files from both apps, Back on Android, haptics through the bridge, Face ID on iPhone, Done on the iPhone notification, status bar icons that follow the theme | |
| [`shell-reminders-on`](openspec/changes/archive/2026-11-21-shell-reminders-on/) | Reminders on by default in the apps with the task's name, the permission asked with the first reminder, exact alarms asked for with an explanation, background runs that end when they are done | |
| [`touch-keyboard-hints`](openspec/changes/archive/2026-11-21-touch-keyboard-hints/) | No keyboard shortcuts or key hints on a device without a keyboard | [#1337](https://github.com/OpenTodoApp/OpenTodo/issues/1337) |
| [`shell-touch`](openspec/changes/archive/2026-11-21-shell-touch/) | No tap flash, callouts or page bounce, chrome that cannot be selected, every control answers a tap | [#1338](https://github.com/OpenTodoApp/OpenTodo/issues/1338) |
| [`phone-row-titles`](openspec/changes/archive/2026-11-21-phone-row-titles/) | A task's title on up to two lines on a phone | [#1339](https://github.com/OpenTodoApp/OpenTodo/issues/1339) |
| [`phone-header-room`](openspec/changes/archive/2026-11-21-phone-header-room/) | Help in the bar's menu on a phone, so the title has room | [#1340](https://github.com/OpenTodoApp/OpenTodo/issues/1340) |
| [`sheet-drag-dismiss`](openspec/changes/archive/2026-11-21-sheet-drag-dismiss/) | Bottom sheets follow the finger and close on a drag | [#1341](https://github.com/OpenTodoApp/OpenTodo/issues/1341) |
| [`pull-to-sync`](openspec/changes/archive/2026-11-21-pull-to-sync/) | Pull down to sync, never a reload | [#1342](https://github.com/OpenTodoApp/OpenTodo/issues/1342) |
| [`shell-first-paint`](openspec/changes/archive/2026-11-21-shell-first-paint/) | The apps open on their colour and icon, and the loading frame already has the phone's bars | [#1343](https://github.com/OpenTodoApp/OpenTodo/issues/1343) |
| [`touch-pressed-states`](openspec/changes/archive/2026-11-21-touch-pressed-states/) | A pressed colour of their own for the tab bar, menus, drawer rows and row controls on touch; tabs at their full height | [#1349](https://github.com/OpenTodoApp/OpenTodo/issues/1349) |
| [`phone-bar-overflow`](openspec/changes/archive/2026-11-21-phone-bar-overflow/) | Filter in the page's menu on a phone, an active filter as a small chip, so a project's name has room | [#1350](https://github.com/OpenTodoApp/OpenTodo/issues/1350) |
| [`phone-titles-everywhere`](openspec/changes/archive/2026-11-21-phone-titles-everywhere/) | Two lines for a title on a phone in Notes, the calendar agendas, Close the day and the command bar | [#1351](https://github.com/OpenTodoApp/OpenTodo/issues/1351) |
| [`phone-row-controls`](openspec/changes/archive/2026-11-21-phone-row-controls/) | No Show details arrow on a phone's rows, no touch target on another's, a short add hint | [#1359](https://github.com/OpenTodoApp/OpenTodo/issues/1359) |
| [`touch-sheet-focus`](openspec/changes/archive/2026-11-21-touch-sheet-focus/) | A picker opened by touch keeps the on-screen keyboard down until its field is tapped | [#1360](https://github.com/OpenTodoApp/OpenTodo/issues/1360) |
| [`phone-calendar-chrome`](openspec/changes/archive/2026-11-21-phone-calendar-chrome/) | The calendar on a phone: one row under the bar, the views in a menu | [#1361](https://github.com/OpenTodoApp/OpenTodo/issues/1361) |
| [`touch-no-tooltips`](openspec/changes/archive/2026-11-21-touch-no-tooltips/) | No tooltip after a tap; hover and keyboard focus as before | [#1362](https://github.com/OpenTodoApp/OpenTodo/issues/1362) |
| [`phone-fab-clearance`](openspec/changes/archive/2026-11-21-phone-fab-clearance/) | No floating add button on a Weekly review step, whose own action it covered | [#1368](https://github.com/OpenTodoApp/OpenTodo/issues/1368) |
| [`phone-icon-picker`](openspec/changes/archive/2026-11-21-phone-icon-picker/) | Icons and colours as 44 px targets on touch; the picker inside the sheet's padding | [#1369](https://github.com/OpenTodoApp/OpenTodo/issues/1369) |
| [`phone-task-page-targets`](openspec/changes/archive/2026-11-21-phone-task-page-targets/) | A task page's completion circle takes its whole 44 px, clear of Back | [#1370](https://github.com/OpenTodoApp/OpenTodo/issues/1370) |
| [`phone-stats-period`](openspec/changes/archive/2026-11-21-phone-stats-period/) | The Statistics period as one menu button on a phone; a public list's name on two lines | [#1371](https://github.com/OpenTodoApp/OpenTodo/issues/1371) |
| [`phone-timeline-rows`](openspec/changes/archive/2026-11-21-phone-timeline-rows/) | A timeline on a phone: the name on its own line above its bar, 44 px rows, a tap opens the task | [#1372](https://github.com/OpenTodoApp/OpenTodo/issues/1372) |
| [`tablet-header-room`](openspec/changes/archive/2026-11-21-tablet-header-room/) | A page header follows its own width: one row beside a tablet's sidebar, nothing cut short | [#1379](https://github.com/OpenTodoApp/OpenTodo/issues/1379) |
| [`touch-sidebar-names`](openspec/changes/archive/2026-11-21-touch-sidebar-names/) | On touch a sidebar row's name has the room; its menu opens on a hold | [#1380](https://github.com/OpenTodoApp/OpenTodo/issues/1380) |
| [`reminder-card-compact`](openspec/changes/archive/2026-11-21-reminder-card-compact/) | The in-app reminder as one compact card on touch: Snooze and Dismiss on one row | [#1381](https://github.com/OpenTodoApp/OpenTodo/issues/1381) |
| [`phone-fab-scroll-room`](openspec/changes/archive/2026-11-21-phone-fab-scroll-room/) | The calendar's Day and Week reach the tab bar; no empty room under pages without the add button | [#1382](https://github.com/OpenTodoApp/OpenTodo/issues/1382) |
| [`phone-ui-trial`](openspec/changes/phone-ui-trial/) | A trial of screens made only for a phone, behind a switch on the device: Today and the task page, a date sheet, and a place and rules for the phone screens that follow | |
| [`phone-lists`](openspec/changes/phone-lists/) | Every task list in the phone screens, with all a list does: its menu, selection, reordering, subtasks and each list's own parts | |
| [`shell-push`](openspec/changes/archive/2026-11-21-shell-push/) | Reminders by push to the Android app through UnifiedPush, with no Google service and no new server feature; the iPhone stays on its background refresh | [#1344](https://github.com/OpenTodoApp/OpenTodo/issues/1344) |

## Future ideas

Not commitments. Each would start as an OpenSpec change.

- **Real-world verification** beyond CalDAV (`caldav-verified`): single sign-on with Authentik and Keycloak, email to task with common IMAP providers, MCP with real assistant clients, and voice capture, web push, passkeys and touch drag and drop on real devices. Fix what they turn up and record the results in the docs.
- **Built-in SMTP receiver** for email to task, for operators who own an MX record (`email-smtp-receiver`).
