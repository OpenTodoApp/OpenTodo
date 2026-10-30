# Design

## Context

- **The walk:** `walkProjects` in `web/src/lib/review.ts` puts every working project in the walk, ordered by `project_prefs.reviewed_at`. A project counts as freshly reviewed for seven days.
- **The stamp:** `project_prefs` is personal: it always resolves to the author's own scope, even for a shared project.
- **Health:** `web/src/lib/projectHealth.ts` grades every project with the first rule that holds: Late, Overdue, Quiet, On track.
- **Next actions:** `MethodRules` decides stalled and without a next action. The digest's Go port `WithoutNextAction` is pinned by `internal/digest/testdata/next_action_fixture.json`.
- **Field changes:** project fields other than the note are written by owners and admins of a shared project.

## Goals / Non-Goals

**Goals:**
- A walk that shows only what needs looking at, with a rhythm each person sets.
- One switch that tells every member "this project is deliberately on low burn" and stops the warnings.

**Non-Goals:**
- An "on hold" status.
- Hiding maintenance projects from lists.
- Notifications when a project becomes due.
- A server-side twin of the due rule: nothing on the server shows the walk.

## Decisions

### D1: The interval is personal, the maintenance status is shared

- **The interval is personal.** The review stamp is already personal (weekly-review "Personal review stamp per project"), and "when do *I* look at this again" is part of that same habit. In a shared household project, one partner may review weekly and the other monthly, and a shared interval would make one person's choice silently empty or flood the other's walk. So `review_every` sits on `project_prefs` beside `reviewed_at`.
- **Maintenance is shared.** "We are deliberately doing the minimum on Garden this season" is a statement about the project. Project health is defined per project for every member (statistics "Project health": "health describes the project, not the user"), so a personal mute would make two members see different health words for the same rows, which that requirement rules out. So `status` is a project field under the project-field role rule.

Alternatives considered:
- **Both shared.** This is the research's suggestion (`review_every_days` on Projects). It is rejected for the interval for the reasons above.
- **Both personal.** Rejected, because it breaks the "same health on every device and member" rule.

### D2: An enumeration, not a number of days

`review_every` takes `week`, `2weeks`, `month`, `quarter` or `paused`. The research proposed `review_every_days` (7, 14, 30, 90, paused). Named values avoid a magic number for "paused", let "month" be a calendar month (reviewed on the 15th, due on the 15th), and keep the menu to five choices. Custom day counts can be added later as a value such as `days:10` without breaking older clients, which read unknown values as weekly. Sync checks the kind only (`kString`), as for `user_prefs`.

### D3: Due is computed in logical days

The review date is the logical day of `reviewed_at` (date-time-preferences "Logical today"), plus the interval. A project is due on and after that date. Logical days make a review finished late on Sunday evening due again on the next Sunday, not on Monday. Calendar months are clamped to the month's last day. Never reviewed means due, which keeps today's behaviour for new projects. Under the default weekly interval the walk is exactly today's set of projects not reviewed in the last seven days, so the existing scenario "Resume on another device" still holds.

### D4: Not-due projects stay one action away

The walk lists only due projects. The end of the walk says how many are not due and how many are paused, and "Review them too" appends them to this walk without writing anything. This keeps the walk short without hiding projects, and it is the only new element in the review. The Projects step's done rule uses the same due set.

### D5: What maintenance mutes, and what it does not

| Signal | In maintenance |
| --- | --- |
| Overdue health word | replaced by "Maintenance" |
| Quiet health word | replaced by "Maintenance" |
| On track health word | replaced by "Maintenance" |
| Stalled marker | muted |
| Without a next action | muted, in the walk, on the Loop home and in the digest |
| Late (a passed deadline) | still shown |
| Progress | still shown |
| Today, lists, reminders, counts | unchanged |

- **Late still shows** because a deadline is usually someone else's.
- **Tasks are untouched** because maintenance means "do the bare minimum", not "hide the minimum".
- **The digest** needs the Go side to know the field: `WithoutNextAction` reads `status` and gains fixture cases.

### D6: Progressive disclosure and keys

- **Project menu:** "Review every…" (a submenu, action-menus "Long lists of choices fold into a submenu") and "Put in maintenance" or "End maintenance". In `lists` mode these show only when a non-default value is stored.
- **Walk card:** offers both in every mode, because the person opened the review.
- **New keys:** `e` and `m`, local to the walk card. They are registered in the shortcut registry under the review scope, which has no binding for either today, and the registry test checks for conflicts.

Interface budget:
- No new chrome row, sidebar destination or scroll region.
- The card gains two short lines.
- The project page's lead line shows "In maintenance" inside the existing header element.

### D7: API, CLI, MCP and vault

- **`status`:** REST validates it to `active` or `maintenance` and returns it. The agent tools' `update_project` accepts it, and the project output and the `opentodo://` resources carry it. `ot projects` shows it. The vault writes `opentodo-status: maintenance`, next to `opentodo-color` and `opentodo-icon`.
- **`review_every`:** it is personal like `reviewed_at`, which none of these surfaces carry today, so it stays app-only. The anti-roadmap's rule that features work through the API is met by sync: it is an ordinary op of `project_prefs`.
- **CalDAV:** unchanged.

## Data model, size and budget

- **Fields:** `project_prefs.review_every` (`kString`, default `""`) and `project.status` (`kString`, default `""`) are added to `Schema` with doc comments. The generated web schema and the contract fixture follow.
- **E2EE:** not content. No migration: absent values read as weekly and active.
- **Activity:** `project.status` changes appear in project history as a field change. `review_every` derives no activity, like `reviewed_at`.
- **Size:** no dependency, so no image or memory change. About 2 kB of web bundle.

## Risks / Trade-offs

- [A user sets everything to quarterly and the walk becomes empty] → The end of the walk always states the not-due count with "Review them too", and the weekly review's own rhythm marker is unchanged.
- [Maintenance hides real trouble] → Late still shows, and the status is visible in the page header and All projects, so it is never silent.
- [An editor in a shared project cannot set maintenance] → Same rule as the project's colour and icon. Their own interval is the personal lever.

## Migration Plan

Additive fields, no backfill. Rolling back leaves the values stored and unused, and the walk returns to showing every project.
