# Design

## Context

Today the order of a project's steps only matters in one place: `MethodRules.nextActionOf` (`web/src/lib/method/rules.ts`) takes the first actionable task in list order. Its Go port `WithoutNextAction` (`internal/digest/stats.go`) is pinned by `internal/digest/testdata/next_action_fixture.json`. Explicit dependencies (`blocked_by`) are derived into a blocked state by `web/src/lib/dependencies.ts`, and on the server by `snapshot.blockedNow` in `internal/agenttools`. The filter keyword `blocked` is evaluated on the client and validated by `internal/filter`. Project fields are written by admins and owners of a shared project. Section fields are written by those who may rename a section. Sync checks a field's kind, never an enumeration (see `user_prefs`).

## Goals / Non-Goals

**Goals:**
- One derived "available" rule, pure and shared by TS and Go, that every view, filter and tool asks.
- Sequential flow at two levels (project and section), with no stored blocking and no write when a step is completed.
- Areas that silence the "finite project" signals (progress, without a next action, Quiet) and nothing else.

**Non-Goals:**
- Sequential subtasks, notifications when a sequence advances, and changes to counts.
- A hard lock: a waiting step stays completable, as blocked tasks are.

## Decisions

### D1: One enum field per container, not a boolean plus a type

`project.flow_mode` takes `parallel`, `sequential` or `area`, and `section.flow_mode` takes `""`, `parallel` or `sequential`. Both are `kString` with default `""`, so the change is additive (AGENTS rule 3). A server that predates the field refuses the op as unknown and the device keeps its local value until the server is upgraded, the existing behaviour for every new field. Sync does not check the set; REST and the agent tools do, and clients read unknown values as the default. This is the `user_prefs` convention, so a later value such as `checklist` stays additive.

Alternatives considered:
- `sequential: bool` plus `is_area: bool`. Two fields can contradict each other, and both converge independently.
- A separate `project.kind` for area. Area and sequential are mutually exclusive for availability, so one field is simpler.
- `area` on sections. A section is always part of a finite project, so it would mean nothing.

### D2: Availability is derived, never stored as blocked_by edges

Alternatives considered:
- **Writing implicit `blocked_by` edges** when a project becomes sequential. That writes N ops on a toggle and races with reorders on other devices. It needs repair when tasks move, and it pollutes the user's own dependencies.
- **A stored `available` flag.** It would go stale offline.

Deriving from the manual order makes reorder and completion converge for free: every device computes from the same rows (spec "Concurrent reorder and completion").

### D3: Steps are top-level tasks without a section, then sections

A sequential project's steps follow the list order the next action already uses: tasks without a section first, then sections in position order. A section is one step in a sequential project. Inside the current step, a parallel section offers all its tasks and a sequential (or following) section offers one at a time. This gives OmniFocus's "action groups" without a new entity. In a parallel project or an area, only Sequential sections constrain.

Alternative considered: treating every task in a sequential project as one flat step, ignoring sections. That is simpler, but then a "Prepare" phase with three parallel tasks cannot be expressed, and that is the most common reason people group steps.

### D4: What holds a sequence, what is skipped

| Task state | In a sequence |
| --- | --- |
| deferred | holds |
| explicitly blocked | holds |
| assigned to someone else | holds |
| recurring task or habit | skipped |
| parked in Someday | skipped |
| completed or deleted | neither holds nor waits |

- **Holds:** the current step is still the current step, it is just not doable yet. This matches OmniFocus and keeps "Waiting for Ana" honest.
- **Skipped, recurring tasks and habits:** a series is never completed, so it would hold the project forever.
- **Skipped, Someday:** the person parked the step on purpose. Holding the sequence on it would silently freeze the project.

The shared vectors pin each row of this table.

### D5: The shared rule lives in a leaf package and a pure module

- `web/src/lib/flow.ts` exports `availability(input)`. It returns, per task, `available`, `waitsInSequence` and the id of the holding step (for the marker). `MethodRules.actionable` uses it in place of its blocked, start and Someday checks.
- `internal/flow` is a leaf Go package with the same function over `opsync.Entity` rows. `internal/agenttools` (`list_tasks available`, the project resources), `internal/digest` (`WithoutNextAction`, Areas) and the CLI use it.
- Both read `internal/flow/testdata/flow_fixture.json`, and the next-action fixture gains sequential and area cases.

Logical today comes from the caller. This is the same pattern as `internal/inbox`, `internal/recurrence` and `internal/timetrack`.

Alternative considered: computing availability only on the client. That would leave the agent tools and MCP saying a later step is doable while the app says it waits, which breaks the rule in the anti-roadmap that every feature works through the API, CLI and MCP.

### D6: Shown like blocked, but named differently

A waiting step reuses the blocked row treatment: dimmed, in place, with a marker in the same slot. Today puts it in the existing collapsed Blocked group. No new group, chrome row or count is added. The marker reads "After *step*" rather than a lock, because nothing was explicitly linked. `blocked` in filters keeps its exact meaning, and the new `available` keyword covers "what can I do now". A task that is both blocked and waiting shows the blocked marker, since the explicit link is the more specific reason.

### D7: Progressive disclosure and permissions

The "Flow…" submenu sits in the project and section menus, using the `submenu` item from `action-menus`.
- **`lists` mode:** hidden, unless the stored flow is not the default. A Simple-list user who never chose a flow sees nothing new, and one who received a sequential shared project can still see why rows dim and turn it back if allowed.
- **Command palette:** offers the item in every mode.
- **Shared projects:** the project flow follows the existing project-field rule (owner and admins), the section flow follows the section rule (editors). Viewers see no item.
- **Settings:** nothing is added.

Interface budget:
- No chrome row, sidebar destination, scroll region or shortcut is added.
- The marker replaces the blocked marker's slot, so the seven-property limit holds.
- On a 360 px phone the marker truncates the step's title.

### D8: Vault and CalDAV

The vault already writes `opentodo-color` and `opentodo-icon` on project files. `opentodo-flow` follows the same per-key merge, and Parallel is left out so existing files do not change. Sections are headings in the vault with no frontmatter, so their flow is not carried and the three-way merge leaves the field alone. CalDAV maps projects to calendars and has no ordering semantics, so nothing is mapped. A CalDAV client sees every task, as it does with blocked tasks today.

## Data model, size and budget

- **Fields:** `project.flow_mode` and `section.flow_mode` are added to `Schema` in `internal/sync/ops.go`, with a comment that becomes their client doc. The generated `web/src/generated/opSchema.ts`, the contract fixture and the row defaults follow through `UPDATE_OP_SCHEMA=1`.
- **E2EE:** neither field is a content field. No migration: rows without the field read as the default.
- **Activity:** a change of either field is shown in project history as a field change. No new activity kind; the activity fixture gains one line if `internal/activity` lists project fields explicitly.
- **Size:** no dependency, so no change to the image or memory. The web bundle grows by about 3 kB for the module and the submenus.

## Risks / Trade-offs

- [Users expect a waiting step to be hidden, not dimmed] → Dimming keeps the project's shape visible and matches blocked tasks. A later display option could hide waiting steps if people ask.
- [Sort by due in a sequential project makes the order look wrong] → The marker names the step being waited for, and the order used is always the manual one (spec "Waiting in sequence").
- [Older clients show every step as doable] → Same degradation as any new field: they keep the value unchanged, and the next upgrade shows the sequence.
- [Rule drift between Go and TS] → One fixture read by both test suites, as for the next-action rule.

## Migration Plan

Additive fields, no backfill. Rolling back the web app leaves the stored values in place, unused.

## Open Questions

- Resolved (owner decision, 0.17): a top-level Area without sub-projects is also listed in the Monthly look's "Areas" step, reading "Area" (weekly-review "Monthly look", modified by this change).
