# Design

## Context

- **Click a task to** (`inline-task-editing` D6, `row-click-modes` D1): `web/src/app/rowClick.ts`, a device-local stored value (`opentodo.rowClick` in `localStorage`: `edit` by default, which is not stored, `open` or `expand`). It is not a user preference, not an op field and never synced.
- A click on a row's title calls the row's `onOpen(e)` (`TaskRow`, `useRowClicks`). In the lists drawn by `TaskListView` (Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels, places), `RowActions.open` first asks `startInline`, which opens the inline editor only for a pointer click (`detail > 0`), the `edit` choice, a fine pointer, at least 768 px, no task docked (`panelTaskId()`), no Inbox split (`taskSplitDocks()`), not a board and an editable task. Otherwise the task opens: its page, or the side panel or the Inbox's split where they dock. A click on the row's empty area always opens the task, and under `expand` both expand the row.
- The Filter view, saved views, Next and Waiting draw their rows with `onOpen={(e) => { setSelected(key); openFromRow(id, e) }}` and have no inline editor, `F2` or `a`.
- A double-click opens the page (`row-click-modes` D2): the second click of a double-click is ignored, and a double-click within `DOUBLE_CLICK_MS` of the click that opened the editor still opens the page.
- Keyboard: Enter opens (`list.open`; the side panel and the Inbox's split show the task first, a second Enter opens its page), `F2` edits in place (`list.edit-inline`), `a` adds a subtask under the selected row (`list.add-subtask`, the add-under line of every `TaskListView` list layout), → and ← expand and collapse. The cursor is real focus (`assistive-tech-semantics`): the row's open control (`[data-row-open]`, a button named by the title) takes focus with the cursor.
- The issue: what a click does depends on four things the setting does not show (pointer, width, the opening preference, the list), and the next key goes to the title field or to the list depending on it, so `a` after a click adds a subtask in the Inbox and types an "a" in Today.

## Decisions

**D1. One rule, decided by where the press began.** With a fine pointer from 768 px, in a task list:
1. A click on a row's title or empty area whose row was **not** the selected row when the press began selects it. Where a task docks beside the list (the side panel, the Inbox's split) it shows there, as for any cursor move. Nothing else happens: no editor, no page.
2. A click on the **title** of the row that **was** the selected row when the press began opens the inline editor, with the caret at the click (`caretFromClick`, as today), in every list that has the inline editor (D6), beside the side panel and in the Inbox's split too.
3. A click on the empty area of the selected row does nothing more.

The row records whether it was selected at `pointerdown` (it already receives the press for drags and the touch hold), and the click reads that record; the click's own selection never counts, so the second click of a fast double-click on an unselected row finds a row that was not selected when the double-click began and does nothing (the double-click opens the page, D2). A row selected by `j`/`k`, by returning from the task page, by the panel following a subtask link, or by a click a moment earlier all count as selected: one click edits it, as in Finder. Shift and Ctrl/⌘ clicks and Select mode keep ticking; a press that moves past the drag threshold is a drag and its click is swallowed (`lib/dnd.ts`), on the selected row too; read-only tasks (viewers) never get the editor, so the second click does nothing there.

The condition "no task docked" leaves `startInline`, so the rule is the same with As a page, with the side panel and in the Inbox. Editing in place beside a panel showing the same task is safe: both write the same `title` field through `mutate()` and the panel's title follows the stored row.

Alternatives: Finder's pause (the second click must come after the double-click interval, and the editor opens after a further delay). Rejected for the delay: a deliberate second click should act at once, as a click does everywhere else in the list (`row-click-modes` D2). The interval check is kept where it matters: see D2. Selecting on press (`pointerdown`) instead of on click. Rejected: it would select the row a drag starts from and change the panel before the user knows whether they drag.

**D2. A double-click still opens the page.** Unchanged from `row-click-modes` D2: on an unselected row the first click selects and the second does nothing, so the page opens with no editor shown. On the selected row the first click opens the editor at once and the double-click, within `DOUBLE_CLICK_MS` of that click, opens the page and closes the editor with nothing changed (the existing `opened` check in `useRowClicks`). A double-click in a title already being edited selects a word.

**D3. The keyboard keeps its meanings; Enter still opens.** The decision on the issue says Enter and `F2` edit, and also that opening a task as a page stays where it is: the open button and the keyboard. Enter is today the keyboard's way to open (the side panel and the Inbox's split show the task first, then the page), the default action of the row's open button for screen readers and switch users, the key that accepts "complete the parent too?" and the archive offer, and `Expanded rows` says Enter opens the task page. Making Enter edit would move opening to a new key and change what a screen reader's activation does. So `F2` edits (unchanged, and the Windows and Linux file managers' rename key), Enter opens. This is open question 1 in the proposal's discussion; if the maintainer wants Enter to edit, the cost is a new open key and a change to the `list.open` scenarios in four specs.

**D4. The setting goes, all three choices.** "Click a task to" and its select leave Settings → General → Keyboard. The rule replaces Edit in place and Open details. Expand the row (`row-click-modes`, five days old) goes too: under the rule a first click selects and a second edits, so a click that also expands and hides the row would give the same click a third meaning and bring back a setting that changes what a click does. Expanding stays on → / ← and the row's Show details action (one click), unchanged. Alternative: keep Expand the row as the one named exception (a first click selects and expands, a second hides, nothing edits on a click). Rejected for now: it is the conflict the issue reports, in a new place; open question 2.

`rowClick.ts` keeps only `DOUBLE_CLICK_MS`; `RowClick`, the store and `clickExpands` go. The stored `opentodo.rowClick` value is no longer read and is left where it is: it is a few bytes in one device's browser storage, never synced, and an older build open in another tab still reads it as before until it updates. No op field, user preference or server state is involved, so nothing has to stay additive and nothing is migrated.

**D5. `a` after a click.** No change to `list.add-subtask`: it already opens the add-under line of the selected row in every `TaskListView` list layout. It failed after a click only because the click had opened the inline editor and `a` was typed into it (and, under Open details with As a page, because the click had left the list for the page). With D1 a click leaves focus on the row's open control, so `a` reaches the list. Tests pin click-then-`a` in Today, a project and the Inbox, beside the side panel and with As a page. Typing `a` while the inline editor is open stays typing. A board has no add-under line, so `a` on a card returns `false` (unhandled) instead of setting an invisible line; that is the only code change for `a`.

**D6. Which lists.** The full rule (select, second click edits) applies where the inline editor exists: the list layout of every `TaskListView` list (Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels, places). The first-click rule (select, and show beside the list where it docks) also applies to board cards, the Filter view, saved views, Next and Waiting, so a click never opens a page in one list and selects in the next; there a second click does nothing, and Enter and the double-click open as today. Bringing the inline editor, `F2` and `a` to those lists is a follow-up. The calendar's Day, Week, Month and Plan, the timeline, dashboards, the review screens and Close the day keep their own clicks.

**D7. Pointer clicks only; assistive technology keeps opening.** The rule is for clicks that come from a mouse, trackpad or pen press on the row (`pointerdown` with `pointerType` `mouse` or `pen`, then `click` with `detail > 0`). Enter and Space on the open button (a click with `detail` 0), a screen reader's default action and a voice-control "click" that arrive without that press keep today's meaning: they open the task as Enter does. So a screen-reader user never lands in the editor by activating a task twice, and the row's open button keeps its accessible name (the title) and `aria-expanded` for the details; the cursor row stays `aria-current`. Nothing new is announced: selection is already focus.

**D8. Touch and narrow windows unchanged.** A tap on a coarse pointer, and a click below 768 px, open the task as today (its page, or the side panel or the Inbox's split from 1024 px). Phones have no inline editor and no keyboard to follow a selection with, and two taps to open would be a step back. The swipe, the grip and the touch hold are untouched.

**D9. A closed side panel.** Today a click on a task reopens a closed side panel (`task-side-panel` D4: an explicit open), while moving the cursor does not. The first click of D1 counts as that explicit open, so a user who chose the side panel still has a pointer path to it, and "Closed stays closed" still holds for `j`/`k`. Open question 3: the alternative (a click only selects while the panel is closed, Enter reopens it) is simpler to state but leaves only the keyboard to bring the panel back.

## Migration and messages

- People who chose **Open details**: a click now selects; Enter, a double-click or Open task opens. People who chose **Expand the row**: a click selects; → or Show details expands. People who kept the default **Edit in place**: a click on a title selects, a second click edits, as `F2`. The changelog fragment (`changelog.d/Changed/click-selects-title.md`) and `docs/settings-app.md` say this.
- Catalogues: "Click a task to", "Edit the title, open the details or expand the row. This device only." and "Expand the row" are removed; "Edit in place" stays as the `F2` label; "Open details" stays (the edit bar). The first-day sample note "Click a task to open its panel. …" becomes "Double-click a task to open it. …" in every catalogue; only new accounts get the new note, existing sample tasks are data and stay as written.

## Data model

None. No op field, entity, route or synced setting changes; the removed choice lived in browser storage only.

## Interface budget

One settings row fewer. No chrome row, task property, sidebar destination or scroll region is added, and no shortcut: `F2`, Enter and `a` keep their registry entries (the `F2` description adds "or click the title of the selected task").

## Size

No dependency. The select, its store and `clickExpands` go and a press record is added to `useRowClicks`: a small reduction of the first load; the budget in `web/bundle-budget.json` is not raised.
