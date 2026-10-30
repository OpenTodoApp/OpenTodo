# Design

## D1. A style of the existing focus, not a second focus

Bento changes how today's focus is chosen and listed; it does not add a second list. The focus keeps its rules from `weekly-review` "Daily check": at most three tasks, the logical today, completed or deleted tasks dropping out without a write, personal to the user. Alternative considered: a separate "Bento" card on Today. Rejected: two "what matters today" lists compete, and the Loop home, the Focus screen and the Daily check already read the one focus.

## D2. Sizes from the estimate

The research gives Large 90+ minutes, Medium 45–60 and Small 15–30. The gaps must be closed so every estimate has a size: **Small ≤ 30**, **Medium 31–89**, **Large ≥ 90**. One pure function `bentoSize(estimate_minutes)` in `web/src/lib/bento.ts`; no Go twin is needed because the server never computes the focus. The size is only a suggestion: the slot a person chooses wins, so a 45-minute task can be the day's Large when it is the hard one. Alternative: let users set the thresholds. Rejected for now: three numbers in Settings for a method that names its own sizes.

## D3. Storage: `focus` stays, `focus_slots` beside it

`review.focus` stays the plain comma-separated id list that clients from before this change read, written in Bento's display order, so an older device shows the same three tasks. A new additive field `review.focus_slots` holds `L:<id>,M:<id>,S:<id>` (any subset, in any order), always written in the same batch as `focus` and `focus_date`.

Reading is deterministic and writes nothing: an entry of `focus_slots` counts only when its id is in `focus` (and `focus_date` is today); an id in `focus` without an entry takes the slot its estimate suggests when free, else the first free slot in Frog order, else it is listed after the slots as "Not sized". So a concurrent write that leaves the two fields out of step (both are last-writer-wins per field, and an older client writes only `focus`) still shows every focused task, and the next Bento write puts them back in step.

Alternatives considered: a size list parallel to `focus` (`L,M,S`) — breaks silently when an older client reorders `focus`; replacing `focus` with the slotted form — older clients would show nothing.

## D4. Preferences and progressive disclosure

- `user_prefs.focus_style`: `bento`, or empty/unknown for Three tasks.
- `user_prefs.bento_order`: `summit`, or empty/unknown for Frog.

Both synced, additive, last-writer-wins, never rewritten when unknown, no activity event. They live in **Settings › Account › How you work** as a **Daily focus** row (Three tasks / Bento) and, only while Bento is chosen, an **Order** row (Frog: Large first / Summit: Medium first). The Daily check's header overflow menu offers the same two choices, so a person can switch where they use it. Defaults are today's behaviour, so Simple-list users, and everyone who never opens these rows, see nothing new.

## D5. Picking with `f`

In Bento the today's-tasks part of the Daily check shows three slot rows above the list (empty slots read "Large · 90 min or more" in the faint tone).
- `f` on a task already focused removes it from its slot.
- `f` on an estimated task puts it in its suggested slot if free; if taken, a message names the occupant ("Large holds Write the report") with **Choose a slot**.
- `f` on an unestimated task, or **Choose a slot**, opens a menu (a bottom sheet on a phone) listing the free slots and **Set estimate…**, which opens the estimate control and then places the task by its new estimate. Choosing a slot writes only the review row.
- Each change is one batch on the review row (`focus`, `focus_slots`, `focus_date`) with Undo.
The three-task cap message of Three tasks style becomes "Every slot is full" in Bento.

## D6. Order everywhere the focus is listed

Frog lists Large, Medium, Small; Summit lists Medium, Large, Small; "Not sized" entries follow. The order applies to the Daily check's slot rows, the Loop home's Today's focus and the Focus screen's first task (`web-app`: `g` then `Shift+F` opens the Focus screen on the first task of today's focus). In Three tasks style the order is the one chosen, as today.

## D7. Shared projects, viewers, encrypted accounts, offline

The focus is personal: a task from a shared project can be in the user's slot, also as a viewer, because nothing is written to the task. "Set estimate…" is offered only when the user may edit the task. On an encrypted account nothing changes: ids and fixed words are not content. Offline, every write is an op on the personal review row and converges by last-writer-wins per field, with D3 reconciling.

## D8. Interface budget

The slot rows are part of the Daily check's content (a page, not a list with quick add), so no chrome row is added; no task property, sidebar destination or scroll region is added; `f` keeps its meaning and no new shortcut is registered. On a phone the slot rows are full-width 44 px rows and the slot menu is a bottom sheet.
