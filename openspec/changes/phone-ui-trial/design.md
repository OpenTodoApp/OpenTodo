# Design

## Context

See proposal.md for why. What shapes the approach:

- Phone and desktop are one set of screens today. `web/src/app` and `web/src/ui` hold about 590 breakpoint classes (`sm:`, `md:`, `lg:`), and there is no single "is this a phone" function: screens ask `useMediaQuery` (`web/src/ui/useMediaQuery.ts`, `DESKTOP_HEADER_QUERY` is the 768 px line) or use `md:hidden`.
- The screen for a route is chosen in one place, `web/src/app/Shell.tsx:352-405`. Today has no branch of its own: it falls through to `TaskListView`. The task page is `TaskPage`, imported statically.
- Most of the logic is already outside the markup. Today's content comes from `useListModel` (`web/src/app/task-list/useListModel.ts`) over pure functions in `web/src/lib` (`listGroups.ts`, `dayLists.ts`, `closedList.ts`). The task page is fed by `useTaskDetail`. Completion is `completeWithUndo` (`web/src/app/undoable.ts:15`), the swipe is `useRowSwipe` (`web/src/app/task-list/RowSwipe.tsx:51`).
- The desktop row, `TaskRow.tsx`, is about 1,075 lines of responsive markup. It is what a phone screen must not inherit.
- TREK (`liketrek/TREK`, a web app in web-view apps like ours) runs this arrangement at scale: `client/src/mobile/` with its own shell and screens, one hook per feature under both views, and two CI checks that keep the pairs honest. This design copies its rule, not its code.

## Goals / Non-Goals

**Goals:**

- Two screens a reviewer can hold in the hand and compare with the current ones by flipping a switch.
- No cost to anyone who leaves the switch off: same first load, same screens, same tests.
- A structure the next screens can follow without another decision.

**Non-Goals:**

- Matching what only platform views can do (the system's own sheet physics, the interactive back swipe on iPhone). The trial measures how far a web view gets without them.
- Refactoring the desktop screens, or removing their phone classes. That waits for the verdict.
- A phone design system. The phone screens use the tokens and primitives that exist.

## Decisions

### D1. A sibling directory, `web/src/phone/`

```
web/src/
  lib/     data and logic (shared)
  ui/      primitives (shared)
  app/     desktop screens, and the hooks both views run on
  phone/   phone screens
    prefs.ts  transition.ts
    screens/     PhoneToday.tsx  PhoneTaskPage.tsx
    screens/     PhoneTodayView.tsx  PhoneTaskView.tsx   (the drawings)
    components/  PhoneHeader.tsx  PhoneGroup.tsx  PhoneRow.tsx  FactRow.tsx  PhoneDateSheet.tsx
    stories/     frame.tsx
```

`web/src/layering.test.ts` gains two rules:

- A file under `src/phone/` imports from `src/app/` only what is on an allow-list in the test: hooks and models (`useListModel`, `useTaskDetail`, `useBriefing`, `useTodayAgenda`, `undoable`, `motion`, `router`, `rowSwipe`, `RowSwipe`), and the editors and sections of D5. Each entry carries its reason.
- Under `src/app/`, only `Shell.tsx` and `PreferencesPanels.tsx` import `src/phone/`.

Alternative: `web/src/app/phone/`, which inherits every lint rule for free. Rejected: the point is a boundary a reviewer can see, and three small config edits buy it (see D7).

Alternative: move the shared hooks to a new `src/features/` first. Rejected for the trial: it is a large move with no visible result. If the trial passes, the allow-list is the list of what to move.

### D2. Chosen in `Shell.tsx`, loaded on demand

`Shell` computes `phoneUi = phoneUiOn && !useMediaQuery(DESKTOP_HEADER_QUERY)`. In the route switch, `today` renders `PhoneToday` and `task` renders `PhoneTaskPage` when `phoneUi`, with the existing pattern `lazy(() => import('../phone/screens/PhoneToday').then((m) => ({ default: m.PhoneToday })))` inside `Suspense`. On those routes `Shell` does not render its own phone bar; the phone screen draws its bar from `PHONE_BAR_FRAME` (`web/src/app/phoneFrame.tsx`), so the cold-start skeleton still matches.

`scripts/bundle-budget.mjs` counts the entry chunk and its static imports. Both phone screens are dynamic imports: `PhoneToday` is 4.1 KB gzip and `PhoneTaskPage` 3.5 KB, fetched only with the switch on. The first load still moves, measured against `main` of 2026-11-25 (`aff2ae532`):

| | `main` | this change | budget |
| --- | --- | --- | --- |
| entry chunk | 101.0 KB | 100.6 KB | 148 KB |
| entry and its static imports | 657.4 KB | 660.0 KB | 712 KB |

The 2.6 KB is not new code on the first load (the shell gains two small modules, the switch and the own-bar signal). It is the bundler splitting modules that the phone screens share with the first load (`undoable`, `ProjectMark`, `occurrenceView` and others) out of the entry into chunks of their own, 194 static chunks in place of 189, which compress less well apart. It stays inside the budget with 52 KB to spare; the budget is not raised. The next phone screens will share more modules, so that change should either group the shared modules into one chunk or raise the budget on purpose.

Alternative: a second Vite entry (`phone.html`). Rejected: the shells load one address, sign-in and the service worker are tied to it, and a window can cross 768 px.

### D3. The switch is a stored device value

`web/src/phone/prefs.ts` uses `createStoredValue('opentodo.phoneUi', ...)` (`web/src/lib/deviceStorage.ts:95`), the mechanism of the Vim switch (`web/src/app/vim/prefs.ts`; toggle at `web/src/app/PreferencesPanels.tsx:143`). No data model impact: no op field, no table, no route.

Alternative: a synced preference. Rejected: a trial should not write to the op log, and a reviewer wants it on one phone only.

### D4. One hook per feature, two views

The phone screens call the hooks the desktop screens call and hold only markup:

| Feature | Shared logic | Desktop view | Phone view |
| --- | --- | --- | --- |
| Today's list | `useListModel({ view: 'today' })` | `TaskListView` | `PhoneToday` |
| Today's events | `useTodayAgenda` | `TodayAgenda` | `PhoneToday` |
| Complete, undo | `completeWithUndo` | `TaskRow` | `PhoneRow` |
| Row swipe | `useRowSwipe` | `TaskListRow` | `PhoneRow` |
| The date | `quickChoices`, `monthGrid`, `setDueWithUndo`, `doOnWithUndo` | `WhenControl`, `RowScheduleSheet` | `PhoneDateSheet` |
| Task page | `useTaskDetail`, `useTaskFacts`, `PartEditor` | `TaskPageView`, `TaskFacts` | `PhoneTaskPage` |

A behaviour that must differ between the views becomes a parameter of the hook, never a copy. `stripHabits` is pure and moves from `web/src/app/habits/TodayStrip.tsx` to `web/src/lib/habits.ts`.

`useListModel` serves every list view and returns more than Today needs. The phone screen reads only the groups, the closed list and the ready state. If it turns out to force desktop concerns on the phone screen, the change adds a narrow `useTodayModel` that both views call; it does not fork.

TREK's pair file and duplication check are not added yet: with two pairs, the table above in this document and the layering test are enough. They are the first thing to add if the trial passes.

### D5. Views that only draw, containers that feed them

The present phone layout is further along than the proposal assumed: Today already has a large title and two-line rows, and the task page already has its own bar, a card of 44 px fact rows and editors that open as bottom sheets (`Popover` is a sheet below 640 px, with drag to dismiss). A phone screen that repeated that would change nothing. So the design was drawn first, as stories with fixed data (`Phone/Design`), compared with the present screens and approved by the owner on 2026-11-25. What differs is what is left out and how the rest is grouped:

- **Today**: tasks as cards per group, one line of facts under the title, no grip, no add field in the page, a group's actions behind one menu, events as a card at the top, completed tasks as one row at the end.
- **Task page**: title and note first; the facts the task has as rows in two cards (when; where and what); the facts it does not have as buttons under them, in place of "More properties".

Each screen is two files:

- **A view** (`PhoneTodayView`, `PhoneTaskView`) that takes everything it shows as props and holds no data access. The stories and the tests draw it with fixed data; this is also what makes it a pane (D9).
- **A container** (`PhoneToday`, `PhoneTaskPage`) that calls the shared hooks (D4) and maps their result to the view's props.

Components: `PhoneHeader`, `PhoneGroup`, `PhoneRow`, `FactRow` (with `FactCard` and `FactChips`), `PhoneDateSheet`.

The task page's facts: the list of facts (their names, icons, values in words and tones) is built today inside `web/src/app/task-detail/TaskFacts.tsx`. It moves to a hook beside it, `useTaskFacts`, which `TaskFacts` and `PhoneTaskPage` both call. The editors are not wrapped again: `PartEditor` (`web/src/app/task-detail/Facets.tsx`) already opens each fact's editor as a bottom sheet on a phone, anchored to the row or the button that opened it. Only the date has a new sheet (D10). `TaskNotes`, `Subtasks`, `FieldsGroup`, `AttachmentsRow`, `TaskRelations` and `ConversationTabs` are rendered as they are, below the facts.

Budgets: one row of chrome above the first item; a row shows the check, the title and at most four facts (six properties, inside seven); one scroll region per screen plus a sheet's own. No new shortcut. Colours, type, radius and motion from the tokens in `web/src/index.css`; icons through `<Icon>`.

Left out on purpose: reordering by dragging on the phone Today. Without a grip it needs a long press and a lift, which is its own change; the screen keeps Today's computed order.

Alternative: new phone editors for every fact. Rejected for the trial: it is most of the work of the whole phone UI, and the present editors are already sheets. The most used one is made for the phone (D10).

### D10. One editor made for the phone: the date

The desktop When editor (`web/src/app/task-detail/WhenEditor.tsx`, `WhenControl.tsx`) is one popover with six segments under a segment picker (Do on, Start, Sector, Deadline, Repeat, Reminders), a typed date field first and a compact line of quick choices. That is a keyboard design. On the phone:

- **The segments become rows.** The phone task page lists Do on, Start, Deadline, Repeat and Reminders (and Sector while sectors are on) as separate fact rows. Do on opens the new sheet; each of the others opens its present editor through `PartEditor`, unchanged.
- **`PhoneDatePanel`** (`web/src/phone/components/PhoneDateSheet.tsx`) and its container `TaskDateSheet`, top to bottom: the quick choices, each with the date it means; the month; the time of day row of the desktop editor (`TimeOfDay`, which holds the time and the parts of the day); Clear in the sheet's title row. No typed field: on a phone the keyboard would cover the month, and typing a date is what quick add is for.
- **No new logic.** Quick choices from `quickChoices('due')` (`web/src/lib/dates.ts`), the month from `monthGrid` (`web/src/lib/month.ts`) with the user's first day of the week, the time and the parts of the day through `TimeOfDay` (`web/src/app/task-detail/WhenControl.tsx`). Writes go through `setDueWithUndo`, `doOnWithUndo` and, for Someday, `parkWithUndo` (`web/src/app/undoable.ts`), which are what `WhenControl` and the row's schedule sheet call.
- **The row swipe opens it too.** `useRowSwipe` takes the sheet to open as a parameter; the desktop row keeps `RowScheduleSheet`, the phone row passes `PhoneDateSheet` with Someday on. One date sheet on the phone, and nothing the swipe offers today is lost.
- **Changing month** is a tap on the arrows. A horizontal swipe on the month is left out: it would compete with the drag that dismisses the sheet, and the arrows are 44 px each.
- **In the sheet.** It opens in `Dialog placement="bottom"`, which is at most 80 % of the screen high, so the panel is kept short: the choices in two columns, and only the weeks that hold a day of the month (five for most months). On a 360×640 screen that shows the choices and a five-week month; the time row is a short scroll below.

Alternative: the platform's own date input (`<input type="date">`), which gives each system's native picker for free. Rejected: it has no quick choices, no parts of the day and no Clear in one place, it looks different in each web view, and it is a dialog over a sheet. It stays the fallback worth trying if the reviewer finds the month grid wanting.

### D6. Push and pop with the View Transitions API

`web/src/phone/transition.ts` wraps the two navigations: opening a task from the list (`openTaskFromList`, a push) and the page's way back (`leaveScreen`, a pop, which the page's Back and the edge swipe both call). It sets a direction on the root and calls `document.startViewTransition`; keyframes in `@layer components` slide the new screen in from the end edge over the old one, or the old one out, in `--duration-emphasis`. It is skipped when `noMotion()` or reduced motion is on, or the API is missing.

Two things the first run in the app showed:

- **No frame is drawn while the transition's update runs**, so the update waits for the new screen in timer steps, never in an animation frame (which would only come after the browser's four-second timeout).
- **The list is put back at its scroll position inside the pop's update**, before the browser takes the picture it slides in; otherwise Today came in at its top and jumped. The shell's own restore (`settleTrail`) then sets the same value.

The system's Back is a history event that has already happened when the app hears of it, so it cannot be wrapped: it returns to the list, at its place, without the slide. The phone screens do not scroll themselves: they sit in the shell's content, so the scroll position, pull to sync and the tab bar that minimises all keep working.

Alternative: keep both screens mounted and animate with CSS transforms, as a navigation stack does. Rejected for the trial: it changes how `Shell` mounts screens. It is the next step if the transition is what the reviewer still notices.

### D7. The phone UI is built in Storybook, and the checks reach the new directory

Storybook is where the phone UI is built and reviewed, as it is for `web/src/ui`:

- **Every component and screen under `src/phone/` has a story.** Rule 1 of `scripts/ui-check.mjs` (a component file in `web/src/ui` needs a sibling `*.stories.tsx` that imports it) is extended to `web/src/phone`, so `make ui-lint` fails on a phone file without one. This is stricter than `web/src/app`, where stories are optional.
- **Stories sit beside their files** (`PhoneRow.stories.tsx`, `PhoneToday.stories.tsx`, …) under the titles `Phone/Components/…` and `Phone/Screens/…`. The story glob in `web/.storybook/main.ts` is `../src/**/*.stories.tsx`, so it already finds them.
- **Each story is drawn at phone width.** A decorator shared by the phone stories (`web/src/phone/stories/frame.tsx`) frames the story at 375 px whatever the toolbar's Width says, so the accessibility and visual checks, which open each story with only a theme, see a phone. Screens are seeded with the fixtures the screen stories use (`web/src/app/stories/fixtures`: `seedToday`, `withClock`, `withSeed`).
- **States are stories.** A row: plain, two-line title, four facts, overdue, completed and leaving, mid-swipe right and left (held by a story-only override, as `web/src/app/phone.stories.tsx` holds its rows). Today: empty, a usual day, a long day with a Today limit, with calendar events. The task page: a bare task, a full task, each fact sheet open.
- **The gates apply unchanged.** `make ui-check` runs axe (WCAG 2.2 AA) and the motion check on every story in light and dark and compares against the baselines; new stories get new baselines.

The other checks:

- `web/eslint.config.js`: the `src/app/**` rules (no `lib/db`, no Dexie, function length) also apply to `src/phone/**`.
- `scripts/ui-check.mjs`: `src/phone` also joins the globs of its other rules (no emoji or glyph icons, no untranslated text, no raw radio input).
- Tests simulate a phone as `web/src/app/tabBar.test.tsx` does: a `matchMedia` stub resolving `min-width` through `minWidthPx` (`web/src/ui/test-utils.tsx`) at 390 px.

### D8. The gate

The change ends with a check on real phones and a verdict from the people who gave the feedback, recorded in `mobile/AUDIT.md` with the date. The change is archived either way; the verdict decides what is proposed next.

Decided with the owner (2026-11-25), for after a positive verdict:

- **The phone UI becomes the default on every phone.** The rule stays the width, below 768 px, not the app: the Android app, the iPhone app, a phone browser and the installed web app all show it. One rule means one phone interface to maintain, and what Storybook and a browser show is what the apps show.
- **Not before the verdict.** Until the everyday screens exist, a default would give everyone an app that is half new and half old. The switch stays off by default in this change; the change that adds the last everyday screen turns it on by default and keeps it as a way back for one release.
- **The shells need no change for this.** They load the web app from the server, so they get the phone UI with the server's next release.
- **Every function, in the new interface.** The destination is not a short list of everyday screens with the rest left responsive: everything a person can do in the web app is to be reachable in the phone UI, designed for it. The router has about fifty views (`web/src/app/router.ts`), so this is a programme of changes, not one.
- **How that stays manageable:**
  - *A list that is checked.* The pair file TREK uses (`feature-pairs.json`): every screen and every editor of the desktop app is listed with its shared hook and either its phone view or the word "pending". What is left is then a list anyone can read, and a check fails when a new desktop screen is added without an entry.
  - *No function is ever missing on the way.* A screen without a phone view yet shows its present responsive layout inside the phone UI's chrome. People lose nothing while the list shrinks.
  - *Order by use.* The lists (Inbox, Upcoming, a project), quick add and search first; then the editors still reused in sheets; then the calendar, notes, habits and the rituals; Settings and administration last.
  - *Logic leaves the markup first.* A screen whose logic sits in its component gets its shared hook in one change and its phone view in the next, so each change is reviewable and the desktop screen is proven unchanged in between.
- **The responsive phone layout is then removed** from each desktop screen as its phone screen ships, so there is never a third variant. When the list has no "pending" left, the phone classes are gone from `web/src/app`.

Alternative: the phone UI only inside the apps, keyed on the shell bridge (`shell()` in `web/src/lib/shell.ts`). Rejected: a phone browser would keep the responsive layout forever, which is two phone interfaces.

### D9. Phone screens are panes, so a tablet can show two of them later

Tablets are out of scope: from 768 px the desktop screens stay, where a sidebar, a list and a detail side by side already fit. After a positive verdict, the tablet is to become a wide form of the phone UI (a rail in place of the tab bar, Today and the task page side by side), not a third interface. To keep that a matter of composition, the phone screens are written as panes now:

- A screen fills its container, not the viewport: no `100vw`, `100dvw` or `w-screen`, and no layout that reads the window's width. Where a screen must adapt to its own width it uses a container query.
- A screen's sticky bar and its sheets attach to the pane, not to the page: sheets go through the shared overlay, and the bar is `sticky` inside the pane's scroller rather than `fixed`.
- Nothing in a screen knows that the tab bar is under it: the room it leaves at the bottom is a value the shell passes in.

A story, `Phone/Panes/Two panes`, draws `PhoneToday` and `PhoneTaskPage` side by side in a 1,024 px frame. It is the check that the rule holds, and it is not a design for the tablet: the rail and how the panes share the width are a later change.

Alternative: let the phone UI apply up to 1,024 px now. Rejected: one column on a tablet is a stretched phone, and the trial is about phones.

## Risks / Trade-offs

- [The verdict is "still a website"] → That is a result, not a failure of the change: it cost two screens, and the designs carry over to the native app.
- [Two views of one feature drift apart] → D4: no logic in the phone screens, and the layering test refuses an import of a desktop screen. The pair file and duplication check follow with the third screen.
- [A desktop editor reads badly inside a sheet] → Noted per fact during the device check; a phone editor for it is a follow-up change.
- [`useListModel` carries desktop concerns into the phone screen] → A narrow shared `useTodayModel`, see D4.
- [The transition is janky on older Android web views] → It is skipped where the API is missing, and the device check covers a mid-range Android phone.
- [Visual baselines] → New stories only. With the switch off, no existing baseline changes; a diff there is a bug.
- [Dead weight if the trial fails] → Everything is under `web/src/phone/` plus a few lines in `Shell.tsx`, `PreferencesPanels.tsx` and three configs. Removing it is one small change.

## Migration Plan

Nothing to migrate. The switch is off by default and kept on the device. Rolling back is turning it off; removing the feature leaves an unused key in the device's storage.
