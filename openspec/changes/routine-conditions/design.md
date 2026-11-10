# Design

## Context

- A rule (a routine) is personal: it lives in its author's scope, like a label, and the server engine (`internal/rules`) runs it for its author over the author's whole world. Workspaces are a partition of that world, decided on read by `sync.Partition` / `web/src/lib/workspaces.ts`: a project follows its root ancestor's `workspace_id`, a task its project, else its parent, else its own value; null or an unknown id is the default workspace.
- A shared project's routine is already bounded: its world holds only that project (`routines-shared` D3, `world.bound`), and `outsideProject` fails a run whose changes leave it.
- The condition format is shared Go↔TS and pinned by `match.vectors.json`. `project` and `section` are `{in}` or `"none"`, `priority` is `{in}`, `labels` has `any`, `all` and `none`. So "project is none" exists in the format; the editor never offered it.
- The editor names projects from `useProjects()`, which holds the current workspace's projects only. A routine pointing at another workspace's project therefore said "a removed project".
- 1.0 (tag `v1.0.0`): the server's `ParseCondition` refuses unknown keys and shapes, and a rule the server cannot read is left out (never runs). The web matcher ignores unknown condition keys. A device run of an encrypted account plans the routine on the device (`deviceRun.ts`) and commits the changes to the server.

## Goals / Non-Goals

**Goals:**
- A routine that works in one workspace, and a new routine that starts in the one it is created in.
- No run that moves a task across workspaces by surprise.
- The editor names what a routine points at, whatever the current workspace.
- "Is not" and "no project" in the condition, readable or refused safely by 1.0.

**Non-Goals:**
- Changing what any existing routine does.
- Routines listed or hidden per workspace.
- A general boolean condition language.

## Decisions

### D1 The workspace is a field of the routine, not a predicate

`rule.workspace_id`: an id, or null for every workspace. A personal routine of a workspace runs in a world of that workspace only (`world.inWorkspace`: its tasks, projects and sections; the other workspaces' projects kept in `elsewhere`). Every trigger path already reads the rule's world (`worldFor`, `worldOf`), so the trigger fires only for that workspace's tasks, Run now and Test refuse a task outside it (`not_found`), a schedule's matching tasks and Find tasks find only its tasks, and Create tasks and Create a project without a project or parent write the workspace's `workspace_id` (null for the default, as the agent tools write it). Before the plan is written, `outsideWorkspace` checks every change: a task outside the workspace and not created by the run, a move into another workspace's project, a parent outside it or another `workspace_id` fail the run with "this routine works only in the workspace Work (a task outside it)". A shared routine ignores the field.

The default workspace is written as its id. Null already means "every workspace" for every rule made before this change, and a label's null means "the default workspace". The two must not be confused, so the default is never null here.

A workspace the user no longer belongs to (deleted, or left) makes the routine not run: its triggers are not fired, and Run now and Test answer 409 `workspace_gone`.

Alternatives considered:
- A condition key `workspace: {in: [id]}`. It reuses the matcher and its vectors, but it is the wrong shape. A condition turns a schedule's output from "the day" into "the matching tasks" (`TriggerOutput`), so a new schedule routine starting with a workspace condition would suddenly act on every task of the workspace. A condition also does not bound Find tasks, Create tasks or Create a project. And a 1.0 web matcher ignores the unknown key, which matches more tasks.
- Hiding routines of other workspaces on the Routines list. Hidden enabled routines that keep running are worse than a list that names their workspace (D3).

### D2 "Is not" is a sibling form: `{not_in: [...]}`

`project: {not_in: [ids], descendants?}`, `section: {not_in: [ids]}`, `priority: {not_in: [1..4]}`: exactly one of `in` and `not_in`, with at least one entry. A task without a project or section is in none of the listed ones, so it matches "is not". With `descendants`, "is not Work" leaves out Work's sub-projects too. Labels keep `none` ("has none of these labels"), which already is "label is not".

Alternative considered: `{in: [...], not: true}`. A 1.0 client reads it as `in` and matches the opposite tasks. That is the one outcome the owner's rule forbids.

### D3 The editor

- The When card reads "When **a task is created** in **Work** if **any task**". The workspace word opens the same anchored choice list as the trigger: each workspace, then Every workspace. It is shown only to accounts with more than one workspace and never on a shared routine. A new routine's draft has no workspace until it is saved, and it is saved with the current workspace. An account with one workspace also stores its default workspace's id, so adding a second workspace later keeps the routine where it was made.
- The Routines list names a routine's workspace in the row's quiet meta line when it is another than the current one. Every-workspace routines stay unmarked, as before.
- The condition panel: project, section and priority each get one test select (**Any | Is | Is not**, plus **No project** / **No section**) beside the chooser of what it names, in the existing two-column grid, the same pattern as the date test. "Is" and "Is not" keep the chosen value when switched. Before anything is chosen, the test waits on the device and writes nothing.
- Interface budget (docs/interface-guide.md): no new chrome rows, no new scroll region, no shortcut. One word in the When card's sentence; the condition panel keeps its rows and adds a Section row.

### D4 Compatibility with 1.0 and older 1.x clients

The owner's rule: new values stay readable by 1.0 clients, meanings never change in 1.x. Each new value against each older reader:

| Value | 1.0 server (or older 1.x) | 1.0 web matcher (live count, device runs) |
| --- | --- | --- |
| `project: {not_in}` | `ParseCondition` refuses it: the rule is left out and never runs | `p.in` is undefined: a task without a project does not match, any other throws. It never matches more |
| `section: {not_in}` | refused, as above | a task without a section does not match, any other throws |
| `priority: {not_in}` | refused | throws |
| `rule.workspace_id` | not a field it knows: the op is refused, nothing is stored | ignored: the device plans over every workspace |

The server is always the newest part, because it serves the web app. So the real 1.0 readers are a cached web app, the `ot` CLI and MCP hosts. A thrown matcher on a stale device fails that device run. Nothing is written, and the run waits for another device or times out. The one value an older device reads as "more" is `workspace_id` in a device run of an encrypted account. That is why the server checks every device commit and every encrypted proposal against the routine's workspace (`outsideWorkspace` after `layDevice`): changes to a task outside the workspace fail the run with the reason, and nothing is written. An older device editing a routine writes only the fields it changes, so `workspace_id` survives its edits.

There is no frozen 1.0 grammar for rules like `internal/recurrence/recurrence10` (`docs/contracts.md` lists the matcher and planner vectors only), so the vectors carry the new forms and the table above is the 1.0 check.

### D5 Names across workspaces

`useRoutineNames(workspace)` reads every workspace's live projects and labels. One outside the current workspace is named "Website (Work)". A project that is gone (or was never on this device) still reads "a removed project". The pickers use `pickerNames(names)`: the routine's workspace's projects and labels, or every workspace's for a routine of every workspace.

### D6 Moving across workspaces

A routine of a workspace never moves a task out of it. The Change tasks step fails with `other_workspace` ("this routine works only in the workspace Work; that project is in another workspace"), so the run log says why and nothing is written. The rule form (one Change tasks card in `actions`) skips the move with the reason "other workspace" and applies its other actions, as it already does for a shared project. A routine of every workspace keeps moving tasks across workspaces as it does today. Its meaning is 1.0's, and some people rely on it ("label work → move to Work").

## Data model

- `rule.workspace_id`: `kNullableString`, default null, not a content field (an id). Additive; no migration. Converges by per-field last-writer-wins like every rule field; offline edits apply locally first.
- No new table, setting, route or dependency. Binary and bundle size: unchanged within noise. The routines screens are lazy chunks, and `make bundle-budget` stays within the first-load budget.

## Risks / Trade-offs

- A routine of a workspace that Find tasks used to read across workspaces now finds less. That only happens after someone chooses a workspace; existing routines are every workspace.
- The editor's live count stays the current workspace's, as before. For a routine of another workspace it can differ from what the server finds.
- `Workspaces()` is read once per run world, and only for routines with a workspace.
- A stale, cached 1.0 web app that has not reloaded yet can fail to draw a routine using `not_in` (its summary reads `in`). It writes nothing, and the next load brings the new app from the server.
