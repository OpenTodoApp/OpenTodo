# Design

## Context

Personal entities that sync to the author's own devices already exist:
- `review`: the rhythm record;
- `user_prefs`;
- `place`: saved locations, a full entity with `name`, `position`, `created_at` and `deleted_at`, served by its own routes.

The scope resolver puts any entity without a project or task parent into the author's personal scope. `time-sectors` introduces the period format (`YYYY-Www`, `YYYY-MM`, `YYYY-Qn`), the viewer-relative This week rule and the Go and TS validator `internal/sector` / `web/src/lib/sectors.ts`, pinned by shared vectors. The Plan mode (`planner-view`) and the weekly review's Look ahead step (`weekly-review`) are where planning happens.

## Decisions

**D1. A small personal entity, not fields on `review`.**

`objective` has these fields:

| Field | Kind | Default | Notes |
|---|---|---|---|
| `title` | string, 1–140 characters after trimming, one line | `""` | **Content** (E2EE). Ciphertext is accepted in place of the text |
| `period` | string | `""` | `YYYY-Qn` or `YYYY-Www` only, validated with the `internal/sector` validator. Months are refused |
| `position` | number | `0` | Order within its period |
| `done_at` | number | `0` | Unix ms, `0` = open |
| `created_at` | number | `0` | |
| `deleted_at` | nullable number | `null` | Tombstone |

- Each field converges by its own last-writer-wins.
- Alternative: JSON lists `quarter_objectives` and `week_objectives` on `review`. Rejected. Concurrent edits of one list lose items under field LWW, the content would be one blob (unusable for per-item done), and history would be lost on every edit.
- Alternative: a task flag "objective". Rejected. It would mix objectives into every task view and count, which is the opposite of "small cards".

**D2. Limits keep it small.**
- At most 5 open (not done, not deleted) objectives per period.
- The client hides Add at the limit and says "Five is plenty. Finish or drop one first."
- REST POST, and PATCH of `period` into a full period, answer `409 too_many_objectives`.
- Sync can't refuse convergently: two offline devices may each add a fifth. Every device then shows all of them, Add stays hidden until there are fewer than 5, and nothing is deleted automatically.
- Titles over 140 characters are refused by validation. The input counts down from 20 characters left.

**D3. The Plan strip.**
- Above the Plan's columns, inside the content scroller (not chrome), the strip has a disclosure heading "Objectives". Below it:
  - Left: the "Q4 2026" cards, this quarter's objectives.
  - Right: the "Week 44" cards, the viewer's This week (rule from `time-sectors`), and Next week's when the Plan's span starts in next week.
- Cards are one line: a checkbox, the title (ellipsis, with the full text in its accessible name and tooltip) and an edit-on-Enter behaviour. Each group ends with "+ Add" while under the limit.
- Reordering is done by drag or with Alt+Up/Down on a focused card, writing `position`.
- Collapsed or expanded is remembered per device, never synced. It's expanded the first time.
- **Phone** (<640 px): one line, "Q4: 3 · This week: 2", that opens a sheet with the same groups.
- **Keyboard:** Tab reaches the strip before the columns. Enter edits, Space toggles done and Delete asks before dropping. Escape leaves editing.
- Alternative: a page of its own. Rejected. A separate place is exactly the detached database.

**D4. The weekly review section.**
- In Look ahead, above the next seven days:
  1. This quarter's objectives, read-only, for reference.
  2. "Objectives for this week" or "Objectives for next week", with Add and edit. The review plans next week when it's opened Friday to Sunday in the viewer's local week, and this week otherwise. A "Plan this week instead" toggle flips it.
  3. Last week's open weekly objectives (when the planned week is this week) or this week's (when it's next week). Each offers **Carry** (writes `period` to the planned week), **Done** and **Drop** (tombstone).
- In the first review whose date falls in a new quarter, last quarter's open quarterly objectives get the same actions, carrying to the current quarter.
- Every action is one undoable batch, applied locally first. The section never changes whether the step is done, so the seven steps and their counts stay as they are.

**D5. Carry-over is explicit.** Objectives of a past period are never moved by themselves. They simply aren't shown in the strip and are offered once in the review. That follows the anti-roadmap: no change without approval.

**D6. Encryption.**
- `objective.title` joins `internal/e2ee.ContentFields` and `CONTENT_FIELDS`. Everything else is plaintext, like the review record's times.
- The migration of existing data at enablement includes objectives (the re-write job reads incrementally).
- REST returns ciphertext.
- The MCP `list_objectives` returns `title` through an opted-in relay device when available, and otherwise `title: null, encrypted: true`.
- The CLI decrypts only with `ot encryption` support (`internal/e2ee/crypt`). Without it, it prints `[encrypted]`.

**D7. Interfaces.**
- **REST:** add `objectives` to `sync.Plural`, giving `GET/POST /api/v1/objectives` and `GET/PATCH/DELETE /api/v1/objectives/{id}` on the existing routes with the `signedIn` policy.
  - Writes go through `ApplyStrict` and `NotifyApplied` like other collections.
  - `read` tokens may list. `agent` tokens are refused on these writes, as on every collection write.
  - Another user's id is 404.
  - The list accepts `period=<period>` and `open=true`.
  - Validation errors are `400 invalid_input`, and the limit is `409 too_many_objectives` (a new error code in the error-code fixture and its message).
  - Demo: not denied. The visitor's sandbox is personal.
- **CLI:**
  - `ot objectives [--quarter|--week] [--period <p>] [--json]` lists.
  - `ot objectives add "<title>" --quarter|--week [--next]` adds to the current or next period, resolved with Monday weeks.
  - `ot objectives done|undone|edit|delete <id>`.
- **MCP:** a read tool `list_objectives` (`period` optional, current quarter and week by default, in the user's time zone) and the resource `opentodo://objectives`. Titles are inside the untrusted-text marking. No write tool.
- **Export:** an `objectives` array, tombstones included. The own-export importer restores them through ops with device `import`.
- **Activity:** none. Objectives are personal and derive no activity event, like `review`.

**D8. Progressive disclosure.**
- `user_prefs.objectives`: `""` means off, `"on"` means on, and an unknown value reads as off and is kept.
- The switch is in Settings → Account → How you work, below the three choices: "Objectives: pin up to five quarterly and weekly objectives in Plan and the weekly review". Off by default for every choice.
- Off: no strip, no review section. Objectives remain in the export, REST, CLI and MCP.

**D9. Interface budget** (`docs/interface-guide.md`).
- **Chrome:** the strip is inside the Plan's content scroller, not chrome, so the Plan keeps at most 2 chrome rows above its first column.
- **Scroll regions:** none added. The strip scrolls with the content, and the phone sheet replaces the page while open.
- **Task properties:** unchanged.
- **Sidebar:** no new destination.
- **Shortcuts:** none added. Alt+Up/Down and Enter/Space follow the existing list conventions inside the strip, with no conflict in the registry.
- **Review:** the section sits in an existing step, so the step count and the progress indicator are unchanged.

## Data model impact

| Entity | Field | Kind | Default | Content |
|---|---|---|---|---|
| objective | `title` | string ≤140 | `""` | yes |
| objective | `period` | string (quarter or week) | `""` | no |
| objective | `position` | number | `0` | no |
| objective | `done_at` | number | `0` | no |
| objective | `created_at` | number | `0` | no |
| objective | `deleted_at` | nullable number | `null` | no |
| user_prefs | `objectives` | string | `""` | no |

There's one migration for the materialized `objectives` table (`internal/store/migrations/NNNN_objectives.sql`), and nothing is renamed. An older server refuses the unknown entity's ops while devices keep their local rows (existing behaviour for unknown entities).

## Risks and trade-offs

- **Scope creep toward OKRs.** The design rejects links and progress. The proposal says so, so a later change has to argue against it.
- **Week numbers.** The strip shows "This week" and the dates, and uses ISO numbers only for later periods.
- **Size:** about 3 KB gzip in lazy chunks. Container and memory effect is negligible.

## Open questions

- Should objectives belong to a workspace, so Work and Personal each have their own? Proposed: no, they're account-wide for now. One person has one quarter. Revisit if workspace users ask.
