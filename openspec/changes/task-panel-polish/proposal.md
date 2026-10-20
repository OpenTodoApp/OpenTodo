# Proposal

## Why

User feedback, October 2026, on the task panel:

1. **"The comment / activity / history section has a weird scrolling."** Measured on a task with 14 comments at 1280×800: the panel is one scroller of 2140 px for 610 px of view. Comments are 128 px apart because every comment reserves a full row for its Reply, Edit and Delete buttons, which are only visible on hover (`hover-reveal` keeps their height). The thread therefore reads as gaps, and the gaps jump when the pointer moves. Once the user scrolls into the thread, the tabs scroll away with the properties, so switching from Comments to Activity means scrolling back up. The new tab is shorter, so the panel's scroll position snaps and the content jumps under the pointer.
2. **"The Do on button opens the When section, but sometimes flickers, sometimes doesn't toggle."** Reproduced: with the When editor open, a click on the Do on chip first blurs the editor (its `onBlur` closes it, because the chip is outside the editor box), and then the chip's `onClick` toggles the now-closed editor back open. The editor closes and reopens in the same frame, which is the flicker, and the second click never closes it.
3. **"The When / Do on form is too complex, wrong formatted, not understandable, old."** The editor stacks six segments in an 817 px box. Dates show as `10/20/2026` in plain inputs, each with a separate calendar icon. A lone "×" floats under the date with no label. A "Floating" button-styled chip is shown as if it were a value. "Anytime" sits as a bare word before a date input. There is no quick way to say "tomorrow" or "next week" without typing or opening a calendar.

`task-panel-facets` (proposed, not yet implemented) already moves the editors into popovers and shows one When segment at a time. That addresses the size of the form and the cause of the flicker, but it explicitly leaves the editors' internals and the conversation tabs out of scope. This change builds on it and covers what it leaves out.

## What Changes

- **Toggle that always toggles.** Activating the part that opened a popover while that popover is open closes it, in one step and without reopening. A click on the anchor is never treated as "outside". This is stated as a requirement and tested for every facet part, not only Do on.
- **A Do on segment people can read.** From top to bottom: a row of quick choices (Today, Tomorrow, This weekend, Next week, No date) with the date each one means in muted text. Then one date field that shows the date in words in the user's format ("Thu 22 Oct") and accepts typing ("fri", "in 3 days", "22/10"), with what it understood shown under it before it is committed. Then a month calendar that is always visible, so it never sits behind an icon. Then "Add time", which reveals a time field with three suggestions (09:00, 13:00, 18:00), and the Evening switch. The zone control appears only once a time is set, as a quiet line ("Floating time · change"), never as a button-styled value. "Clear" is the popover's footer action and no "×" is left inside the segment.
- **Start and Deadline use the same date picker** (quick choices adapted: Start offers Today, Tomorrow, Next week, Someday; Deadline offers End of week, End of month, In 2 weeks). "Anytime" is no longer a word in front of a field: an empty Start reads "No start date".
- **Repeat starts from presets**: Every day, Every weekday, Every week on the due's weekday, Every month on the due's day, Every year, and Custom…, which opens today's rule editor. The rule in words ("every 3 months, from the due date") is shown above the presets when set.
- **A conversation that scrolls calmly.** The tab bar becomes sticky under the panel header once the user has scrolled to it, so the tabs are always one click away while reading a thread. Switching tabs keeps the tab bar where it is on screen: the new tab's content starts under it, and the panel never jumps to a different place. Comment actions take no space at rest. On a fine pointer, they appear on hover or focus at the end of the comment's header line, over nothing. On a coarse pointer, they move into a "…" menu on that line. Comments are spaced as a thread (about 16 px apart). A comment just posted is scrolled into view above the composer.

No data model, op schema or API change: every control writes exactly what today's editors write. No new environment variable. Not **BREAKING**.

**Out of scope**: typed natural language for the whole When line (`when-line-capture`), the two-column task page, the reminders editor's internals, and the History tab's diff view. ROADMAP.md item advanced: the design refresh of the task panel (continues `task-panel-facets`). No numbered roadmap row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: new requirements "Popover triggers toggle", "Do on segment" and "Conversation tabs stay reachable" (added rather than modifying the requirements `task-panel-facets` adds, so the two changes archive in either order). "Task panel tabs" is modified to name the Time tab and point to the new rule.
- `comments`: "Readable comment presentation" gains the rule that actions take no space at rest and the thread spacing.
- `start-dates` and `deadlines`: new requirements for the quick choices of their segments.
- `recurring-tasks`: a new requirement "Repeat presets".

## Impact

- **Code**: `web/src/app/task-detail/WhenControl.tsx` and a new `web/src/app/datetime/DatePicker.tsx` (quick choices, the worded date field, the inline month grid extracted from `DateField`'s popover), `TimeField.tsx` (suggestions), `RecurrenceField.tsx` (presets in front of the existing editor), `ZoneControl.tsx` (a quiet line), `ConversationTabs.tsx` (sticky tab bar, scroll anchoring on tab change), `CommentsTab.tsx` (actions without reserved height, a "…" menu on coarse pointers), `index.css`, the facets components from `task-panel-facets` (`FacetEditor` anchor toggling), stories and baselines for `Task/Panel`, `DateTime/Date picker` and `Task/Comments`, and the docs `docs/task-panel.md`, `docs/dates-and-times.md`, `docs/deadlines-and-start-dates.md` and `docs/recurring-tasks.md`, plus the Help pages.
- **Server and API**: none.
- **Dependencies**: none. Expected client change: about +3 KB gzipped (the picker), offset in part by the removal of the stacked segments.
- **Interface budget**: no chrome row above lists, no new shortcut, and visible properties stay as in `task-panel-facets`. The panel stays one scroller: the sticky tab bar is `position: sticky` inside it, not a second scroller, and popovers are overlays.
- **Order**: implement after `task-panel-facets`. Group 1 (the conversation) does not depend on it and can land first.
