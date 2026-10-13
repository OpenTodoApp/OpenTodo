# Design: one-step undo of an AI assistant's changes

## Context

- `mcp-write-tools` (archived) lets an `agent` token write through MCP, and `agent-ready-cli` lets it write through a fixed list of REST content routes. Both end in `agenttools.Registry.Apply`: **one write call = one `ApplyStrict` batch**, every op carrying the token's user as author (`ops.user_id`), device `agent:<token-id>` and **one** server timestamp from `Registry.opTS()`, which is strictly increasing within the process. Relative-reminder ops added by `ExtraOps` carry the same timestamp and device. `CallAll` (REST) records one `agent.write` audit event per tool but still applies one batch.
- The op log (`ops`, labelled into scopes by `op_scopes`) is append-only. Ops are removed only by a purge (Trash purge, retention purge after `OPENTODO_TRASH_RETENTION_DAYS`, default 30) and by the E2EE "purge history" route, which deletes superseded plaintext content ops. There is no other compaction.
- Materialised values live in `scope_fields(scope_id, entity, entity_id, field, value, ts, device)`: the last-writer-wins winner by `(ts, device)` per field (`sync.Wins`).
- History (`sync.Service.History`) already groups ops of one entity into change sets by `(ts, device)`, computes each op's `from` value in LWW order and marks lost ops. The history route labels `agent:` devices "AI assistant (<token name>)" for the token's owner.
- The in-app assistant's undo (`web/src/lib/assistant.ts` `applyChanges`/`undoChanges`) runs on the device: it stores previous values and the `(ts, device)` clock it wrote per field, and on undo writes the previous value only where the field's clock is still its own; created entities get `deleted_at`. It is device-local (last 20 per device).
- Revoking an API token deletes its `api_tokens` row; ops keep `agent:<token-id>`. `agent.write` events keep `token_name` but are pruned after the audit retention (7 to 3650 days, default 90) and are not recorded at all when the audit recorder is absent.

## Goals / Non-Goals

**Goals:** undo one assistant write call, or every call of one token in a period, in one step, from any device; never overwrite an edit made after the call; report exactly what was skipped and why; idempotent; convergent like any edit; no op format change.

**Non-goals:** a pre-apply review for MCP/REST agent writes; undo of non-agent writes; redo; CLI or MCP access to undo in this change.

## Decisions

### D1. A call is identified by `(token id, server timestamp)`; no batch id on ops

`Registry.Apply` stamps every op of a call with one timestamp and the same device, and `opTS` never repeats within a process. So the set `S(call) = {ops : device = agent:<token-id> AND ts = call_ts AND user_id = caller}` is exactly one call. History already uses the same `(ts, device)` grouping for "one edit".

The call id exposed by the API is the string `<token-id>.<ts>` (both parts are validated: token id charset, ts a positive integer).

To make the pair unique across restarts too (a wall clock that steps back after a restart could otherwise reuse a timestamp), `Registry` seeds `lastTS` at start-up from `SELECT MAX(ts) FROM ops WHERE device >= 'agent:' AND device < 'agent;'`, served by the new index (D9). Cost: one indexed query at boot.

Rejected: an additive `batch_id` column on `ops` (or an op field). It would touch the sync protocol, the pull format and every client for information the server already has. Rejected: keying calls on `agent.write` audit rows. Audit is optional, pruned on its own retention and can be configured as short as 7 days, and `CallAll` writes several events per batch.

### D2. Server route, not client

Undo runs on the server as a REST write (`ApplyStrict` + `NotifyApplied`, AGENTS.md rule 2):

- The agent's ops reached devices through sync, but no device holds a record of "this was one call" or the clocks needed for the skip rule unless it fully synced the op log. The server has the op log, the scopes and the current winners, so it can compute the inverse exactly.
- It works from any device, including a phone that never saw the changes and the case where the user wants to react quickly after revoking a token.
- It reuses the role checks of `ApplyStrict` at undo time (D6).

Cost: undo is online-only (it needs the server's op log anyway). The panel shows the last fetched list offline with actions disabled, like the rest of the AI assistants section.

### D3. Semantics of the inverse

Let `S` be the union of the ops of the selected calls (one call, or all calls of one token since a time). For every entity touched by `S`, in the entity's current scope:

1. **Created by `S`** (its `created_at` op is in `S`): the inverse is `deleted_at = now` (to the Trash, restorable, purged later by retention like any trashed item). It is skipped with `changed_since` if any of its fields' current winner is not in `S`, or if a task or comment not created by `S` now references it (a subtask, a comment by anyone, a task moved into an agent-created project, a label put on a task by someone else). Rationale: once a person has worked with the item, trashing it would surprise them; they can trash it themselves. An item already deleted by someone else is left alone (`already_deleted`, not counted as skipped).
2. **Existing entity**, per field `f` written by `S`:
   - Let `W` be the current winner of `f` (`scope_fields`). If `W`'s `(ts, device)` is not one of `S`'s clocks, someone wrote `f` later → skip `changed_since` (or `already_undone` when `W.device` is `agent-undo:<same token>`).
   - Otherwise the inverse value is the LWW winner among the ops of `f` in the entity's scope that are **not in `S`**: the value the field would have if the selected calls had never happened. This is the same as History's `from` value for a single call, and it also handles calls that overlap: undoing call B alone after "A sets due, user edits due, B sets due" restores the user's date; undoing A alone skips (B wrote after it); undoing A and B together restores the user's date.
   - If no such op exists (the field was first set by `S`): for a structural field the inverse is the field's unset value (`null` for nullable kinds; for `priority`, `labels`, `position`, `description` the defaults written by `web/src/lib/ops.ts`, mirrored in a small `sync.FieldDefault` table checked by a parity test against `ops.ts`); for a content field (`internal/e2ee.ContentFields`) the item is skipped `history_unavailable` (E2EE history purge may have removed it, and the server never invents content).
3. **Specific shapes, all covered by the general rule:** a completion is reverted by restoring `completed_at` (null); a recurring completion restores the series' `due` (and anything else the rule changed) and trashes the occurrence record `S` created; a trashed task (`trash_tasks`) gets its previous `deleted_at` (null) back, and if its project is in the Trash by now the task is moved to the Inbox in the same batch, as the Trash restore does; a move restores `project_id`/`section_id`/`parent_id`/`position`; relative-reminder `fire_at` values written by `ExtraOps` are restored with the due date; a comment added by `S` gets `deleted_at` (tombstone; the user is its author, so `Apply`'s comment rules allow it).
4. **Not touched:** ops of `S` that lost under LWW when they arrived (they never were the value), purged entities (`purged`, nothing to restore; purge markers would discard the ops anyway), fields of `S` on entities the caller can no longer see (`not_accessible`).

All inverse ops are applied in **one** `ApplyStrict` batch with one new server timestamp from the REST clock and device `agent-undo:<token-id>` (D5), then `NotifyApplied`. Webhooks and the activity feed see an ordinary edit by the user.

The response lists `restored` (entity, id, action `restore`|`trash`, fields), `skipped` (entity, id, reason, fields) and the new `undo_ts`. With `dry_run: true` nothing is written and the same lists are returned (the UI preview). Titles are not in the response; the client names items from its local data (decrypted when encrypted), so the server never has to display content.

### D4. Idempotency and concurrency

- **By construction:** after an undo, the winners of the restored fields are `agent-undo:` ops not in `S`, so a second undo of the same call restores nothing and reports `already_undone`; created entities are already deleted. No dedup table is needed for correctness.
- **Status for the UI:** a side table `agent_call_undos(user_id, token_id, call_ts, undone_at, undo_ts, restored, skipped)` records each undone call so the list can show "Undone" (or "Partly undone: 2 skipped") without recomputing. It is written after the batch commits; a crash in between only means the next attempt reports `already_undone` and then writes the row.
- **Races:** undo requests of one user are serialised by a per-user mutex in the handler, so a double click does not write two batches. A device edit that arrives between planning and `ApplyStrict` is ordered by LWW like any concurrent edit (D7).

### D5. Device `agent-undo:<token-id>` and history labels

Undo ops are written as the caller (author `user_id`) with the new reserved device `agent-undo:<token-id>` (`sync.AgentUndoDevice`). `ReservedDevice` adds the prefix, so `/api/v1/sync` refuses forged ops with 400 `invalid_op` like `agent:` and `caldav:`. `IsAgentDevice` does not match it (`"agent-undo:"` does not start with `"agent:"`), so `trash_tasks`' "own creations" rule and the agent-call listing ignore undo ops. The history route labels it "Undo of AI assistant (<token name>)" for the token's owner while the token exists, "Undo of AI assistant" otherwise; `web/src/lib/history.ts` falls back to the same generic label for older servers' unknown prefixes.

Rejected: device `server` (the history would show "API" and the user could not tell an undo from a script); the user's device id (the server does not know it, and a session can span devices).

### D6. Permissions

- Routes are registered with `requireAuth` and accept a **session or a `full` token** only. `read` tokens are refused on both routes (403 `insufficient_scope`): the list is only useful to someone who can undo. `agent` tokens are refused with 403 `insufficient_scope` on both routes: on POST by the existing fail-closed `agentRoute` (the route is not an agent content route), on GET by an explicit scope check in the handler, because an assistant should not plan around the user's undo.
- **Only the token's owner:** every query filters `ops.user_id = caller`. A call id of another account answers 404 `not_found`, indistinguishable from an unknown id. Owners and admins cannot undo other users' assistants (they can revoke tokens and use the audit log).
- **Roles at undo time:** before applying, the planner checks each entity against the caller's current access (`loadAccess`): a project where the caller is now a viewer skips its entities with `forbidden`; a project the caller left skips them with `not_accessible`. If `ApplyStrict` still refuses an op (membership changed during the request), the refused entity is moved to `skipped` with the refusal reason and the batch is retried, at most 3 times, then 409 `conflict` asks the user to try again.
- **No undo through MCP or agent REST:** no tool is added to the registry.
- **Demo:** `/api/v1/me/agent-calls` (prefix) is added to `demoRules` ("AI assistants (MCP)"). MCP is refused on the demo, so there are no calls there anyway; the rule keeps a bulk-write route closed.

### D7. Offline and convergence

The undo is an ordinary edit at undo time. Devices receive the inverse ops on sync and converge by LWW. Edits that devices made **after** the undo's timestamp win over it. An offline edit made **before** the undo but synced after it loses on the fields the undo wrote, exactly as it would against a manual edit at that time; it stays in history and can be restored from there. The skip rule only sees edits the server has received at undo time; the docs say so and the preview recomputes on confirm. The route itself is online-only; the panel shows the last fetched list offline with actions disabled.

### D8. End-to-end encrypted accounts

The server never decrypts. In an encrypted account agent writes are structural only (the registry refuses content), so the inverse values are plaintext structural values copied from the op log. If an inverse would write a content field (possible only for a call made before encryption was enabled, and then normally skipped because the migration re-wrote the field), the planner uses `e2ee.IsCiphertext`: a ciphertext value is copied verbatim; a plaintext value is skipped with `encrypted`. The list returns project ids and server-side names through `e2ee.Display` ("Encrypted project"); the web client shows the decrypted local names.

### D9. Listing and data model

`GET /api/v1/me/agent-calls?token_id=&before=&limit=` (limit ≤ 50) runs:

```sql
SELECT device, ts, COUNT(*), ... FROM ops
 WHERE user_id = ? AND device >= 'agent:' AND device < 'agent;' AND ts >= ? [AND device = ?] [AND ts < ?]
 GROUP BY device, ts ORDER BY ts DESC LIMIT ?
```

served by a new partial index `ops_agent_calls ON ops(user_id, ts) WHERE device >= 'agent:' AND device < 'agent;'` (the query repeats the index's terms so SQLite uses it). Counts per call are derived from the fields written: `created` (a `created_at` op), `completed` (`completed_at` set), `reopened`, `trashed` (`deleted_at` set), `changed` (other entities), `comments`. Project ids come from the entities' current `project_id`. Tools come from `agent.write` events whose new additive `call` detail equals the call id (allow-listed key, an id, no content); when pruned the list shows only the counts. Token names come from `api_tokens`, else the `token_name` of a retained `agent.write`, else "Deleted token".

**Data model impact:** migration `NNNN_agent_call_undos.sql` (idempotent `IF NOT EXISTS`): the partial index and the table `agent_call_undos(user_id TEXT, token_id TEXT, call_ts INTEGER, undone_at INTEGER, undo_ts INTEGER, restored INTEGER, skipped INTEGER, PRIMARY KEY(user_id, token_id, call_ts))`. Server state like the audit log: not synced, not in the user export, removed with the user (`auth/users.go` delete list), rows older than the window pruned by the daily retention job. No op field is added, renamed or removed; `Schema` is unchanged.

### D10. Window and limits

- **Window: 30 days** (`AgentUndoWindow`, fixed). The op log keeps the ops longer, but the Trash retention purges created-then-trashed items after 30 days by default and an older call is rarely what someone wants to undo in bulk. Older changes stay reversible through history.
- **Per request:** at most 100 calls and 500 affected entities; more is 400 `too_many_items` with the count, so the user narrows the period. (A runaway token can change at most 1,000 entities a day; two requests cover a day.)
- **Rate:** 10 undo requests (dry runs included) per minute per user, in memory like the agent limiter; over it 429 `rate_limited` with `Retry-After`. GET is not limited beyond the normal API.
- The undo batch counts toward the demo `WriteGuard` like any REST write (irrelevant outside the demo).

### D11. UX

Settings → AI → AI assistants gains a panel **Recent changes by assistants** under the token list, shown when the user has at least one call in the window:

- Grouped by token (name, "assistant, can make changes", or "Deleted token"); each row: relative time (absolute in a tooltip and for screen readers), tools ("complete_tasks"), a summary ("Completed 3 tasks in Finance, Home"), and a status ("Undone", "Partly undone").
- **Undo** per row and, per token, **Undo all from this assistant…** with a period choice (last hour, 24 hours, 7 days, 30 days).
- Both open a **preview dialog** (dry run): "Will restore 12 items. 2 will be skipped" with the skipped items named and their reason ("edited after the assistant", "you are now a viewer in Shared"), and a confirm button. After confirming, a toast summarises the result.
- A task's history entry labelled "AI assistant (<name>)" (only the token's owner sees the name) gets **Undo this assistant change**, which opens the same preview for that call. The history route adds an additive `call_id` to such change sets for the owner.
- Keyboard: every row and button is reachable with Tab, the dialog traps focus and Esc closes it. Offline: the last fetched list is shown with actions disabled and "Undo needs a connection".

## Risks / Trade-offs

- **Overlapping calls.** Undo of one old call skips fields a later call changed. The preview names them; "Undo all from this assistant" handles the common runaway case.
- **Undo after offline edits that have not synced yet** overwrites them on the restored fields (D7). Same as any edit; history keeps both.
- **Trashing agent-created items** with incoming references is skipped rather than forced; a user may need to trash a few items by hand.
- **Clock-based identity** relies on `opTS` monotonicity; the start-up seed covers restarts. Two server processes on one database are not supported by OpenTodo anyway.
- **Window of 30 days** is a product choice (open question 2).

## Migration Plan

Additive migration (index + table). Rollback: an older binary ignores both; undo ops already written are ordinary ops with an unknown device prefix, shown as the device id in history by an older client.

## Size and memory

No dependency. Server: `undo.go` and listing (~600 lines) plus handlers, under +60 KB binary. Runtime memory: the per-user rate limiter (a few bytes per active user) and one plan of at most 500 entities per request. Web: one panel and dialog, under +3 KB gzipped main chunk (lazy with Settings). The partial index holds only agent ops (at most ~1,000 entities a day per token).

## Open Questions

1. **Undo from the CLI.** Add `ot agent calls` / `ot agent undo <call>` (needs a `full` token, so it would not be available to an agent harness using an `agent` token)? Not in this change.
2. **Window.** Fixed 30 days, or follow `OPENTODO_TRASH_RETENTION_DAYS` (and unlimited when it is 0)?
3. **Trash created items that someone touched since?** This design skips them (D3.1); the in-app assistant trashes them anyway. Align one way or the other?
4. **Revoking a token:** should the revoke dialog offer "Also undo this assistant's changes from the last 24 hours"? Small addition, but it makes revoke a write.
5. **Owner/admin undo for members** (incident response on a shared server)? Excluded here: it would write as another user.
6. **Device label wording:** "Undo of AI assistant (<name>)" vs "Undone: AI assistant (<name>)".
