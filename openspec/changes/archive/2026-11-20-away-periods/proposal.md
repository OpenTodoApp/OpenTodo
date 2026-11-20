## Why

Issue #805. During a holiday or an illness, repeating tasks and habits keep coming due. Coming back means a pile of overdue occurrences and broken streaks. Today they can only be skipped one at a time, and nothing marks a whole period, least of all after the fact ("I was ill since Tuesday").

## What Changes

- **Away**, one action from Today's menu and the command palette.
  - Choose a range of days, in the future or already started, up to 90 days.
  - Choose what it covers: every repeating task, or only chosen projects and labels (to keep "Water the plants" for the house-sitter, say).
- **The action skips every occurrence in the range** of the repeating tasks it covers, in one batch with one Undo.
  - It uses the skip that exists today. The current occurrence moves the series on, a later one gets a skipped record, and a habit's skipped records keep its streak unbroken without counting as done.
  - Past days work the same way, so the overdue pile disappears.
- **The period is stored on the account** (one additive `user_prefs` field, synced like other preferences).
  - While today is inside it, Today's title reads "Away until Friday", with **End now**.
  - With **Pause reminders** (on by default), no reminder is delivered, on any device or channel, and no email digest is sent.
- **API and CLI:**
  - `POST /api/v1/away` sets a period and applies the same skips through the op log; `DELETE /api/v1/away` ends it.
  - In the CLI, `ot away <from> <to>` and `ot away --end`.

Out of scope:
- tasks without a repeat rule (they keep their dates; bulk Reschedule exists);
- showing other members of a shared project that you are away, or passing a chore's turn;
- separate vacation and sick kinds, or a label on the period;
- an assistant or MCP tool (a follow-up, once the route exists);
- skipping occurrences of series created after the action.

It advances ROADMAP item `away-periods` (a new row). No **BREAKING** change: one additive op field, no new environment variable. The new strings go in every locale.

## Capabilities

### New Capabilities

- `away-periods`: the away period, the skipping action, the paused reminders and digest, the route and the CLI command.

### Modified Capabilities

None. The skip, the habit records, the streak and the exceptions are used as `recurring-tasks` and `habits` define them.

## Impact

- `internal/sync/ops.go`: `user_prefs.away`, with its generated schema.
- Web:
  - `web/src/lib`: computing the skips, `applyBatch` with Undo;
  - the Away dialog (lazy), the Today title, the palette command;
  - local notifications that check the period.
- Server: the reminder and digest jobs read `away`; `internal/httpapi` adds the route (policy, API docs, OpenAPI, v1 surface).
- `internal/cli`: `ot away`.
- Tests, docs (a short guide), a changelog fragment.

No dependency. The dialog loads lazily, so the first load is unchanged.
