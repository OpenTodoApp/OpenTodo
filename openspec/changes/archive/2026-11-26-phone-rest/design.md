# Design: the rest of the app on a phone

## Context

Every gap below was first measured in Chromium at 390×844 with touch (`hasTouch`, `isMobile`), some also at 360 px, against a throwaway server seeded by `scripts/ux-audit/seed.mjs`. A gap that the browser did not show is recorded here and left alone.

## Decisions

### D1. The add button and the last rows: nothing to change

**What was true.** With 18 more tasks in Today, the Inbox and a project, and every scroller moved to its end, the last row and the last control end above the add button on every screen that has it: Today (the last control ends at 687 px, the button starts at 720 px), the Inbox (671), a project (671), Week's list (703), Month, Plan, Upcoming, Next, Waiting, the Loop home, Notes, a note's page, Labels, Views, Projects, Completed, Assigned, Anytime, Locations, the Daily check, the Monthly look, a label, a saved view and a dashboard. The content column keeps `--add-room` at its end (`phone-fab-scroll-room`), the calendar's own scroller ends with `.add-room-end`, and the screens without the button keep no room. The swipe that hit the button in the end-to-end script started on a row that was under the button in the middle of a list, which a floating button allows by design: the list scrolls the row clear.

**Chosen.** No change. The layout check already fails when a screen scrolled to its end leaves a control under the button; D7 adds ten screens to it.

### D2. Settings fields on touch: nothing to change in the app

**What was true.** On all 59 Settings pages at 390×844 with touch, no text field, select, text area or button is under 44 px. The rule that sets the 32 px step in a setting row is in the `components` layer; the coarse-pointer rule (`min-height: 44px`) is outside any layer, so it wins whatever its specificity.

**Chosen.** No change to the app. `scripts/ux-audit/settings-heights.mjs` now lists touch controls under 44 px on each page and counts them, and `STRICT=1` fails on one, so the measure exists the next time the cascade changes.

### D3. Settings → AI assistants: nothing to change

**What was true.** The page does not scroll sideways (document and content column: 0 px). The configuration block scrolls inside itself, is a tab stop with a name, and **Copy configuration** is a visible 44 px button under it; a tap puts the text on the clipboard and the button says Copied.

**Chosen.** No change.

### D4. Statistics: a fade where a region continues

**What was true.** At 360 and 390 px the page does not scroll sideways. The heatmap (1412 px of content), the weekday and hour grid (616 px) and an open table (up to 1311 px) scroll inside themselves, and a finger drag scrolls them. "Show as table" opens and closes all four tables. But nothing shows that a region continues: it is cut at the screen's edge, and the heatmap, which opens on the current week, hides eleven months to the left with no sign.

**Chosen.** The three regions take the existing `.ui-scroller` edge fade with `useScrollEdges(ref, 'x')`, the hook the tab rows use: an edge fades only while content is hidden past it, so a chart that fits shows no fade. The heatmap is a reversed row, which starts at its right end and counts `scrollLeft` down from 0; the hook read that as "at the left edge" and would have faded the wrong side. It now reads the row's direction (a reversed row, or right to left, starts at the right), which also corrects a tab row in a right-to-left language. No new CSS, no scroll buttons, no redesign.

**Alternatives.** Arrow buttons at the edges: more chrome on a dense page. A scrollbar that is always shown: not available on iOS.

### D5. Notes: From template… in the page's menu

**What was true.** At 390 px the Notes page's menu held Select notes, Sort and Help. From template… exists only as the split part of New note, which the phone header does not have, and as `Shift+Q`.

**Chosen.** Below 768 px, where the split button is not shown, **From template…** is the first item of the page's menu, in List and Graph mode, followed by a separator. It opens the same `TemplatePicker`: a sheet below 640 px, and from 640 to 767 px a popover docked under the search row (the picker needs an anchor there, and the split button is absent). From 768 px the menu is unchanged. The string exists already.

### D6. Routines: Run now in the menu below 640 px

**What was true.** At 360 px the row's text column was 94 px wide and the seeded routine's row 270 px tall; at 390 px, 124 px and 216 px. The row's menu already held Run now.

**Chosen.** The row's Run now button is hidden below 640 px (`max-sm:hidden`); the menu's item is the entry there. The text column is 200 px at 360 px and the row 144 px tall. From 640 px nothing changes. No second line of buttons under the text: the menu is one tap away and holds every other action already.

### D7. The layout check opens ten more screens

**What was true.** `scripts/ux-audit/layout-screens.mjs` had no entry for Next, Waiting, the Loop home, the weekly review, Close the day, the Daily check, Habits, a habit's page, Focus and a note's page; `screens.json` listed six of them as outside the check.

**Chosen.** An entry for each. The seed gains one habit (which turns Habits on) and one standalone note with a long title, a long address and a code block wider than a phone. The inventory points at the new entries and gains four (Close the day, the Daily check, a habit's page, a note's page). The first run found two problems on these screens:

- **Habits: "More ways to check in" was invisible until hovered.** Found by the layout check on the new Habits entry. Already fixed on main by `touch-open-and-controls` (#2111), which landed while this change was written; this change adds nothing for it.
- **A note's page: axe reports the code block as a scrolling region without keyboard access.** In the editor the block is part of the editable text: the caret moves through it and the block scrolls with the caret (measured: End on a 919 px line in a 356 px block scrolls it by 560 px). axe does not count a caret. A tab stop inside an editing host would take focus away from the editor, so the block is not given one; the check now leaves out this one rule for a region inside `[contenteditable="true"]` and reports it everywhere else.

**Not done.** A read-only note (a viewer's) and rendered Markdown draw the same block without a tab stop; with a keyboard and no pointer a long line there can be copied with the block's Copy button but not scrolled. A tab stop on every code block changes desktop keyboard navigation and belongs in its own change.

## Data model

None. No op, no field, no stored preference.

## Interface budget

No new chrome above a list: the Notes entry is a menu item, and Routines loses a button below 640 px. No new task property, sidebar destination, vertical scroller or shortcut. No dependency; image size and memory are unchanged.

## Risks

- `useScrollEdges` is shared with the tab rows: for a left-to-right row that is not reversed the computation is the same as before (`scrollLeft > 1`, and `scrollLeft < max - 1`), covered by the existing tab row test.
- The seed's new habit adds a row to Today and turns Habits on for the layout check and the audit tour.
