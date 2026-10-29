# Proposal

## Why

The weekly review's project walk shows every project, every week. With thirty projects, a low-burn one ("Car", "Taxes 2027") costs as much attention as an active sprint, and the walk gets skipped. OmniFocus gives each project its own review interval and surfaces only those whose review date has arrived. The research lists this among the three capabilities "that separate a full GTD engine from a standard tag-and-list app" (§2.3 Allen; Phase 1.4).

Burkeman's "strategic underachievement" asks for the opposite signal too. During a demanding season you deliberately do the bare minimum on some projects, and the app should stop calling them Overdue, Quiet or stalled (§2.2 Burkeman). Today project health always grades every project (statistics "Project health").

## What Changes

- **Review every…, per person and per project.** Each user can give a project an interval: every week (the default), every 2 weeks, every month, every quarter, or paused. It is a personal preference next to the existing personal review stamp (`project_prefs.review_every`), so members of a shared project each keep their own rhythm.
- **The walk shows only what is due.**
  - A project is due for review when it was never reviewed, or when its interval has passed since the user's last review of it, counted in the user's logical days.
  - The walk lists due projects only.
  - After the last card, the summary says how many projects are not due yet or paused, and "Review them too" adds them to this walk.
  - The Projects step is done when no project in the walk is due and none is without a next action.
  - The card shows the interval, and the `e` key changes it.
- **Maintenance status, shared per project.** A project can be put "In maintenance" (`project.status = "maintenance"`), a shared project field because health describes the project, not the person. While a project is in maintenance:
  - Its health reads "Maintenance" in place of Overdue and Quiet. Late (a deadline passed) still shows, because a deadline is a promise to someone else.
  - It is never marked stalled and never listed as without a next action, in the walk, on the Loop home or in the weekly digest.
  - It still shows its progress, and its tasks still appear in Today and every list as usual.
- **Where it's set.**
  - Review interval: a "Review every…" submenu in the project menu, and the walk card.
  - Maintenance: a "Put in maintenance" / "End maintenance" item in the project menu, the All projects row menu, and the `m` key on the walk card where the user may change the project.
  - Under Simple lists the menu items appear only once a non-default value is stored. The walk card offers both in every mode, since the walk is something the user opened.
- **API and tools.**
  - REST: projects accept and return `status` (`active` or `maintenance`).
  - Agent tools and MCP: `update_project` accepts `status`, and project output carries it.
  - CLI: `ot projects` shows it.
  - Vault: project files carry `opentodo-status: maintenance`.
  - The review interval is personal, has no REST collection and stays out of the agent tools.

Out of scope:
- Project serialization (an "on hold" status; the `status` field leaves room for it as a later value).
- Custom intervals in days.
- Review reminders or notifications.
- Changing the weekly review's own rhythm marker.
- Areas (`project-flow-modes`).

Advances ROADMAP-1.0 milestone 0.17 "Calm constraints", item `project-review-cadence`. No new environment variable; no breaking change to the op log.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `weekly-review`: "Review steps" (when the Projects step is done) and "Project walk" (only due projects, the interval on the card, `e` and `m`) are modified. A new requirement "Review interval per project" adds the personal interval and the due rule.
- `project-organization`: a new requirement "Maintenance status" (the shared field, where it is set, who may set it).
- `statistics`: a new requirement "Maintenance in project health".
- `method-views`: a new requirement "Maintenance projects are not flagged" (never stalled, never without a next action).

## Impact

- **Data model and sync:**
  - `project_prefs.review_every` is a string, default `""` (reads as weekly), personal scope like `reviewed_at`.
  - `project.status` is a string, default `""` (reads as active), shared with the project's members.
  - Both are additive, written as ops and converge by last-writer-wins. Unknown values read as the default and are kept.
- **E2EE:** neither field is user-written text, so neither is a content field.
- **Server:**
  - `internal/digest`'s `WithoutNextAction` skips maintenance projects, with cases added to `internal/digest/testdata/next_action_fixture.json`.
  - REST validation of `status`, the agent tools' `update_project`, and project output.
- **Web:**
  - `web/src/lib/review.ts`: the due rule and the walk queue.
  - `web/src/lib/projectHealth.ts` and `web/src/lib/method/rules.ts` take the maintenance exemptions.
  - The walk card, the project menu and the All projects row menu change, with strings in six languages.
- **Docs:** `docs/review-and-statistics.md`, `docs/all-projects.md`, `docs/api.md`, `docs/mcp.md` and `docs/vault.md`.
- **Size:** no dependency. A few kB of web bundle, negligible binary.
