# Design: in-app assistant

## Context

The client is the source of truth (Dexie). Every edit goes through `mutateMany()` in `web/src/lib/ops.ts`, which stamps ops with the device id and an HLC timestamp, applies them locally, and queues them for sync. The server materialises synced state and serves it to the agent tool registry (`internal/agenttools`, introduced by `mcp-write-tools` D1). Each write tool there has a pure `Plan` step that returns a `ChangeSet {entity, entityId, patch, base}` without writing. Secrets live in `<data>/secrets/*.json` (mode 0600, the `settings.Secrets` type redacts itself in JSON and logs, and backups exclude the directory). Outbound requests are allowed only to operator-configured targets. Webhooks show how to protect against SSRF: `internal/webhook/ssrf.go` resolves the host, refuses private, loopback, link-local and metadata addresses unless the owner allows private targets, connects to the address it checked, and never follows redirects. End-to-end encryption hides content fields of an encrypted account from the server, and encrypted accounts cannot share projects. The overlay module (`web/src/app/overlay`) gives dialogs and popovers that turn into sheets on phones. Heavy UI is lazy-loaded (`NotesEditor`, Help, Vim).

Cross-cutting decisions (the shared registry, limits, the threat model, the ordering) are in `mcp-write-tools` design D1, D5, D9 and D11.

## Goals / Non-Goals

**Goals:** a useful conversational assistant that can read tasks and *propose* changes. Every change is reviewed, applied as normal local-first ops, attributed and undoable. Provider keys never reach the browser. Nothing is sent anywhere without owner and user consent. It works with hosted and local models. It is cheap to leave off.

**Non-Goals:** autonomous or background agents, cross-device conversation sync, web browsing tools, multimodal input, serving encrypted accounts in v1.

## Decisions

### D1. Architecture: a server-run agent loop with change sets applied by the client
**Chosen:** the browser sends a turn (the device-local conversation, the user's time zone and light context such as the current view and selected task ids) to `POST /api/v1/assistant/turn`. The server:
1. checks that the assistant is enabled, the user has consented, the quota has room and the account is not encrypted;
2. picks the provider and key (the user's own key if allowed and set, otherwise the operator's);
3. runs the tool loop with the provider: read tools run against the caller's materialised state, and write tools run `Plan` only, adding their `ChangeSet` to a turn draft that later tool calls see as an overlay;
4. streams text, progress lines, the final proposed change set, usage and the stop reason back as server-sent events on the response.
The server never applies in-app proposals. The browser shows the change set for review, and on confirmation applies it with `mutateMany(changes, {origin: 'assistant'})`, which stamps device `assistant:<device-id>`. Before sending a turn the browser flushes its outbox, so the server reads what the user sees. The turn result carries `server_time`.

**Alternatives considered:**
- **(B) Loop and key in the browser, direct provider calls.** Works with E2EE (the browser has plaintext) and needs no server code. Rejected for v1: it exposes the key to every browser extension and XSS sink, depends on provider CORS (Anthropic allows browser calls only with an explicit `anthropic-dangerous-direct-browser-access` header, others vary), cannot enforce owner allow lists, quotas or the private-network policy, and would need the tools re-implemented in TypeScript, splitting the registry `mcp-write-tools` D1 exists to keep single. It remains the only design that could serve encrypted accounts. Open question Q2.
- **(C) Loop in the browser, model calls relayed through the server** (the server injects the key). The key stays safe and E2EE content could flow. Rejected: the relay still sees plaintext, so it does not actually serve E2EE users. Tools would still be duplicated in TypeScript. The server would have to trust tool results the client sends back (a modified client could feed anything to the model on the operator's key).
- **(D) Server loop that also applies writes with `ApplyStrict`,** as MCP does. Rejected for in-app use: the confirmation gate would become a server-side state machine with pending writes, undo would go through history instead of being one local step, and edits would not apply locally first.

**Why D1.** The key stays server-side under the existing secrets discipline. The owner's policies (providers, endpoints, quotas, the private-network policy) are enforced in one place. The tool registry is shared with MCP, so the same validation, limits and injection defences apply. Writes still go through the client's normal `mutate` path, so they apply locally first, sync, converge, appear in history, and are undone like any edit. The costs: read tools see synced data only (mitigated by the outbox flush and `server_time`), and E2EE accounts cannot use it (D6).

### D2. Change sets: review, stale detection, apply, undo
- A turn produces at most one change set, the union of the turn's write-tool plans, capped at 50 changed entities (`mcp-write-tools` D5's per-call cap). If the model plans more, the loop returns a tool error asking it to split the work, and the assistant says so ("I can change 50 at a time. Shall I continue with the next 70 after this?").
- **Review UI.** Items are grouped by entity, each showing the title and `field: old → new` in words ("Due Wed 14 Oct → Fri 16 Oct", "Completed", "New task in Garden: …"). Every item has a checkbox (all checked by default). Apply is Enter and Discard is Esc. Changes to tasks in shared projects carry a "shared" badge.
- **Stale detection.** Before applying, the browser compares each item's `base` with local values. Items that differ ("changed since proposed") are unchecked and marked. Items whose entity is missing or deleted locally are dropped with a note.
- **Apply.** One `mutateMany` call for the checked items. Patches for new entities carry their full field sets. `mutateMany` handles reminders and rich-text pairs as for any edit. Offline: once a proposal has arrived, applying works offline. The ops queue and sync later, converging by last-writer-wins on `(ts, device)` like any local edit.
- **Undo.** Before applying, the browser stores an inverse batch in `assistantUndo` (base values for patched fields, and `deleted_at` for entities it created). "Undo" in the panel and in the toast applies it as a new `mutateMany` batch. That is one step, works offline, converges, and is recorded in history. If a field has changed again since (the HLC of the current value is newer than the applied op), undo skips it and says so. The inverse is kept for the last 20 applied change sets per device.
- **Auto-apply** (per device, off by default, in Settings → Assistant). It applies without review only when the change set has at most 3 entities, creates and deletes nothing, and touches only `completed_at`, `due`, `priority`, `labels`, `project_id` and `section_id`. A toast with Undo always appears. Content edits, creations and trash moves always need review.

### D3. Providers
A small interface in `internal/assistant`:
```
type Provider interface {
    Stream(ctx, Request) (Stream, error) // Request: system, messages, tools, max_tokens
}
// Stream yields TextDelta, ToolCall{id,name,args}, Usage{in,out}, Stop{reason}
```
- **Anthropic.** The official Go SDK (`github.com/anthropics/anthropic-sdk-go`), Messages API, `Messages.NewStreaming` with `Message.Accumulate`. Never an OpenAI-compatible shim. Specifically:
  - Default model `claude-opus-5-5`. `claude-sonnet-5-5` and `claude-haiku-5-5` are offered in the model picker. The owner can type any model id.
  - Tools come from the registry with `strict: true`.
  - `tool_choice` is `{type: "auto"}` always. Forced `any` or `tool` returns 400 on current models, so the loop never uses it.
  - Thinking is adaptive: `thinking` omitted or `{type: "adaptive"}`. It is never disabled, since disabling returns 400 on Opus 5.5. Thinking blocks are passed back unchanged within a turn's tool loop and not stored in the device conversation.
  - Streaming is always on, because answers that plan a week are long.
  - `stop_reason` is checked before using content (D5).
- **OpenAI, Gemini and OpenAI-compatible.** One adapter on the standard library for the Chat Completions wire format (`/chat/completions` with `stream: true`, `stream_options.include_usage`, `tools`, `tool_choice: "auto"`).
  - OpenAI uses `https://api.openai.com/v1`.
  - Gemini uses Google's documented OpenAI-compatible base URL on `generativelanguage.googleapis.com`.
  - Custom endpoints use the owner-entered base URL (Ollama, LM Studio, OpenRouter, Mistral and others).
  - Model ids are required settings. The UI pre-fills a documented suggestion that the owner can change, and no non-Anthropic model id is hard-coded into behaviour.
  - Strict schemas are sent where the endpoint supports them. Endpoints without tool support are detected on "Test connection" and refused with a clear message.
  - A native Gemini adapter was considered. It is deferred, because the compatible endpoint covers tool use and avoids a second wire format.
- Adding a provider later means implementing the interface. No other code changes.

### D4. Configuration, keys and network policy
- **Owner settings** (`settings` key `assistant`, `GET/PUT /api/v1/settings/assistant`):
  - `enabled` (default false);
  - `providers: {anthropic|openai|gemini|compatible: {enabled, model, base_url (compatible only)}}`;
  - `default_provider`;
  - `allow_member_keys` (default false);
  - `monthly_token_cap_per_user` (default 500,000; 0 means unlimited);
  - `allow_private_endpoint` (default false).
  Members get a status view: enabled, which providers, the models and their own quota, with no keys.
- **Keys.** `<data>/secrets/assistant.json` holds `operator:<provider>` keys and, when allowed, `user:<user-id>:<provider>` keys, through `settings.SecretsFile`. The API returns presence flags only. Keys are never logged (the `Secrets` type redacts them), never exported, and never backed up, because backups exclude `secrets/`. Setting or clearing a key records `settings.changed` with the setting name `assistant.<provider>.key` (or `assistant.own_key.<provider>`) and `from`/`to` set to `unset`/`set`, never the value. Deleting a user removes their keys.
- **Network.** The server connects only to the hosts of enabled providers: the fixed hosts for Anthropic, OpenAI and Gemini, and the owner's base URL for compatible endpoints. The compatible base URL goes through the same checks as webhooks (`internal/webhook` address validation, reused and not copied): at save time and on every connection after DNS resolution, private, loopback, link-local and metadata addresses are refused unless `allow_private_endpoint` is on (needed for Ollama on the LAN). Connections go to the checked address and redirects are refused. Members cannot set base URLs. The owner's list of enabled providers is the allow list. "Test connection" sends a minimal request and reports success or the provider's error code. It is the only request made outside a user turn, and only the owner can trigger it.
- **No telemetry.** Requests carry the turn content only. No user ids, emails or instance identifiers are sent beyond the API key, apart from an optional `metadata.user_id` (an opaque per-user hash) that is off by default.

### D5. Turn handling and response checks
- **Route.** `POST /api/v1/assistant/turn`, **session only.** Bearer tokens are refused with 403 `session_required`, so the assistant cannot become a free model proxy for scripts on the operator's key.
- **Limits.** Body at most 256 KB and at most 40 messages; the client trims older messages and keeps a summary line. One turn per user at a time (409 `turn_in_progress`). At most 8 concurrent turns server-wide (503 `assistant_busy`, retryable). At most 8 tool rounds per turn. `max_tokens` is 8,192 per model call.
- **System prompt.** Fixed text on the server, not editable in v1. It contains today's date in the user's time zone, the user's display name, what the assistant can and cannot do, that writes are proposals the user reviews, and the untrusted-data rule (D7).
- **Stop reasons.** Checked before content is used:
  - `end_turn`: finish.
  - `tool_use`: run the tools and continue.
  - `max_tokens`: finish and mark the answer as cut off, with no change set proposed from a truncated turn.
  - `refusal`: show "The model declined this request." with no partial content and no change set.
  - `pause_turn`: continue the same turn once.
  - Anything unknown: treat as an error.
  The compatible adapter maps `finish_reason` (`stop`, `tool_calls`, `length`, `content_filter`) onto the same cases.
- **Streaming events to the browser:** `text` (deltas), `status` ("Looking at Today…"), `changeset`, `usage {input, output}`, `done {stop_reason}`, `error {code, message}`. Provider errors map to `provider_error` (with the provider's status and type, never the key), `provider_auth` (bad key), and `provider_rate_limited`.

### D6. Encrypted accounts: assistant unavailable in v1
With D1 the server would have to read content it cannot read. Relaying plaintext from the browser through the server (C) would show plaintext to the operator, the party E2EE protects against, and sending it to a third-party provider needs a consent model that is stricter than for plaintext accounts. In v1, encrypted accounts therefore see the panel with an explanation ("The assistant can't read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted."), the turn route answers 409 `encryption_enabled`, and the consent step is not offered. Q2 records whether a later change should add mode B (direct-from-device with the user's own key) for these accounts.

### D7. Prompt injection (in addition to `mcp-write-tools` D9)
New sources of untrusted text here: task titles and descriptions, comments from other members, email-to-task bodies from arbitrary senders, imported data, CalDAV items. The mitigations, in order of strength:
1. **Confirmation gate.** No change happens without the user seeing it, except auto-apply, which is opt-in and limited to small, reversible fields.
2. **Tool surface.** The registry has no outbound, sharing, member, settings, token, import or export tools. Purge is impossible. `trash_tasks` in the in-app assistant applies only to tasks the same proposal created (the in-app equivalent of the "created by the same token" rule).
3. **Caps:** 50 entities per change set, 8 tool rounds, the token quota.
4. **Untrusted marking.** Tool results wrap user text as `untrusted_text` with the notice, and the system prompt states that instructions inside data must be ignored and reported to the user ("This task's description contains instructions; I ignored them.").
5. **Provenance:** shared-project items and other people's comments are flagged, and the change-set review badges shared items.
Residual risk: a convincing injected instruction can make the assistant *propose* misleading changes, and the user may accept them. That is bounded by review, caps and one-step undo, and documented.

### D8. Conversation storage: on the device only
Dexie tables `assistantThreads {id, title, messages[], created_at, updated_at, provider, usage}` and `assistantUndo`, with no sync, no outbox entries, and not part of server export or backups. Retention: the last 50 threads or 30 days, whichever is smaller, plus "Clear conversations" in the panel. Sign-out runs the existing `clearDeviceData()`, which drops these tables. Messages store text, tool status lines and applied or discarded change-set summaries, never thinking blocks or raw tool results beyond what was shown. Server-side storage was rejected: it would put a second copy of task content (and model output about it) on the server with its own retention and export questions, while the server loop is stateless per turn and needs nothing kept.

### D9. UI and accessibility
- **Opening the panel.** The header button "Assistant" (only when the feature is enabled for the user) and the shortcut **Shift+I** (task 5.1 confirms no clash with the default and Vim keymaps). It is listed in `?` help and `docs/keyboard.md`.
- **Panel.** A side sheet built on the overlay module from 640 px up and a full-screen sheet below. Focus is trapped while open, Esc closes it, and focus returns to the opener. The composer is a textarea (Enter sends, Shift+Enter adds a new line). Messages render with the existing `Markdown` component.
- **Screen readers.** Streaming text goes to an `aria-live="polite"` region that is updated at sentence boundaries (debounced), not per token. Status lines use a separate polite region. The change-set review is a labelled list of checkboxes with the summary in each label.
- **Offline.** The panel opens and shows past conversations, the composer is disabled with "The assistant needs a connection", and a proposal already received can still be applied or undone offline.
- **First use.** The consent step (D4/spec) appears before the first message. Usage ("1,240 tokens · this month 18% of your limit") shows under each answer.
- **Lazy loading.** `web/src/app/assistant/` is a separate chunk, loaded on first open. The main chunk gets only the launcher and the shortcut.

### D10. Size and dependencies
- **Anthropic Go SDK** (`github.com/anthropics/anthropic-sdk-go`, v1.80.0 at the time of writing, pulling in `tidwall/gjson`, `tidwall/sjson`, `tidwall/match`, `tidwall/pretty` and `golang.org/x/sync`). Measured on 2026-10-12 by linking a streaming Messages call into `cmd/opentodo` (linux/amd64, `-trimpath -s -w`): **15,532,297 → 20,414,729 bytes (+4,882,432 bytes, +31%)**. The container image grows by about the same amount (from under 25 MB to about 30 MB).
  - **Justification (AGENTS rule 6):** the Messages API surface we use (streaming events, tool use with strict schemas, adaptive thinking, refusal stop reasons, error types, retries) changes with new model generations. The official SDK tracks those changes, and a hand-written client would have to re-implement and re-verify them. The project's requirement is to use the official SDK for Anthropic.
  - **Mitigation considered:** a `noassistant` build tag that leaves out `internal/assistant` for a slim image variant. Deferred to the owner as Q1, because a second image doubles release artefacts.
- **OpenAI-compatible adapter:** standard library only, estimated at under 100 KB.
- **Own server code** (loop, settings, routes, usage): estimated at under 120 KB.
- **Memory.** One turn holds the conversation (at most 256 KB), the accumulated model message and tool results (bounded by the 200-item read cap), well under 2 MB. At most 8 concurrent turns means under about 16 MB at peak. Nothing is held while idle. The SDK client is created lazily on the first turn.
- **Web:** main chunk +1 KB gzipped. The assistant chunk is estimated at 20 KB gzipped (panel, review, consent, stream parser), reusing `Markdown` and the overlay module. No new npm dependency (SSE parsed with `fetch` and `ReadableStream`).

## Data model impact

- **Server.**
  - New table `assistant_usage(user_id TEXT REFERENCES users(id) ON DELETE CASCADE, month TEXT, input_tokens INTEGER, output_tokens INTEGER, turns INTEGER, PRIMARY KEY(user_id, month))`.
  - New table `assistant_consent(user_id PRIMARY KEY …, accepted_at INTEGER, disclosure_version INTEGER, provider TEXT)`.
  - Settings key `assistant`.
  - Secrets file `secrets/assistant.json`.
  - None of these are ops. They are server state like the audit log and tokens, and they are not exported (usage could be added to the export later if asked for).
- **Ops:** no new fields. Device strings gain the prefix `assistant:` (device-generated, allowed through `/api/v1/sync`, unlike `agent:` and `caldav:`). Existing devices treat it as an opaque id, and last-writer-wins is unaffected.
- **Client:** Dexie tables `assistantThreads` and `assistantUndo` in a schema version bump. They are device-local, so no migration of synced data is involved.
- **Audit:** `settings.changed` for assistant settings and key presence changes. No new event name, and no content.

## Risks / Trade-offs

- [Binary +31% from the SDK] → measured and disclosed, decided in Q1. The feature costs nothing at runtime while off.
- [Task content sent to a third party] → off by default, owner choice of providers (including local ones), per-user consent with an explicit field list, and member-own-key option. The disclosure names the provider.
- [Other members' shared-project content reaches the provider through one member's assistant] → disclosed in the consent text. Q3 asks whether project admins need an opt-out.
- [Read tools see only synced data] → outbox flush before each turn, `server_time` in results, and stale detection at apply time.
- [Provider outage or bad key] → typed errors in the panel. The owner's "Test connection" checks configuration up front.
- [Runaway cost] → monthly per-user cap, 8 tool rounds, `max_tokens`, one turn per user, server concurrency cap.
- [Injected instructions] → D7. Review plus undo bounds the outcome.
- [Model ids change] → model ids are settings. Only the Anthropic defaults are built in, and the owner can override them.

## Migration Plan

Additive migration (two tables) and a Dexie version bump. Off by default, so nothing changes until the owner enables it. Rollback: disable it in Settings (instant), or run an older image. Assistant ops already applied are ordinary ops and stay valid. The older client labels their device as "another device".

## Open Questions

- Q1. Accept the measured +4.9 MB (+31%) for the Anthropic SDK in the default binary, or also ship a slim image built with a `noassistant` tag?
- Q2. Should a later change add a direct-from-device mode (user-held key in the browser, provider called from the device) so encrypted accounts can use the assistant, with its key-exposure and CORS trade-offs?
- Q3. Should project admins be able to exclude a shared project from AI assistants (MCP and in-app), so one member's assistant cannot send other members' text to a provider? That would be an additive project field and also affects the shipped MCP read tools.

## Owner decisions

Recorded before implementation (2026-10-12, see also the `mcp-write-tools` design):

1. **Q1, SDK size:** accepted, single image. No `noassistant` build tag.
2. **Q2, encrypted accounts:** not now. Encrypted accounts get "unavailable" (D6); no direct-from-device mode in v1. Kept on `ROADMAP.md` as a future idea.
3. **Q3, excluding a shared project from AI assistants:** not in v1 (future idea on `ROADMAP.md`). The disclosure tells people that other members' text in shared projects is sent.

## Implementation notes

- **Package layout.** `internal/assistant`: `config.go` (owner settings under the settings key `assistant`, validation, the secrets file `secrets/assistant.json` with `operator:<provider>` and `user:<id>:<provider>` keys, consent, usage), `provider.go` (the `Provider`/`Conversation` interface: one conversation per turn keeps provider-native history, so Anthropic thinking blocks go back unchanged within the tool loop), `anthropic.go` (official SDK, `Messages.NewStreaming` + `Message.Accumulate`, `option.WithoutEnvironmentDefaults()` so no `ANTHROPIC_*` variable or profile is ever read), `chat.go` (stdlib Chat Completions for OpenAI, Gemini and compatible endpoints), `network.go` (webhook dialer reuse), `schema.go`, `loop.go` (agent loop, system prompt, finalising the change set) and `service.go` (concurrency slots, provider construction, Test connection). Routes are in `internal/httpapi/assistant.go`.
- **Registry use.** The loop calls only `Registry.Definitions`, `Lookup` and `Plan`, never `Call` or `Apply`. Its `Caller` sets the MCP write switches to true so the registry lists its write tools; the turn route enforces the owner's enablement, the user's consent, encryption and quota on every turn instead. Read results get the registry's `_notice`; write results add `proposed: true` and a "not applied" note. The token id `in-app-assistant` gives a device (`agent:in-app-assistant`) that can never be the creator of a stored entity, so `trash_tasks` accepts only tasks created earlier in the same proposal. The registry's REST-only `update_project` is never offered (`Plan` looks up MCP tools only).
- **Strict schemas.** The registry's schemas carry `minLength`, `maxLength`, `maxItems`, `minimum`, `maximum`; strict tool modes accept a smaller subset, so `schema.go` moves those keywords into the description (as the official SDKs do) before a schema goes to Anthropic; the registry still validates every call. Gemini additionally gets `["T","null"]` type lists flattened. OpenAI and compatible endpoints get the schema unchanged and no `strict` flag (OpenAI's strict mode needs every property required, which the registry's optional fields are not).
- **Anthropic request.** `tool_choice: {type: "auto"}`, `thinking: {type: "adaptive"}` sent explicitly (never disabled), `output_config.effort: "medium"` set explicitly (a constant, not a setting, since the spec has none), `max_tokens: 8192`, top-level ephemeral `cache_control` because tools and system repeat on every round, and SDK retries (2) for 429/5xx before the stream starts. Errors map from `*anthropic.Error` status and type only; the SDK's own message (which includes the request URL and body) is never shown or logged.
- **Change set.** The draft is the sequence of planned changes (each plan sees the earlier ones as its overlay). At `end_turn` it is merged into one change per entity (later values win, the first base of each field is kept), marked `shared` for tasks, comments and projects of shared projects (current or target project), and sorted projects and labels first. A write call that would push the draft past 50 entities is answered with a `proposal_full` tool error and adds nothing, so the model splits the work and offers to continue.
- **Stop reasons.** `end_turn`/`stop_sequence` finish; `tool_use` runs every call of the round and answers them in one message (`is_error` on failures); `max_tokens` and `model_context_window_exceeded` finish as cut off with no change set; `refusal` finishes with the fixed message and no change set (the client drops any streamed partial text); `pause_turn` continues once; an 8th model call that still asks for tools ends as `round_limit` with no change set; anything else is a `provider_error`. Usage is summed over rounds and recorded even when the turn fails or is cancelled.
- **Route order.** 404 while off → `session_required` for tokens → `encryption_enabled` → `consent_required` → 413 → 400 → 429 `assistant_quota` → 409 `turn_in_progress` / 503 `assistant_busy` → 409 `no_key` → stream. Nothing reaches a provider before every check passes (`TestTurnRouteGuards` counts requests on the fake). `PUT /api/v1/me/assistant` accepts sessions and full tokens like `/me/agent-access`; consent must name the provider in effect (409 `provider_changed`), so a disclosure read before an owner change cannot be accepted for the new provider.
- **Additions not in the spec text.** `POST /api/v1/settings/assistant/test` (Test connection, owner only); 409 `no_key` when a hosted provider has no key; 409 `assistant_disabled` for consent while off; `reason` and `operator_key_set` on `GET /api/v1/me/assistant`. All are additive and documented in docs/api.md.
- **Network.** Built-in hosts use a client with the environment proxy and no redirects; the compatible endpoint uses `webhook.Dialer` (resolve, filter, dial the checked address) without any proxy and without redirects; save-time checks also refuse credentials in the base URL. Retries of the Chat Completions adapter: 2, with backoff, for 429 and 5xx before the stream starts.
- **Client.** `mutateMany(changes, {origin: 'assistant'})` stamps `assistant:<device-id>`. `lib/assistant.ts` (lazy) holds the SSE parser, stale detection (`base` against local values, re-checked right before applying), apply with the inverse stored first in `assistantUndo` and the applied field clocks recorded, undo that skips any field whose clock is no longer the assistant's, the auto-apply rule, sentence chunking for the live region, and thread retention. `lib/assistantStatus.ts` is the only part in the main chunk (status, launcher rule, open signal). Undo of a created entity moves it to the Trash. Dexie version 13 adds `assistantThreads` and `assistantUndo`; `clearLocalData()` (called by the app's `clearDeviceData()` at sign-out) clears both.
- **Panel.** `AssistantSheet` uses the overlay module's `useOverlay`, `trapTab` and `isolate` directly (the `Dialog` component centres a card; the side sheet needs its own frame). Esc discards a proposal when focus is inside it, otherwise closes. Settings → Assistant is a second lazy chunk.
- **Fake provider for screenshots and the layout check.** `scripts/fake-llm.mjs` is a scripted OpenAI-compatible server; `scripts/e2e-layout.mjs` and `scripts/docs-screenshots.mjs` point the compatible provider at it (private endpoints allowed), so no real provider or key is used and answers are deterministic.
