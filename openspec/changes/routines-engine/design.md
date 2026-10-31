# Design

## Context

- **Rules today** (`automation-rules`, `internal/rules`): a `rule` is a personal synced entity with `name` (content), `enabled`, `trigger`, `condition`, `actions` (each one whole value), `position`, `created_at`, `deleted_at` (`internal/sync/ops.go`). The engine has an observer that turns committed batches into `rule_events`, a worker that takes them in order, a minute scheduler for `due.reached`, `overdue` and `schedule` with a per-rule watermark (`rule_state`), a planner that turns `actions` into field changes for one task (`internal/rules/plan.go`, sharing `web/src/lib/rules/plan.fixture.json` with the web), limits (`limits.go`: 60 runs per minute, 2,000 per day, the runaway pause), the run log `rule_runs` (100 runs per rule for 30 days, `store.go` `KeepRuns`, `KeepRunsFor`), and the idempotency key `(rule_id, occurrence_key)`. Writes go through `ApplyStrict` with device `rule:<rule-id>`, then `NotifyApplied`; batches written by the engine remember their chain depth in `rule_batches`.
- **Conditions** are evaluated by `internal/ruleval` (a leaf package `internal/sync` uses), pinned by `web/src/lib/rules/match.vectors.json`. The filter language is parsed in Go (`internal/filter`) but evaluated only on the device today.
- **Routes** (`internal/httpapi/rules.go`): the generic collection handlers for `/api/v1/rules`, `GET /api/v1/rules/{id}/runs`, `POST /api/v1/rules/{id}/test`, `GET /api/v1/me/rules`, `PUT /api/v1/me/rules/paused`, all `signedIn.DemoDenied()`; the demo deny list holds the prefixes `/api/v1/rules` and `/api/v1/me/rules`. Agent tokens are refused on rule writes.
- **Agent tools** (`internal/agenttools`): one registry of read and write tools with argument validation, planning into change sets against the caller's materialised state, write limits per token, the write gate (agent token, owner `mcp.writes`, the user's switch), `agent.write` audit and untrusted-text marking. MCP (`internal/mcp`) serves them with resources such as `opentodo://projects`.
- **Other services a step reuses:** `internal/quickadd` (the Go quick-add parser), `internal/timetrack` (one running entry, minutes per period), `internal/notify` and `internal/channels` (in-app inbox, delivery channels behind `notifications.channels`), `internal/webhook` (`rule.fired` deliveries), `internal/mail` (owner SMTP, `Service.Send`, sending limits, a closed set of message kinds), the template library (`templates/`, built by `scripts/templates-build.mjs` into the web bundle), today's focus and Bento slots (`web/src/lib/focusEdit.ts` on the `review` row).
- **Jobs** (`internal/jobs`, `internal/tenant/jobs.go`): the rules engine is one job, `jobs.Rules`; host mode runs the same list on its scheduler.
- **Encrypted accounts** (`end-to-end-encryption` "Rules for encrypted accounts"): a rule's name and its comment text are encrypted by the device; the server runs everything else and refuses the comment action.

## Decisions

**D1. Extend `rule`; do not add an entity.** A routine is a `rule` with an optional `steps` field. A new `routine` entity would duplicate the observer, scheduler, limits, run log, routes, export and page, and would need a migration of every rule on every device, which the owner ruled out ("existing rules show as one-card routines, no user migration"). Names that stay: the entity `rule`, its fields, `Plural["rules"]`, `/api/v1/rules`, device `rule:<rule-id>`, the tables `rule_*`, the job `jobs.Rules`, the notification kinds `rule_fired`, `rule_paused`, the webhook event `rule.fired`. Names that change, in the interface only: the page is **Routines** at `/routines` (`/rules` redirects), the history label "Routine (<name>)", the CLI `ot routine` (`ot rules` stays as an alias), MCP tools named `*_routine*`, docs say routine. No op field is renamed or removed.

**D2. Reading a rule as a routine.** One pure function, shared by Go and TypeScript, turns the stored fields into the steps the engine runs:

- `steps` is `null` (every rule written before this change, and every one-card routine): the routine is one **Change tasks** step whose input is the trigger's output and whose changes are `actions`. Behaviour is exactly today's, including the partial sweep of a scheduled rule (500, the rest next time).
- `steps` is a list: it is the routine; `actions` is ignored (kept as written, never cleared by the server).

A routine with one Change tasks card is saved with `actions` and `steps: null`, so a device without this change still lists and edits it. Adding a second card writes `steps` (the Change tasks card as its first step) and `actions: null` in one batch; going back to one plain card writes `actions` and `steps: null`. The reading is a function of the two fields and each converges by last-writer-wins, so concurrent writers converge to the same routine. An older device that receives `steps` shows the rule as "Made with a newer version" (existing behaviour) and keeps the field.

**D3. Steps, types, references and blocks.** `steps` is a JSON array of step objects:

```json
[
  {"id": "a", "kind": "note_text", "in": {"of": {"literal": {"project": "<Groceries>"}}}},
  {"id": "b", "kind": "split_lines", "in": {"text": {"ref": "a"}}},
  {"id": "c", "kind": "create_tasks", "in": {"text": {"ref": "b"}, "project": {"literal": {"project": "<Errands>"}}}},
  {"id": "d", "kind": "count", "in": {"list": {"ref": "c"}}},
  {"id": "e", "kind": "if", "in": {"value": {"ref": "d"}, "is": {"literal": {">": 10}}},
   "then": [{"id": "f", "kind": "notify", "in": {"text": {"literal": {"format": "{d} groceries, a big shop"}}}}],
   "otherwise": []}
]
```

- `id`: 1 to 8 characters `[a-z0-9]`, unique in the routine, stable across edits so references survive reordering. `trigger` and `item` are reserved.
- `in`: named inputs, each `{"ref": "<step id>"|"trigger"|"item"}` or `{"literal": <value>}`. A reference may name the trigger, a step earlier in the same or an enclosing block, or `item` inside a Repeat block (the innermost Repeat's current item).
- **Blocks:** `if` carries `then` and `otherwise`, `repeat` carries `do`. Blocks nest at most 3 deep. A step inside a block is not visible to references after the block, except a Repeat's collected output (below).
- **Types:** `text`, `task`, `tasks`, `project`, `date`, `number`, and `lines` (a list of text). Each step kind declares its inputs' accepted types and its output type in one table (D4) that Go (`internal/ruleval/steps.go`) and TypeScript (`web/src/lib/rules/steps.ts`) share through `web/src/lib/rules/steps.vectors.json`, so a routine type-checks the same way on both sides and the editor shows a type error offline.
- **Coercions** are fixed and few: a `task` where `tasks` is accepted is a list of one; a `number` where `text` is accepted is written in decimal; a `date` where `text` is accepted is written `YYYY-MM-DD`; nothing else is coerced (a `tasks` where `text` is accepted is a type error with the fix "use Join" or "use Format text").
- **Implicit for each:** a step that takes a single item and receives a list runs once per item and its output becomes a list. **Repeat for each** makes it explicit for several steps; its output is the list of its last step's outputs.
- **The trigger's output:** event triggers, `due.reached` and `overdue` give the `task`; `schedule` gives the firing day as `date` and, when the routine has a condition, the matching open tasks as `tasks`; `manual` gives the `task` the run was started on, if any.
- **Bounds:** at most 20 steps counted across all blocks; encoded size at most 32 KB.

**D4. The step catalogue** (owner-approved, grouped as the editor groups it). "Content" means the step reads or writes user-written text (D9); "Needs" is the availability condition (D15) beyond `automations.enabled`.

*Tasks*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `find_tasks` | one of `query` (filter query text), `view` (a saved view), `condition` (the rule condition object); optional `limit` ≤ 500 | `tasks` (open, live, in list order) | `query`/`view`: yes | — |
| `create_tasks` | `text` (text or lines; one task per line, each line parsed with quick-add syntax by `internal/quickadd`) or fields (`title`, `project`, `section`, `due`, `priority`, `labels`, `energy`) | `tasks` | yes | — |
| `change_tasks` | `tasks`; `set`: the rule `actions` object (labels, priority, due, start, deadline, assignee, state complete/reopen, section and project) extended with `energy` and `trash: true` | `tasks` (the changed ones) | only with `comment` | energy: the Energy levels switch |
| `add_comment` | `task`, `text` | none | yes | — |
| `get_task` | `task` (the trigger, an earlier output, or one chosen task) | `task` | no | — |

*Projects*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `find_project` | `name` text (exact, ignoring case) | `project` | yes | — |
| `create_project` | `name`, optional `parent`, `color`, `icon` | `project` | yes | — |
| `update_project` | `project`; `name`, `color`, `icon`, `archived` | `project` | name: yes | — |
| `create_sections` | `project`, `names` (lines) | none | yes | — |
| `create_labels` | `names` (lines) | none | yes | — |
| `favourite` | `project`, `on` (bool) | none | no | — |
| `project_from_template` | `template` (a library slug), `start` date, optional `name` | `project` | yes (the template's text) | — |

*Notes and text*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `note_text` | `of` (task or project) | `text` (its Markdown projection, at most 64 KB) | yes | — |
| `append_to_note` | `of`, `text` | none | yes | — |
| `clear_note` | `of` | none | yes | — |
| `split_lines` | `text` | `lines` (non-empty, trimmed, list markers and `[ ]`/`[x]` removed, at most 500) | yes | — |
| `join` | `lines`, `separator` (default a new line) | `text` | yes | — |
| `format` | `template` (at most 4,000 characters, `{<step id>}`, `{trigger}`, `{item}` placeholders, task lists written as their titles one per line) | `text` | yes | — |
| `replace` | `text`, `find`, `with`, `case` (bool); plain text, never a pattern | `text` | yes | — |

*Lists and logic*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `filter` | `list` (tasks or lines), `where` (a condition for tasks; `contains`/`not_contains` text for lines) | same type | lines: yes | — |
| `sort` | `list`; tasks by `due`, `deadline`, `priority`, `created`, `title`; lines alphabetically; `direction` | same type | title, lines: yes | — |
| `take` | `list`, `n` (1 to 500), `from` (`start` or `end`) | same type | no | — |
| `count` | `list` | `number` | no | — |
| `if` | `value` (number, text, date or a list), `is` (`>`, `>=`, `=`, `!=`, `<=`, `<` with a number or date; `empty`, `not_empty`; `contains` with text); `then`, `otherwise` blocks | none | text: yes | — |
| `repeat` | `list`; `do` block with `item` | a list of the last step's outputs | no | — |
| `stop` | optional `reason` (a short literal) | none (ends the run: outcome `ended`) | no | — |

*Time and focus*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `start_timer` | `task` | none | no | time tracking for the account |
| `stop_timer` | — | none | no | time tracking for the account |
| `tracked_time` | `period` (`today`, `this_week`, `last_week`, `this_month`, `{from, to}`), optional `project` | `number` (minutes) | no | time tracking for the account |
| `set_focus` | `tasks` (at most 3, or Bento by estimate) | none | no | today's focus in use (the focus style is not off) |

*Communication*

| Kind | Inputs | Output | Content | Needs |
|---|---|---|---|---|
| `notify` | `text` (at most 300 characters), optional `task` | none | yes | — (in-app always; also the user's delivery channels when the owner switch `notifications.channels` is on and the user has a channel with the `routine` event) |
| `webhook` | `webhook_id`, optional `text`, optional `tasks` | none | text: yes | a webhook of the user's, enabled; not a demo |
| `email_me` | `subject` (at most 120 characters), `text` (at most 20,000 characters) | none | yes | outgoing email configured by the owner, a verified address on the account, not encrypted, not a demo |
| `email_members` | `subject`, `text` | none | yes | as `email_me`, and the routine belongs to a shared project (`routines-shared`) |

*AI* (`routines-ai-step`): `ask_ai`, `summarise`.

Steps that have a registry tool are planned **through the registry's own planning** with a routine caller (D11): `create_tasks` (titles parsed first by quick add), `change_tasks` (the rule planner for `actions` keys, `update_tasks`, `schedule_tasks`, `move_tasks`, `complete_tasks`, `trash_tasks` for the rest), `add_comment`, `find_project`, `create_project`, `update_project`, `create_sections`, `create_labels` (`create_label` per name), `get_task`. So the validation and the planning of a change are one code path for agents, the assistant and routines.

**Not offered, with the reason:**

- **Email to any address.** An address typed into a routine would make the server a relay for messages the owner did not write: spam, and the owner's sender reputation at stake, and an outbound target no operator configured (AGENTS.md rule 5). Email goes only to the account's own verified address or, for a shared routine, to the project's members.
- **Fetch a URL, read an RSS or iCal feed, call an API.** AGENTS.md rule 5; webhooks to configured targets are the only outbound step. Calendar subscriptions remain the way to read calendars.
- **Create a calendar event.** Dated tasks already reach calendars through CalDAV, calendar feeds and calendar sync.
- **Run a script or code.** No sandbox to keep small, safe and portable on a Raspberry Pi.

**D5. A run plans everything, then writes.** The engine runs a routine in two phases on the writer connection:

1. **Plan.** Steps run in order against the materialised rows plus an overlay of the changes earlier steps planned (a step after `create_tasks` sees the new tasks with the ids they will be written with; ids come from `internal/ids` at planning). Each step records its status, duration, item count and output type.
2. **Write.** Only when every step planned without error and within the limits, the planned changes are written as batches through `ApplyStrict` with device `rule:<rule-id>` and the run-as user as author, one batch per affected entity as rules do today (so a refused task does not refuse the others), then `NotifyApplied`. Comments, notifications, deliveries, emails, timer and focus writes are part of the batches or queued after they commit. A batch refused by `ApplyStrict` (a task deleted between planning and writing) is counted; the outcome is then `partial` with the counts.

A step that fails while planning, or is unavailable (D15), fails the run at that step: no later step runs and, because a run writes only after its whole plan succeeded, no earlier step's change is written either. The dry run is phase 1 alone.

Alternative considered: write after each step. Rejected: a failure at step 7 would leave steps 1 to 6 written with no clean story for the user, and the dry run would have to simulate writes anyway.

**D6. Limits.** Fixed, documented in `docs/automations.md`, checked in the plan:

- at most **20 steps** (sync shape check and API), blocks at most 3 deep;
- **60 seconds** of server time per run (plan and write); past it the run fails with `time_limit` and writes nothing if still planning; AI steps get their own allowance in `routines-ai-step`;
- at most **500 entities written** per run (each created or changed entity counts once; each comment, notification, delivery and email counts one). A step routine over it fails with `write_limit` and writes nothing, because later steps depend on earlier ones; the legacy one-step reading keeps today's partial sweep;
- lists at most **500 items**, texts at most **64 KB** (a longer note is cut on a character boundary with `textutil.Truncate`, recorded `truncated`); at most 500 iterations of for-each and Repeat in total;
- emails: at most **10 per routine per day and 20 per account per day**, inside the mail service's own limits (`outgoing-email` "Sending limits");
- unchanged: **loop protection** (a routine never fires on its own batch; depth 4 stops the chain), **rates** (60 runs per minute, 2,000 per day per account; a run counts once however many steps), the **runaway pause**, **50 routines** per user;
- a manual run refused by the per-minute rate answers 429 `rate_limited` and is never queued.

**D7. Manual runs and triggers.**

- A new trigger kind `manual` ("Only when I run it") takes no members. Every routine, whatever its trigger, can be **run now**.
- `POST /api/v1/rules/{id}/run` with `{run_id, task_id?, test?}`: `run_id` is a client-generated UUID whose key `manual:<run_id>` makes a retried request a no-op; `task_id` is the trigger output for a routine whose steps reference `trigger`; `test: true` plans and records a test run without writing. Synchronous within the 60 s limit; answers with the run record. A disabled routine can be run by hand; one paused by the server (`runaway`) cannot until turned on.
- A routine whose steps need the trigger's task, run without `task_id`, is refused with 400 `task_required`.
- Sources recorded on the run: `event`, `schedule`, `due` (due and overdue), `manual` (page, palette, CLI, REST), `mcp`, and `test` for a test run from any of them.
- Manual runs fire other routines' event triggers like any routine batch, at depth 2.

**D8. Test and preview.**

- `POST /api/v1/rules/{id}/test` (existing) keeps `{task_id}` and its answer for rules, and adds `steps`: per step its status, output type and count, a preview of the output (titles and text included: the answer goes only to the user who asked and is never stored), the planned changes and the number of entities that would be written.
- `POST /api/v1/rules/test` takes an unsaved draft (`trigger`, `condition`, `actions` or `steps`, optional `task_id`) with the validation of a create, and answers the same way. The editor's live preview uses it for steps that need the server; the data steps (text, lists and logic) and `change_tasks` are planned on the device by the shared TypeScript planner, so most of the preview works offline (`routines-editor`).
- Neither writes anything or adds a run to the log. A logged test is `POST …/run` with `test: true`.

**D9. Encrypted accounts.** The server cannot read or produce text for an encrypted account:

- A step's text literals (a template, a notify text, a comment, a typed title, a filter query) are encrypted by the device as envelopes inside the `steps` value, as the comment action's text is today; ids, kinds, dates, numbers and conditions stay plaintext.
- A routine is **content-free** when no step is content in D4 (per argument: `find_tasks` with a `condition`, `filter` over tasks by condition, `if` over numbers, dates or lists, `webhook` without text are content-free). Content-free routines run on the server for encrypted accounts as for any account.
- A routine with a content step is not run by the server for an encrypted account: each occurrence is recorded `skipped` with reason `encrypted`. `routines-ai-step` replaces this with runs on the user's devices through the device relay. The API accepts such routines (the device edits them). Email steps stay unavailable for encrypted accounts in every case (`outgoing-email` "No task content for encrypted accounts").

**D10. Run records.** Server state, never synced, never content. A migration (the next free number, `NNNN_routines.sql`) adds to `rule_runs`: `run_id` (unique UUID), `source`, `run_as`, `steps_count`, `writes`, `duration_ms`, `undone_at`, `batches_json` (the batch ids, for Undo), `failed_step` (index or -1); and a table `rule_step_runs (run_id, idx, step_id, kind, status, duration_ms, items, out_type, ids_json, error, PRIMARY KEY (run_id, idx))`, `status` one of `ok`, `skipped`, `ended`, `failed`, `unavailable`, `truncated`, `ids_json` at most 50 entity ids read or written, `error` an error code (`type_mismatch`, `not_found`, `invalid_argument`, `write_limit`, `time_limit`, `encrypted`, `unavailable:<reason>`, a tool's code). No titles, no text, no values beyond ids and counts. Legacy rule runs keep their `changes_json` as today. Retention: 100 runs per routine for 30 days (`KeepRuns`, `KeepRunsFor`), runs with outcome `failed` for 90 days; step rows go with their run.

**D11. The routine caller and the API surface for agents.** Routines are the user's own automation: their steps are planned through the registry with a **routine caller** (`agenttools.Caller` with `Scope: routine` and the routine id), which skips the agent token gate and the per-token write limits (the routine limits of D6 apply instead), never audits `agent.write`, and writes with device `rule:<rule-id>`. Reaching routines **from** an agent is the other direction, and goes through the gate:

- **MCP read tools** (behind `mcp.enabled`, any token that may use MCP): `list_routines` (id, name, trigger kind, enabled, paused reason, step count, last run), `get_routine` (the full definition: trigger, condition, steps with their kinds, inputs and each step's availability), `list_routine_runs` (a routine's runs, newest first, 50 at most), `get_routine_run` (one run with its step records). Names and text literals are marked untrusted; encrypted values go through `e2ee.Display`. A resource `opentodo://routines` lists the routines and `opentodo://routines/{id}` serves one.
- **MCP write tools** (only with an `agent` token while the owner's `mcp.writes` and the user's "Allow AI assistants to make changes" are on): `run_routine` (`routine` id or exact name, optional `task_id`, `test`), `set_routine_enabled`, `create_routine`, `update_routine` (whole `trigger`, `condition` or `steps` values, or the name), `trash_routine` (a tombstone, restorable). They validate exactly as the API does (shape, ids, the 50 limit, availability D15), count against the token's write limits (a definition write counts one; a run counts its writes), are audited `agent.write` with the routine id and counts, and write definitions through `ApplyStrict` with device `agent:<token-id>`; a run started by `run_routine` writes with device `rule:<rule-id>` and records `source: mcp`. On encrypted accounts, `create_routine` and `update_routine` accept a name and text literals only as ciphertext envelopes, or through the device relay (`mcp-server` "Encrypted accounts and write tools").
- **REST:** `/api/v1/rules` write routes keep refusing `agent` tokens (agents write through MCP only); `read` tokens may read.
- **No routine step** creates, edits, enables or runs a routine, so a routine cannot spread itself.

**D12. Undo a whole run.** `POST /api/v1/rules/{id}/runs/{run}/undo`:

- For every field the run's batches wrote, if the entity's current winning op for that field is still the run's, the server writes the value before the run (from the previous winning op in the log); otherwise the field is **kept** and counted.
- Entities the run created are tombstoned unless changed since; comments it wrote are tombstoned; a task it trashed is restored; a timer it started is stopped and one it stopped stays stopped (kept).
- Notifications, webhook deliveries and emails are not undone; the answer says so.
- The undo is one set of batches with device `rule:<rule-id>`, marked as an undo so it produces **no rule events** (like an import's undo), and reads "Routine (<name>) undone" in history.
- Once per run, while the run is in the log; the run records `undone_at`. Answer: `{restored, kept, not_undoable}`. Needs a connection.

**D13. Host mode and jobs.** No new job: `jobs.Rules` keeps running each tenant's queue and schedule, and a manual run executes in its request on the writer connection. The 60 s limit bounds a run's hold on a tenant; the host's per-tenant limits count a routine's batches like any writes, and a tenant over its limit fails the run with `tenant_limit` and writes nothing.

**D14. Demo.** The new routes sit under `/api/v1/rules` and `/api/v1/me/rules`, which the demo deny list already refuses, and each is registered with `.DemoDenied()` so the policy test sees both. MCP is off on a demo. The availability function (D15) also reports email and webhook steps unavailable on a demo, so that a later change opening routines to demo visitors cannot send mail or deliveries.

**D15. Availability of a step.** A step is offered only when what it needs is configured and switched on. One function `ruleval.Available(kind, env)` computes it from server state (owner settings and switches, the user's verified address, webhooks and channels, encryption, demo) and the user's synced preferences (energy, focus style), with a reason code and the setting that fixes it:

| Reason | Fixed in |
|---|---|
| `automations_off` | Settings → Server → Automations |
| `email_not_configured` | Settings → Server → Outgoing email |
| `email_not_verified` | Settings → Account → Email |
| `encrypted` (email steps) | — (cannot be fixed on this account) |
| `no_webhook` | Settings → Integrations → Webhooks |
| `ai_not_configured`, `ai_no_consent` (`routines-ai-step`) | Settings → Assistant |
| `energy_off` | Settings → How you work → Energy levels |
| `focus_off` | Settings → How you work → Today's focus |
| `time_tracking_off` | Settings → How you work |
| `not_shared` (`email_members`) | — |
| `demo` | — |

- `GET /api/v1/me/rules/catalogue` returns every step kind with its group, inputs, output, `available` and, when not, `reason` and `setting`. The device caches it for offline use; the editor (`routines-editor`) hides unavailable steps from the picker's browsing and shows them in search results with the hint ("Set up email to use this").
- **At save** (API and MCP), a routine may hold an unavailable step (a routine imported from an export, or one saved before a setting changed); the answer carries `warnings` naming each step and reason. Delivery channels missing make `notify` in-app only, never unavailable.
- **At run time**, an unavailable step fails the run at that step with status `unavailable` and the reason; no later step runs, and nothing is written (D5). The run log, `GET …/runs` and the run's notification carry the reason and the setting.

**D16. CLI.** `ot routine` (alias `ot routines`; `ot rules` keeps its existing subcommands as aliases), table and `--json` output described by `ot schema`:

- `ot routine list`, `ot routine show <id|name>` (trigger, condition, steps as numbered sentences, availability), `ot routine runs <id|name> [--failed] [--limit n]`, `ot routine run <id|name> [--task id] [--test]` (prints each step's status and counts; exit code 0 on `applied`/`ended`, 6 on `failed`), `ot routine enable|disable <id|name>`, `ot routine create --file routine.yaml|json`, `ot routine edit <id|name> --file …` (replaces the given parts), `ot routine rm <id|name>` (a tombstone, confirmed unless `--yes`), `ot routine undo <id|name> <run-id>`.
- The file holds `name`, `trigger`, optional `condition`, `steps` (or `actions`), and `enabled`; ids may be written as names (`project: Errands`, `label: waiting`) which the CLI resolves before sending, failing with the name when it does not resolve. JSON is read with the standard library; YAML with `go.yaml.in/yaml/v3`, already in the module graph, linked into `ot` only (a test keeps it out of the server, as for `internal/vault`).
- A `read` token is refused on every write subcommand with exit code 5; an encrypted account's profile without a decrypting key refuses `create` and `edit` of text, naming `ot encryption unlock`.

## Data model impact

- `rule.steps`: an additive field, kind `kRoutineSteps`, default `null`, not a content field (its text literals are envelopes on encrypted accounts, D9). The sync shape check: an array of steps with known kinds, unique ids, references only to visible ids, inputs of the declared names, literals of the declared shapes, at most 20 steps and 3 block levels, encoded size at most 32 KB. Its comment in `Schema` documents it; `opSchema.ts`, `contentfields.go` and the contract fixture are regenerated.
- `rule.trigger`: the additive kind `manual` in the closed set.
- No field renamed or removed, no data migration of rules. Server migration `NNNN_routines.sql`: additive columns on `rule_runs` (old rows read `source` from their trigger kind, `run_as` as the user, `steps_count` 1) and the table `rule_step_runs`.
- Export: `rules` already includes every field, so `steps` travels; the own-format import re-maps ids inside `steps` literals (projects, sections, labels, views, webhooks, tasks) as it does for `actions`.
- The template library is embedded into the server as the same built JSON the web uses (`scripts/templates-build.mjs` output, about 40 KB), read by `project_from_template` and pinned by the library's instantiation test running the Go reader too.
- The filter language gains a Go evaluator (`internal/filter`) for `find_tasks` with a query or view, pinned by evaluation vectors shared with the TypeScript evaluator.
- Today's focus and Bento rules (`web/src/lib/focusEdit.ts`) gain a Go port for `set_focus`, pinned by shared vectors.

## Size and memory

No new server dependency. Go: the step table, availability and the data steps in `internal/ruleval` (pure, about 900 lines), the planner over steps in `internal/rules`, the filter evaluator and the focus rules as small ports, the embedded template library (about 40 KB). Binary growth about 200 KB. `ot` gains the YAML reader (already a module dependency; about 300 KB on the CLI binary only). A run holds at most 500 items, 64 KB per text and 20 step records in memory. Web: `steps.ts`, about 6 KB gzip, in the rules chunk; first load unchanged (the palette entry is a registry line that loads the chunk on use).

## Interface budget

This change adds no screen; the existing Rules page and dialog keep working and show a routine with more than one step as "Made with a newer version" until `routines-editor` replaces them. The palette gains entries, no shortcut.

## Open questions

- **Trash as a step.** Default chosen: `change_tasks` may trash (soft delete, restorable, undone by the run's Undo). The owner may prefer to leave deleting out of routines.
- **Time limit.** Default chosen: 60 s per run on the server, AI steps aside.
- **Write limit for step routines.** Default chosen: over 500 entities the run fails and writes nothing, instead of the legacy partial sweep.
- **Email limits.** Default chosen: 10 emails per routine per day and 20 per account per day.
- **Routines created by an agent.** Default chosen: `create_routine` saves the routine with `enabled` as the agent passed it (default off), and the history names the agent; the owner may prefer agent-created routines to always start off until the person turns them on in the app.
- **Page path.** Default chosen: `/routines`, with `/rules` redirecting; the API keeps `/api/v1/rules`.
