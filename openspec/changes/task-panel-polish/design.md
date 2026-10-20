# Design

## Context

- Today's chip editor (`PropertyChip.tsx`) closes on `blur` when focus leaves its box, and the chip button toggles `editing` on click. A click on the chip while the editor is open runs blur (close) and then click (`setEditing(!editing)`, where `editing` is false by then), so the editor reopens. `task-panel-facets` replaces chips with parts and popovers, and the `Popover` primitive closes on outside pointer-down. The same race exists there unless the anchor is excluded from "outside".
- `WhenControl.tsx` composes `DueField` (a `DateField`, a `TimeField`, a clear button and `ZoneControl`), the start choice (Anytime, a `DateField`, Someday), the deadline `DateField`, the Evening switch, `RecurrenceField` and `RemindersField`. `DateField` already parses typed phrases through `app/datetime/parse.ts` and renders a keyboard-operable month grid in a popover.
- `ConversationTabs.tsx` renders `Tabs` in a `section` inside the panel's single scroller (`TaskDetail`), and the composer is portalled into the pinned footer. `CommentsTab.tsx` renders each comment's actions in a `hover-reveal` row (opacity, not display), which keeps its height.

## Goals / Non-Goals

**Goals:** a When editor whose every control has a visible label and a familiar shape; one click to toggle; a conversation whose tabs stay reachable and whose content does not jump.

**Non-Goals:** natural language on the When line, changing what is stored, new reminder kinds.

## Decisions

### D1. The anchor is not outside
`FacetEditor` passes its part button as `anchor` to `Popover`, and `Popover`'s outside-pointer test ignores events whose target is inside the anchor. The part's own click handler then toggles (`editing === part ? close : open`). Because the popover is no longer closed by a blur, the order of events cannot reopen it. The same fix goes into the shared `Popover`, so every anchored popover in the app (pickers, menus) toggles on its trigger. A test asserts it for the primitive and for a facet part.

### D2. `DatePicker`: quick choices, a worded field, an inline grid
A new `DatePicker` composes three pieces, all keyboard-operable:
- **Quick choices**: a `role="radiogroup"` of 3 to 5 chips given by the caller, each `{ label, date }` with the date in muted text ("Tomorrow · Thu 22"). Today's, Start's and Deadline's sets come from one table in `web/src/lib/dates.ts` (`quickChoices('due' | 'start' | 'deadline', today, weekStart)`), so the words match the list row and the quick-add parser. "This weekend" is the next Saturday (today if Saturday), "Next week" is the next week start, "End of week" is the last day of the user's week, and "End of month" is the last day of the month.
- **The field** shows `dt.formatDate(date, 'medium')` ("Thu 22 Oct") when not focused and the typed text while focused. Under it, a muted line previews the parse ("→ Fri 23 Oct") or the error. Enter commits. Today's `parseDateInput` is reused unchanged.
- **The grid** is today's month grid from `DateField`'s popover, extracted into `MonthGrid` and rendered inline (no icon to open it). A picked day commits.

`DateField` keeps its API for other screens and is re-implemented on top of `MonthGrid`, so there is one grid.

### D3. The Do on segment
Order: quick choices (Today, Tomorrow, This weekend, Next week, No date). The date field and the grid. Then "Add time" (a text button). Once a time is set, it shows as a `TimeField` with suggestion chips (09:00, 13:00, 18:00) and a "Remove time" text button. Then the Evening switch, and the zone line, which appears only when a time is set: "Floating time · Change" or "Fixed to New York · Change". "Change" opens today's `ZoneControl` popover nested. No chip, no "×". The footer's Clear removes the date (and with it the time, the evening flag and the zone, as `DueField`'s clear does today).

### D4. Start, Deadline and Repeat
- Start: quick choices Today, Tomorrow, Next week, Someday. "Someday" writes `start: 'someday'` as the Someday button does today. The field and the grid follow, and an empty value reads "No start date".
- Deadline: quick choices End of week, End of month, In 2 weeks, then the field and the grid.
- Repeat: when a rule is set, its words come first (from `describeRecurrence`). Presets follow as a radiogroup (Every day, Every weekday, Every week on <weekday of due>, Every month on the <day of due>, Every year on <day month>, Custom…). A preset writes the same `recurrence` object `RecurrenceField` builds for that rule. Custom… expands today's editor in place. Without a due date, the weekday and day-of-month presets use today.

### D5. Sticky tabs and a stable scroll position
The `Tabs` list inside `ConversationTabs` gets `position: sticky; top: <header height>` (the header height is a CSS variable set by the sticky header), the panel background and a bottom border, so it pins under the header once scrolled to. On tab change, before rendering the new tab, `ConversationTabs` records the tab bar's `getBoundingClientRect().top` relative to the scroller. After render, in a layout effect, it restores the scroller's `scrollTop` so the bar stays at the same on-screen position, clamped by the new content height. CSS `overflow-anchor: none` on the tab content prevents the browser's own anchoring from fighting it. The new tab's content gets a `min-height` of the visible area below the bar, so a short tab (Activity with three entries) does not pull the bar down.

### D6. Comment actions without reserved space
The action group moves into the comment's header line (`author · time · edited`), aligned to the end. On a fine pointer, it is `opacity-0` with `group-hover` and `group-focus-within` at full opacity, and it occupies the header line's free space, which already exists, so no height is reserved. On a coarse pointer, there is one `IconButton` "More actions for this comment" opening a `Menu` with Reply, Edit and Delete. Root comments are 16 px apart (`space-y-4`) and replies 12 px. After a successful post, the new comment's element is `scrollIntoView({ block: 'nearest' })`.

## Data model

None. Every control writes through `mutate()` with the payloads today's editors produce. `whenControl.test.tsx` keeps its op-payload assertions.

## Size and resources

`DatePicker` and `MonthGrid` replace code in `DateField`. Expected +3 KB gzipped net in the panel's lazy chunk, and none in the entry chunk. No dependency.

## Interface budget

Lists: unchanged. Panel: properties as in `task-panel-facets`. Scroll regions: unchanged (sticky is not a scroller, and popovers are overlays). Shortcuts: none added. Inside the date field, Enter and arrows are the field's own keys, as today.

## Risks / Trade-offs

- [An inline grid makes the Do on popover taller] → about 420 px with the grid, against 817 px for the stacked editor today, and it is a popover that flips to fit, or a bottom sheet on phones.
- [Quick choices disagree with the parser] → both read one table, and a test asserts `quickChoices` against `parse('tomorrow')`, `parse('next week')` and others for six languages.
- [Restoring scroll on tab change fights the user scrolling during the switch] → restore only within the same animation frame as the tab change.

## Migration Plan

Client only. No stored state changes. Rollback is a client rollback.
