# Proposal

## Why

Cal Newport's multi-scale planning, the most-cited method in the research (§2.1, Phase 4 item 1), cascades from a few **quarterly** objectives, to a **weekly** plan written each Monday from them, to the day's time blocks. The weekly plan stays in sight while the day is built. The research reports the recurring complaint that it's "easy to lose sight of quarterly and weekly priorities when staring at a daily task list". Newport's followers build their own Notion and Obsidian templates and web prototypes ("FocusOS") to get those three layers together. OpenTodo has the day (Plan, time blocking, the Daily check) and the week (the weekly review), but no place to write what the quarter and the week are *for*.

The research is equally clear about what not to build (§5). Todoist retired "Goals (Beta)" in 2026 because people disliked maintaining an OKR module detached from their tasks. The anti-roadmap says: no detached goals database. Objectives must be a handful of short lines pinned where planning happens, and nothing more.

## What Changes

- **Objectives.** A new personal entity `objective`: a short title, a period (a quarter `2026-Q4` or an ISO week `2026-W44`, the period format of `time-sectors`), a position and a done time.
  - It syncs to the user's own devices only, works offline and converges per field by last-writer-wins.
  - Its title is end-to-end encrypted like every other user-written text.
  - It's in the JSON export.
- **Small by design.**
  - At most **5** open objectives per quarter and **5** per week. The Add control hides at the limit, and REST refuses a sixth.
  - Titles up to 140 characters, one line.
  - No progress percentages, key results, linked tasks, owners, charts or history view.
  - A done objective stays visible, struck through, until its period ends.
- **Pinned in Plan.** The calendar's Plan mode shows a compact **Objectives** strip above its columns: this quarter's cards, then this week's, with inline add, edit, done and reorder. The strip collapses per device. On a phone it's one summary line that opens a sheet.
- **In the weekly review.** The Look ahead step gains an Objectives section:
  - This quarter's objectives are shown for reference.
  - The week being planned (this week, or next week from Friday to Sunday) can get its objectives written right there.
  - Last week's unfinished weekly objectives offer Carry, Done or Drop.
  
  In the first review of a new quarter, last quarter's open objectives offer the same three actions.
- **Progressive disclosure.** Off by default. A new **Objectives** switch in Settings → Account → How you work (user preference `objectives`). With it off, Simple-list users see nothing new. Turning it off hides the strip and the section, and keeps every objective.
- **API, CLI and MCP.**
  - REST gains an `objectives` collection on the existing collection routes, signed-in, personal scope only.
  - The CLI gains `ot objectives` (list, add, done, edit, delete).
  - The MCP server gains a read-only `list_objectives` tool and an `opentodo://objectives` resource.
  
  Write tools for assistants aren't in this change.

No new environment variable, no new dependency, not **BREAKING**: one new entity and one user preference field, both additive.

## Out of scope

- **Linking tasks or projects to an objective,** objective progress, key results or scores. That's the detached goals database the research warns against. Revisit only on evidence.
- **Yearly or monthly objectives, and life areas or roles.** The quarter-to-week cascade is the method. A "season" is a quarter.
- **Objectives in Today, Week or Day, the Daily check, Close the day or the display mode.** Plan and the weekly review only, for now.
- **Shared objectives** for a workspace or project, and MCP write tools for objectives.
- **Reminders or notifications** about objectives.

## Roadmap

Advances 0.21 "Horizons and home", item `plan-objectives` in the 1.0 roadmap (research Phase 4 item 1, gap analysis P4.1 "Pinned quarterly & weekly objectives cards"). It reuses the period format and the validator of `time-sectors` and lands after it, or brings the validator with it if it lands first. It respects the anti-roadmap's "No detached goals database".

## Capabilities

### New Capabilities

- `plan-objectives`: the objective entity, its limits, the Plan strip, carry-over at period ends, and the How you work switch.

### Modified Capabilities

- `weekly-review`: an Objectives section in Look ahead (added requirement).
- `end-to-end-encryption`: objective titles are content (added requirement).
- `http-api`: the `objectives` collection (added requirement).
- `mcp-server`: `list_objectives` and the resource (added requirement).
- `cli-client`: `ot objectives` (added requirement).

## Impact

- **Data model and sync:** new entity `objective` with the fields:
  - `title` (string, content);
  - `period`;
  - `position`;
  - `done_at`;
  - `created_at`;
  - `deleted_at`.

  It resolves to the author's personal scope like `place` and `review`. The user_prefs field `objectives` is added too. All of it goes in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, the defaults in `web/src/lib/ops.ts`, and the `Plural` map (`objectives`). A materialized table migration is needed.
- **E2EE:** `objective.title` is added to `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`. The MCP read degrades to `title: null, encrypted: true` unless an opted-in device answers through the relay.
- **API:** existing `/api/v1/{collection}` routes and their `signedIn` policy. There's a new row in the route matrix test, and the demo isn't denied (sandboxed personal data).
- **Export and import:** `objectives` in the export, restored by the own-export importer.
- **Size:** about 3 KB gzip of client code in the lazily loaded Calendar and Review chunks. No dependency, no measurable effect on image size or memory.
