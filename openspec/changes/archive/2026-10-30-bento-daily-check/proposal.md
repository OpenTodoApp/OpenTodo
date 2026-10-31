# Bento in the Daily check

## Why

Today's focus holds up to three tasks of any size, so it is easy to pick three two-hour tasks and finish none. The research (`roadmap/research.txt`, §2.4 Francesco D'Alessio, "The Bento Method") describes a cure for "the 20-task daily list trap": one Large task (90+ minutes), one Medium (45–60) and one Small (15–30), sequenced by energy as **Eat That Frog** (Large → Medium → Small) or **Climb The Summit** (Medium → Large → Small). It notes that OpenTodo already has estimates and a Daily check that "picks up to three things to focus on today", so an optional Bento mode is a small step (roadmap P2.1).

## What Changes

- The Daily check gains a **focus style**: **Three tasks** (default, today's behaviour, unchanged) or **Bento**.
- In Bento, today's focus is three named slots, **Large**, **Medium** and **Small**. `f` on a task with an estimate puts it in the slot its estimate suggests (Small up to 30 minutes, Medium 31 to 89, Large 90 or more); if that slot is taken, the message names the task in it and offers **Choose a slot**. `f` on a task without an estimate opens a small menu with the free slots and **Set estimate…**. Any task can be put in any free slot from that menu; a slot is a choice, never a task edit.
- A **Bento order**, **Frog** (L → M → S, default) or **Summit** (M → L → S), sets the order in which the focus is listed in the Daily check, on the Loop home and wherever today's focus is listed, and which task the Focus screen opens on.
- Both choices are synced account preferences: `user_prefs.focus_style` and `user_prefs.bento_order`, set in **Settings › Account › How you work** (a "Daily focus" row; the order row shows only with Bento) and from the Daily check's header menu.
- The slots are stored on the personal `review` row as a new additive field `focus_slots` (`L:<id>,M:<id>,S:<id>`), written in the same batch as the existing `focus`, which stays the plain id list, so older clients still show the three tasks.

Not **BREAKING**: two additive preferences and one additive review field; no route, no environment variable, no migration.

Out of scope: picking the Bento automatically, coupling with the energy property of `task-energy` (Bento reads estimates only; a person can still use an `energy:` filter as the Daily check's source of candidates later), a third order ("Small first"), a Bento count in Statistics, Bento on the CLI or MCP (the focus has no API today), and a Today limit (that is `today-closed-list`).

ROADMAP: milestone 0.18 "The mindful daily planner", item `bento-daily-check`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `weekly-review`: ADDED "Focus style", "Bento slots" and "Bento order" beside the existing "Daily check", which is not modified.

## Impact

- Data model and sync: `internal/sync/ops.go` `Schema` gains `review.focus_slots` (string) and `user_prefs.focus_style`, `user_prefs.bento_order` (strings); `internal/sync/testdata/schema_fixture.json`; `web/src/lib/types.ts`; defaults in `web/src/lib/ops.ts`. Personal scope like the rest of `review` and `user_prefs`: synced to the user's own devices only.
- E2EE: none. Ids and fixed words, never user-written text; not in `e2ee.ContentFields` or `CONTENT_FIELDS`.
- API, CLI, MCP: none (the focus is not exposed today; the export carries the new fields with the `review` and `user_prefs` rows). Route matrix unchanged. CalDAV and the vault do not carry the focus.
- UI: the Daily check (`web/src/app/review/…`), the Loop home's Today's focus, the Focus screen's first task, How you work in Settings, `web/src/lib/settingsCopy.ts`; strings in six languages.
- Size: no dependency; under 2 kB gzip to the review chunk.
