# Design

## Context

- **Routines** (`routines-engine`): steps with types, a plan-then-write run, limits (20 steps, 60 s, 500 writes), availability with reasons (AI steps reserved with `ai_not_configured` and `ai_no_consent`), content steps skipped `encrypted` on encrypted accounts, run records with ids and counts only, undo of a run, MCP tools to create, edit and run routines behind the agent write gate. `routines-editor`: the card editor with previews, the Inbox card (failures and **waiting proposals** stay until handled), `routine_proposal` notifications.
- **Assistant** (`in-app-assistant`, `internal/assistant`): owner configuration (off by default), providers (Anthropic and Chat Completions), provider keys as secrets, per-user consent with a disclosure version, member keys, the monthly allowance (default 500,000 tokens; `cap_member_keys`), usage records, prompt-injection defences and untrusted-text marking, reviewable change sets applied by the browser with `mutateMany`, the limited auto-apply of small reversible changes, and the on-device assistant for encrypted accounts (provider and key only on the device, usage never reported).
- **Device relay** (`mcp-server` "Device opt-in to answer AI connectors", "Relay channel", "Relay errors", "Relay limits"; `internal/relay`, `web/src/lib/relay.ts`): opted-in devices of an encrypted account hold a separate event stream; the server sends sealed requests and the device answers once on a bound route; per-account and per-device limits; the server never stores relayed plaintext.

## Decisions

**D1. The AI steps return text, nothing else.**

- `ask_ai`: inputs `instruction` (text literal, at most 2,000 characters, the user's own words), up to three `context` inputs (Text, Lines, Tasks or a Project; tasks are sent as title, due, priority, labels and project; a project as name, sections and open tasks), `answer` (`text` or `lines`), output Text or Lines (at most 500 lines, 64 KB).
- `summarise`: input Text, Lines or Tasks, `length` (`short` about 50 words, `medium` about 150), output Text.
- One provider call per step (per item when the step runs for each item, counting toward the 500 iterations), **without tools**, with fixed instructions: the context is data from the user's account, possibly written by others or imported; instructions inside it are to be ignored; answer only in the requested form. Context is wrapped in `untrusted_text` as tool results are. The answer is checked like a model response (stop reason, refusal, cut-off: `in-app-assistant` "Model response checks"); a refusal or cut-off fails the step with `ai_refused` or `ai_truncated`.
- Because the model has no tools, the most a manipulated answer can do is change the text that later steps (chosen by the user) use. Proposal mode (D2) puts a person between that text and any write; auto mode (D4) bounds it to additive changes of at most 20 items.
- At most 3 AI steps per routine. Each provider call may take up to 60 s; a run with AI steps may take 60 s plus 90 s per AI step.
- Availability (`routines-engine` D15): plaintext account: assistant on, a provider usable by the user, and consent at the current disclosure version (D10); encrypted account: the on-device assistant is set up and consented on at least one device opted into routines (D7), checked when the device answers.

**D2. Proposal mode (the default).** A run of a routine that contains an AI step (and is not in effective auto mode, D4) plans every step and writes nothing. The plan's changes become a **proposal**:

- Stored on the server in `routine_proposals (id, rule_id, run_id, user_id, created_at, expires_at, state, body)`, `state` one of `waiting`, `applied`, `partly_applied`, `dismissed`, `expired`. For a plaintext account `body` is the planned change set as JSON (it holds content: titles the AI wrote; it is deleted when the proposal is handled or expires, and is never copied into the run log or exports). For an encrypted account the device writes `body` as one ciphertext envelope (D7), so the server holds no plaintext.
- The run's outcome is `proposal` with the item count; the run record keeps ids and counts only.
- A proposal expires after **7 days** (`expired`), and its body is deleted.
- Non-write side effects in a proposal run (notify, webhook, email) are part of the proposal too and happen only on apply.

**D3. Reviewing and applying.** The Inbox card's "Review" (and the bell, and the run detail) opens the proposal like an assistant change set: each item with its target, the change (old → new), "Written by AI" on AI text, and a tick, all ticked by default. **Apply** writes the ticked items:

- plaintext account: `POST /api/v1/me/rules/proposals/{id}/apply` with `{items}`; the server re-plans each item against the current data (an item whose target was deleted, or whose field changed since the proposal was made, is skipped and counted), writes through `ApplyStrict` with device `rule:<rule-id>`, records the batches on the run (so Undo run works), and marks the proposal `applied` or `partly_applied`;
- encrypted account: the device decrypts the body, the person reviews, and the device commits the ticked items through the device-run commit route (D8), with the same checks.
- One Undo toast after apply; the run's Undo stays available.
- **Dismiss** (`DELETE /api/v1/me/rules/proposals/{id}`) deletes the body and marks it `dismissed`.
- Apply needs a connection; offline the review opens from the last fetched copy and Apply says "Needs a connection".

**D4. Apply without asking (auto mode).** A synced field `rule.ai_apply` (`"auto"` or empty) set from the routine editor's switch, off by default.

- **Allowed writes** in a routine that has an AI step: Create tasks; Add comment; Create labels; Change tasks with only `priority`, `due`, `start`, `deadline`, `energy`, `add_labels`, and `section` within the task's current project. **Not allowed:** completing or reopening, trashing, `remove_labels`, assignee, moving to another project, project steps, note steps (append, clear), set today's focus, timers. Notify me, Email me and Send a webhook are allowed (they reach the user's own targets only). The editor disables the switch with the reason when a step is outside this set ("Turn off Apply without asking to complete tasks"), and the server re-checks at save (`warnings`) and at every run (a run with a disallowed write falls back, D5).
- **At most 20 items** written per run in auto mode (each created or changed entity, comment and label counts one).
- Every auto run is shown in the Inbox card, also when successes are hidden (`routines-editor` "Hide successful runs" does not hide auto-applied AI runs), with Undo run.
- **Effective mode** is auto only when `ai_apply = "auto"` and there is no fallback newer than the winning op of `ai_apply` (D5); otherwise proposal.

**D5. Automatic fallback.** The server records in `rule_state` `ai_fallback_reason` (`limit`, `failures`, `disallowed_write`) and `ai_fallback_at` (the server time), and counts consecutive failed runs in `ai_failures` (reset by a successful run). It falls back when an auto run would exceed 20 items or any routine limit (that run becomes a proposal), plans a disallowed write (that run becomes a proposal), or when two runs in a row failed. From then on runs are proposals; the Inbox card and the editor say "Apply without asking was turned off after <reason>". The person turns it on again in the editor, which writes `ai_apply = "auto"` anew; because that op is newer than `ai_fallback_at`, auto mode resumes. This is server state compared with an op's time, so devices converge without the server writing to the routine.

**D6. Agents cannot apply without asking.** `ai_apply` is refused on every agent path: MCP `create_routine` and `update_routine` reject the field with `forbidden_for_agents`; the in-app assistant's planned change sets never include it (the registry's planner drops the field and reports it); the REST rules routes already refuse `agent` tokens and accept the field only from a session or a `full` or `admin` token (the person); the sync route refuses `agent` and `read` tokens. A routine created by an agent therefore runs its AI steps in proposal mode until the person turns auto on in the app. The history names who wrote `ai_apply`.

**D7. Device runs for encrypted accounts.**

- **Opt-in per device:** "Run my routines on this device" in Settings → Encryption and from the editor's warning (D11). It needs an unlocked device and a recently confirmed session, is refused on a demo, is server state on the device's relay row (`relay_devices.routines`), survives locking (unlike the MCP relay opt-in, the device answers only while unlocked, and running the user's own routines sends nothing to a third party), and ends at sign-out, when encryption is turned off, or from any device. The device announces its capabilities when its relay stream opens: `routines`, and `ai` when the on-device assistant is set up and consented on it.
- **Which routines:** on an encrypted account, a routine is sent to a device when it has a content step (`routines-engine` D9) or an AI step; content-free routines stay on the server.
- **Dispatch:** at each occurrence the server records the run `waiting_device` and sends a sealed `routine.run` request (rule id, run id, occurrence, trigger task id; no content) to one opted-in, online, unlocked device with the needed capabilities, preferring the device most recently active. The device plans the whole routine with the shared planner (every step kind has a TypeScript implementation pinned by vectors with Go: `web/src/lib/rules/steps.vectors.json` extended to all kinds), calling its own provider for AI steps, and then commits (D8).
- **What a device run cannot do:** Email steps (unavailable on encrypted accounts), Send a webhook with text (unavailable with reason `encrypted`, since the text would pass through the server in plaintext); Notify me carries its text as ciphertext to the in-app inbox, and channels receive "A routine has a notice" without text.
- **Limits:** the routine limits apply and are enforced again by the server at commit; the relay's per-account limits apply to the requests; the device's own limits on decrypted values apply. A device shows "Running Groceries…" while it runs and lists recent routine runs in its relay panel.
- **Run now** on an encrypted account runs on the device in hand (no relay), with the same commit; it needs a connection.

**D8. Device run routes.** Session-only (the device's own session), each bound to a run the server dispatched to that device or started by it:

- `POST /api/v1/me/rules/runs/{run}/commit` with the run's step records (ids, counts, statuses, durations, tokens; never text) and either `ops` (ciphertext operations, grouped per entity) for a real run or `proposal` (one ciphertext envelope and its item count) for a proposal run. The server checks the run is waiting on this device, the routine and its steps are unchanged since dispatch (else 409 `routine_changed`, nothing written), the limits (500 writes; 20 items and the allowed write kinds in auto mode, else the commit is refused with 409 `fallback` and the device resubmits as a proposal), and applies the operations through `ApplyStrict` with device `rule:<rule-id>`, then records the run.
- `POST /api/v1/me/rules/runs/{run}/fail` with the failing step and code, for a run the device could not finish.
- Both are registered with `signedIn.SessionOnly().DemoDenied()`.

**D9. Waiting for a device.** With no suitable device, a dispatched run stays `waiting_device`: the run log and the Inbox card read "Waiting for one of your devices", and the routine's row says "Turn on Run my routines on a device" when none is opted in. When a suitable device connects, it receives the waiting runs; only the **latest occurrence per routine** is kept waiting (older ones are recorded `skipped` with reason `superseded`). After **24 hours** a waiting run is recorded `missed` with reason `no_device`, which counts as a failure (Inbox card, bell once per day).

**D10. Consent covers routines.** The assistant's disclosure gains a paragraph: routines with AI steps send their inputs to the provider on schedule or on events, while the user may not be present. Accepting it records `routines: true` with the disclosure's version on the consent record (`PUT /api/v1/me/assistant`). Without it AI steps are unavailable (`ai_no_consent`); the user's other assistant use keeps working on its existing consent. The on-device assistant's disclosure gains the same paragraph.

**D11. Tokens, budget and Test.**

- **Usage:** each AI step's input and output tokens are recorded on the run (counts only) and in the assistant usage of the run-as user, tagged `routine`; at the monthly cap the step fails with `assistant_quota` before any provider request; own-key usage follows `cap_member_keys`. Device runs report their counts in the commit's step records (not in the assistant's usage, which stays on the device, `in-app-assistant` "On-device usage stays on the device"), so the routine's budget holds across devices.
- **Daily budget per routine:** `rule.ai_budget` (number of tokens per UTC day; `0` reads as 20,000; 1,000 to 200,000). Before each provider call the server (or the device, from the routine's usage the server reports at dispatch) checks today's tokens for the routine (`rule_ai_usage (rule_id, day, tokens)`); a call that would exceed it is not made and the step fails with `ai_budget`.
- **Preview** never calls the model: an AI card previews "The AI answer appears when you Test · about 3,200 tokens", estimated from the inputs (characters / 4, plus the answer's maximum).
- **Test** asks before calling the model ("This test sends the inputs to <provider> and uses about 3,200 tokens"); then runs the AI steps for real, plans the rest, writes nothing, and shows the answer, the planned changes and the real token count. Test runs count toward usage and the budget.

**D12. Editor.** The AI cards ("Ask AI: **sort these into Work and Home** using **the lines**, answer as **lines**"), the Apply without asking switch in the routine's settings with its allowed-writes explanation and the 20-item limit, its fallback notice, the token budget field, the AI usage of the last 7 days, and on encrypted accounts the warning: "This routine reads text, so it runs on one of your devices. When it is due, a device with Run my routines turned on must be online and unlocked." with the opt-in button. All in six languages, keyboard reachable, in the lazy chunk.

## Data model impact

- `rule.ai_apply` (kString, default `""`; `"auto"` turns auto mode on) and `rule.ai_budget` (kNumber, default `0`, read as 20,000): additive, not content. No field renamed.
- Server migration `NNNN_routines_ai.sql`: `routine_proposals` (bodies deleted when handled or expired), `rule_ai_usage (rule_id, day, tokens)`, `rule_state.ai_fallback_reason`, `ai_fallback_at`, `ai_failures`, `relay_devices.routines` and `relay_devices.capabilities`; the assistant consent record gains `routines` with its version.
- Proposal bodies are server state, never synced, never exported, never in backups' exports of user data (they are in the database snapshot and expire within 7 days).

## Size and memory

No new dependency. Server: the routine completion reuses the assistant's providers; a proposal body is at most 500 items (well under 1 MB). Web: the device runner (planner for every step kind, the relay handler, the commit) about 8 KB gzip in the routines chunk, loaded by the relay handler on the first `routine.run`; first load unchanged. A device run holds the routine's inputs and outputs in memory only and drops them after commit.

## Interface budget

- **Chrome rows:** the proposal review is a sheet with its title row and the Apply bar: 2. The editor's header is unchanged; AI settings sit in the routine's settings section below the cards.
- **Sidebar destinations:** none. **Scroll regions:** the review sheet's list: 1. **Shortcuts:** in the review, `Enter` applies and `Escape` closes, as the assistant's review does (registered, no conflict).

## Open questions

- **Proposal expiry.** Default chosen: 7 days.
- **Daily budget default.** Default chosen: 20,000 tokens per routine per day, 1,000 to 200,000.
- **Device-run token counts on the server.** Default chosen: a device reports the token counts of routine AI steps in the run record (counts only, never text) so the per-routine budget holds across devices; the on-device assistant's own turns stay unreported.
- **Routines opt-in survives locking.** Default chosen: yes (the device answers only while unlocked); the MCP relay opt-in still ends on lock.
- **Waiting window.** Default chosen: 24 hours, latest occurrence per routine.
- **Re-consent.** Default chosen: AI steps need consent at the new disclosure version that mentions routines; other assistant use is not interrupted.
