# Design

## Context

- Today's focus lives on the user's own `review` row (`me`): `focus_date` (the local day), `focus` (task ids, comma-separated) and `focus_slots` (Bento's `L:`, `M:`, `S:` entries). The routine step "Set today's focus" plans it with `ruleval.PlanSetFocus`, the Go port of `web/src/lib/focusSet.ts`; both run `web/src/lib/focusSet.vectors.json`.
- Agent tool planners validate against the caller's snapshot and return a change set; the registry applies it through `ApplyStrict` with device `agent:<token-id>` and wakes devices with `NotifyApplied`.

## Decisions

**D1. One rule.** `set_today_focus` calls `ruleval.PlanSetFocus` with the user's `focus_style` and `bento_order`, so the tool, the routine step and the Daily check place the same tasks: Three tasks keeps the first three open ones in order; Bento places by estimate, then in the first free slot, and leaves out what finds no slot. Completed tasks are left out, as in the routine step; the result marks each id `placed` or `left_out` and returns `focus`, the ids placed.

**D2. Today is the app's today.** The day is the logical today in `timezone` (default the account's time zone) with the account's day start, as the Daily check counts it. `today_summary`'s `focus` reads the review row with the same day and returns it as `focus_date`, so a focus set at 02:30 with a 04:00 day start reads back for the day before, and a caller sees which day it is for even when the summary's own `today` (calendar day in `timezone`, UTC by default) differs.

**D3. Visible tasks, all or nothing.** Ids are checked before anything is planned: a task that is unknown, deleted, in another account or in a project kept away from assistants is `not_found` (indistinguishable, as in every write tool). A shared task assigned to someone else is accepted, as the Daily check's picker and the routine step accept it. Repeated ids count once; more than three distinct ids is `-32602`. Any refusal writes nothing. With Three tasks `focus_slots` is left as it is, as in the routine step.

**D4. Personal scope.** The focus belongs to one person, so the tool is not in the list of tools a workspace-limited token may call (`reachTools`) and answers `token_restricted`, as the routine step is not offered in a shared project's routine. The in-app assistant does not offer it (`notInApp`): it cannot set the focus yet, because its review screen does not describe a focus change; that is out of scope here. The routine step keeps its own planner in the engine with the same rule (`notAStep`).

**D5. Replace, not merge.** A call replaces today's focus as a whole, like the routine step: an assistant that wants to add one task reads `focus` from `today_summary` and passes the whole list.

## Data model

None. `focus_date`, `focus` and `focus_slots` are existing plaintext op fields of `review`; they hold task ids only. Offline devices apply the ops on their next sync; concurrent edits converge by last-writer-wins per field, as a focus picked on two devices does today.

## Size

No dependency; no change to the image size or runtime memory.
