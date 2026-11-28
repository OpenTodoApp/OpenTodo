# Design

## Context

`web/src/phone/prefs.ts` keeps one device value, `opentodo.phoneUi`: `'0'` when a person turned "New phone screens" off, absent otherwise. `Shell.tsx` shows the phone UI when the value is not `'0'` and the window is narrower than 768 px; `PreferencesPanels.tsx` draws the switch below 768 px. Nothing else in the app reads the value: every other narrow branch asks the width, or a React context the phone UI's wrapper (`PhoneChrome`) provides.

The `phone-ui` capability is not in `openspec/specs/` yet. Its requirements are ADDED by five open changes: `phone-ui-trial` (the opt-in requirement and the first screens), `phone-lists`, `phone-calendar`, `phone-all-screens` and `phone-ui-default`. Four of them describe the phone screens by comparison: "as with the switch off".

## Goals / Non-Goals

**Goals**

- One phone interface: below 768 px the phone UI, with no way to choose another.
- A device that had turned the switch off shows the phone UI with nothing to do.
- From 768 px not one pixel changes.
- The specs no longer describe a switch or define the phone screens by a layout that is gone.

**Non-Goals**

- Removing narrow branches from components the desktop also renders (D4).
- Any change to what the phone screens show or do.

## Decisions

### D1. How the specs express the removal

A REMOVED or MODIFIED delta only applies to a requirement that is in `openspec/specs/`, and no requirement about the switch is there. So:

- **This change's delta ADDs one requirement** to `phone-ui`, "The phone screens have no switch": no switch, no second phone layout, and what happens to a device that had stored a choice.
- **The open changes' deltas are edited in place**, since they are the only text of those requirements:
  - `phone-ui-trial`: "The phone screens are opt-in on each device" becomes "The phone screens are shown below 768 px" (the width alone decides; the scenarios about turning the switch on and about one device only go). "With the switch on" in the date sheet and transition requirements becomes "Below 768 px".
  - `phone-ui-default`: "The phone screens are the default on a phone" keeps what still holds (shown on every device without opening Settings, a device from the trial keeps them) and loses the switch, turning it off and the second device.
  - `phone-lists`, `phone-all-screens`, `phone-calendar`: "While the phone screens are on below 768 px" becomes "Below 768 px". A comparison "as with the switch off" becomes "as from 768 px" where the desktop does the same thing (the tasks, groups and order of a list, the operations written, the bulk actions, a section's menu, the rules of a drag), and names the thing itself where the reference was the earlier phone layout's own chrome (the items of a page menu, a list's own parts, the row menu). The scenario "Off" of the phone header becomes "A wide window".
- The proposals, designs and tasks of those changes are history and stay as written; `phone-ui-default` gets one line saying this change followed.

Alternative: leave the open deltas and let this change's requirement say which words it replaces, as `phone-ui-default` did with "off until the person turns it on". Rejected: after archiving, the capability's spec would still tell a reader to compare with a layout that no longer exists, in some twenty places.

Alternative: archive the five changes first, then write REMOVED and MODIFIED deltas. Rejected: `phone-ui-default` has an open task (its 3.2), and archiving is not this change's to do.

### D2. The stored value is removed when the app opens

Nothing reads `opentodo.phoneUi` any more, so a device with `'0'` shows the phone UI without a migration. The shell also removes the key once it mounts (`removeItem`, one line in the hook that asks the width).

Alternative: leave the key. It would be harmless today. Rejected: a value nothing reads stays in every such device's storage for good, and a later feature that reused the name would inherit a stale "off". One line now is cheaper than remembering that.

No data model impact: no op field, no table, no route. The value was device storage only, never synced.

### D3. Tests

Each test that turned the switch off in its setup is one of three things:

- **It fixed the structure of the earlier layout** (the shell's bar holding a list's menu, the desktop row's phone cell inside the shell, the stacked facts of the task page, the breadcrumb in the shell's bar): deleted. The phone UI's own tests cover its bar, row, facts and selection.
- **It checks behaviour the phone UI also has** (the drawer, the add sheet, the selection bar that never moves the list, the tab bar, the Inbox's Process in the bar, a project's filter chip, focus kept in the panel): rewritten to find the same thing in the phone UI. The assertions stay.
- **It compared the phone UI with the earlier layout rendered beside it** (the parity tests of `phone-lists` and `phone-all-screens`): the rows, groups and order are now compared with the same list at 1280 px; the items of a page menu, which the desktop header arranges differently, are pinned as lists. Today's "Re-plan the rest of the day" depends on the hour and is left out of that list.

### D4. What stays, and why

The earlier phone layout was not a set of files: it was the narrow branch of components the desktop renders too. Below 768 px inside the shell the phone UI now always wraps the page, but these branches are still reached, or not shown to be unreachable, so they stay and are the follow-up:

- **The shell's phone bar** (`PhoneBar` in `Shell.tsx`, the `pageBar` store, the branch of `PageHeader` below 768 px): it is what a phone shows while the phone UI's chunk loads and on a screen that draws no page header, and `PageHeader` is also drawn outside the phone UI's wrapper (the task panel, the public screens).
- **The desktop row and facts below 768 px** (`phoneCell` and `data-row-phone` in `TaskRow.tsx`, `stackedFirst` and the stacked facts in `TaskFacts`): a board's card and a row outside the wrapper still use the row; the task panel can open as a sheet between 600 and 767 px.
- **The task list below 768 px** (`TaskListView`'s add row and bar items): a project in its Board, Timeline or Calendar layout is still `TaskListView` on a phone.
- **The calendar's own rows** in Week's list, Month's chosen day and Plan's agenda (the fallback beside `CalendarRowDrawContext`): unreachable inside the shell, but rendered by tests and stories without the wrapper.
- The tests and stories that render these components at a phone width outside the phone UI, and the phone section of `docs/interface-guide.md`, which describes them.

Removing them is a change per component, each with its own proof that the desktop is untouched.

### D5. The checks

- `scripts/e2e-layout.mjs`: `PHONE_UI` goes; below 768 px a screen of the app must show the phone UI. CI loses the step "Layout check with the earlier phone screens" of every layout leg.
- `scripts/perf/run.mjs` and `run.sh`: `PERF_PHONE_UI` and the second phone run (`web-phone-earlier.json`) go. `budgets.json` and `docs/performance.md` have no row for it.
- `scripts/e2e-phone.mjs` never set the switch and is unchanged.

### D6. Interface budget and size

No screen gains chrome: Settings → Appearance loses one card below 768 px. The phone screens keep the budget `phone-lists` and `phone-all-screens` state. No shortcut is added.

No dependency. The first load loses the preference module and the switch's section and copy; the container image and runtime memory are unchanged.

## Risks / Trade-offs

- **Someone relied on the earlier layout** → there is no way back on the device; `docs/phone-screens.md` and the changelog say so, and Feedback is the channel. The owner decided this on 2026-11-27.
- **A function only the earlier layout had** → the phone UI's parity tests (`phone-lists`, `phone-all-screens`) are what says there is none; they now compare with the desktop or with pinned lists.
- **A window between 600 and 767 px** (a small tablet in portrait) shows the phone UI, as it has since `phone-ui-default`; widening it past 768 px mounts the desktop screen anew. Noted while rewriting a test: a task open as a sheet over a task list closes on that crossing. Not changed here.

## Migration Plan

No data. Reverting the commit restores the switch; a device's stored "off" is not restored once the app has removed it.
