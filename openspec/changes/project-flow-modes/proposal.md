# Proposal

## Why

A project with ten ordered steps shows all ten everywhere today: in the project, in filters, in Today when they carry dates, and the Next view already picks only the first actionable one per project but nothing else knows the order. Getting "only the step I can do now" means linking nine `blocked_by` edges by hand. The research calls sequential projects and sections "one of the most requested GTD features across all cross-platform apps" (§2.3 Allen; OmniFocus's Sequential vs Parallel modes, §1), and it asks for Forte's and Things' **Areas**: ongoing lists such as Home or Finances that never finish, so they should not show a progress ring or be flagged "without a next action" every week (§2.6 Forte; Phase 1.1).

This change also names the one shared rule later changes build on: whether a task is **available** (doable now). `today-closed-list` and `time-sectors` reuse it.

## What Changes

- **A flow for each project.** A project has a flow:
  - **Parallel**: today's behaviour and the default.
  - **Sequential**: only the first open step in the project's manual order is available, and the following steps wait until it is completed.
  - **Area**: an ongoing list of single actions. It shows no progress ring, is never listed as without a next action, and is never marked Quiet.

  The flow is an additive synced field, `project.flow_mode`.
- **A flow for each section.** A section can follow its project (the default), or be Parallel or Sequential. The field is `section.flow_mode`. In a sequential project each section is one step, so its tasks become available together (Parallel) or one by one (Sequential). In a parallel project or an area, a Sequential section offers only its first open task.
- **Available task, defined once.** A task is available when it is live and open, not blocked by an open task, not waiting in sequence, not parked in Someday and not deferred to a later start. Subtasks follow their top-level task. The web app and the server compute it from the same rules, pinned by shared test vectors (`internal/flow` and `web/src/lib/flow.ts`). Method-views' "actionable" becomes "available, plus the existing project, top-level and assignee conditions".
- **What the person sees.** A task waiting in sequence stays in its place, dimmed, with a quiet "After *previous step*" marker in the same slot as the blocked marker. Completing the current step makes the next one available at once, offline too. Today puts tasks that wait in sequence and are due today into its existing collapsed Blocked group.
- **Areas.** An area shows no progress ring or percentage in All projects, gets no "Quiet" health word, and is never "without a next action" in the weekly review, the Loop home or the weekly email digest. Tasks in an area are available like those in a parallel project.
- **Filter keyword `available`.** It matches available tasks. `blocked` keeps meaning explicit dependencies.
- **Setting it.**
  - Projects: a "Flow…" submenu in the project menu (sidebar and page header).
  - Sections: a "Flow…" submenu in the section heading or column menu.
  - Under Simple lists the item appears only on a project or section that already has a flow other than the default, so it can be turned back. The command palette offers it in every mode.
  - In a shared project, only those who may change the project's fields may change its flow.
- **API, CLI, MCP and vault.**
  - REST: `flow_mode` on projects and sections, with a closed set of values checked.
  - Agent tools and MCP: `create_project`, `update_project` and the section tools accept `flow_mode`. Project output carries it, and `list_tasks` gains an `available` filter.
  - CLI: `ot tasks --available` and `ot projects` show it.
  - Vault: a project file carries `opentodo-flow` in its frontmatter.

Out of scope:
- Notifying the assignee when a sequence moves on (the dependency "Unblocked notification" stays for explicit blockers only).
- Sequential subtasks (a task's own checklist order).
- Changing sidebar or Today counts: they keep counting open tasks.
- Project serialization (on-hold projects).
- Time horizons.
- CalDAV: projects map to calendars, and VTODO has no ordering semantics.

Advances ROADMAP-1.0 milestone 0.17 "Calm constraints", item `project-flow-modes`; prerequisite of `today-closed-list` and `time-sectors`. No new environment variable; no breaking change to the op log.

## Capabilities

### New Capabilities

- `project-flow`: the flow of projects and sections (Parallel, Sequential, Area), the derived available state and waiting in sequence, how they are shown and chosen, and how they reach the API, the agent tools, the CLI and the vault.

### Modified Capabilities

- `method-views`: "Actionable tasks and a project's next action" is defined through available tasks. A new requirement keeps areas out of "without a next action".
- `filter-queries`: a new `available` term.
- `statistics`: a new requirement for areas in project health (no progress, no Quiet).

## Impact

- **Data model and sync:**
  - New fields `project.flow_mode` and `section.flow_mode`. Both are strings, default `""`, converge by last-writer-wins and are written as ordinary ops.
  - Unknown values read as the default, and clients keep the stored value.
  - They are added to `internal/sync/ops.go` `Schema`; the generated `web/src/generated/opSchema.ts` and the row defaults follow.
  - Nothing is stored for availability: it is derived.
- **E2EE:** not user-written text, so neither field is a content field. Availability is computed from structure fields that stay in clear.
- **Server:** a new leaf package `internal/flow` (Go twin of `web/src/lib/flow.ts`) used by `internal/agenttools`, `internal/mcp` resources, `internal/digest` (WithoutNextAction) and the CLI. Shared vectors live in `internal/flow/testdata/flow_fixture.json`, and the next-action fixture is extended with sequential and area cases.
- **API:**
  - The `projects` and `sections` collections accept and return `flow_mode` (`400 invalid_input` for a value outside the set).
  - Agent tools and MCP: the project and section tools take the field, and `list_tasks` takes `available`.
  - CLI: `--available`.
  - Docs: `docs/api.md`, `docs/mcp.md`, `docs/filters.md`, `docs/vault.md` and a new section in `docs/all-projects.md` or the project docs.
- **Vault:** an `opentodo-flow` frontmatter key on project files; sections are not mapped (they stay as they are).
- **CalDAV:** unchanged.
- **Size:** no dependency. The web bundle grows by a few kB (one pure module and two submenus); the binary is negligible.
