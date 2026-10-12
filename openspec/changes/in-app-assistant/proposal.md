# In-app assistant: plan and change your tasks by talking, with your own model key

## Why

`mcp-write-tools` lets an external assistant act on OpenTodo, and `agent-ready-cli` lets agent harnesses use `ot`. Most people, though, will never configure an MCP client. They want to type "plan my week", "move everything overdue to Friday", "break this task into steps" or "what did the team finish yesterday?" inside the app. Commercial task apps sell this as a paid add-on that sends everything to the vendor's model provider. OpenTodo can offer it on the user's own terms. It stays off until the owner turns it on, uses a model provider and key the owner (or the user) chooses, including a local model, sends nothing anywhere until a person has explicitly opted in, and applies changes only after the user has reviewed them, as ordinary undoable edits.

This is the third "Bring your agent" change. It reuses the agent tool registry, limits and prompt-injection threat model from `mcp-write-tools` (design D1, D5, D9, D11).

## What Changes

- **Chat panel.** A chat panel in the web app opens with a keyboard shortcut or a header button. It uses the existing overlay module: a side sheet on wide screens and a full-screen sheet on phones. Streamed answers are announced in a polite live region. The panel is lazy-loaded.
- **Where it runs.** The agent loop runs on the server (design D1). The provider key stays on the server and the browser never sees it. Read tools come from the shared registry and run against the user's synced data. Write tools only *propose*: each turn can end with a change set, which the browser shows as a reviewable list ("Water plants: due Wed → Fri"). Only after the user confirms does the browser apply it through `mutateMany()`, with device `assistant:<device-id>`. The changes then sync, converge, appear in history as "Assistant" and can be undone in one step.
- **Providers**, each brought with the operator's or the user's own key:
  - Anthropic through the official Anthropic Go SDK and the Messages API (default model `claude-opus-5-5`; `claude-sonnet-5-5` and `claude-haiku-5-5` selectable).
  - OpenAI.
  - Google Gemini.
  - Any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Mistral and others).
  Model names are settings. Only the Anthropic defaults are built in.
- **Off by default, explicit consent.** The owner enables the assistant and chooses which providers are allowed. Keys live in the existing secrets mechanism. The OpenAI-compatible base URL is checked with the webhooks private-network policy. Each user must opt in after a disclosure that states which provider receives their task content and which fields are sent. Members may bring their own key if the owner allows it. Nothing is sent to any provider before both the owner and the user have acted.
- **Safety.**
  - Confirmation is required for every change, with an optional per-device "auto-apply small, reversible changes" that is off by default.
  - At most 50 changed entities per confirmation.
  - Undo applies the inverse values in one step.
  - Tools cannot change sharing, members, settings or tokens, and cannot make outbound requests.
  - The system prompt marks all task text as untrusted data.
  - Model responses are checked for refusals and truncation before use.
- **Cost controls.** The owner sets a monthly per-user token cap. Usage shows on each answer and in Settings. One turn per user runs at a time, and a server-wide concurrency cap applies.
- **Conversations** are stored only on the device (IndexedDB). They are never synced or shared, are not in exports or backups, and are cleared at sign-out.
- **End-to-end encrypted accounts:** the assistant is unavailable, with a clear explanation, because the server cannot read their content and relaying plaintext through it would break what encryption promises (design D6).
- **Demo instance:** the assistant is disabled, and its routes are added to the demo deny list.
- **New routes:**
  - `GET/PUT /api/v1/settings/assistant` (owner).
  - `GET/PUT /api/v1/me/assistant` (consent, own key).
  - `GET /api/v1/me/assistant/usage`.
  - `POST /api/v1/assistant/turn` (streams the answer; session only).

## Out of scope

- A mode where the browser calls the provider directly with a key held in the browser. Rejected for v1 (design D1). It may come back later as the only path for encrypted accounts (open question).
- Syncing conversations across devices or sharing them. Server-side conversation history.
- Tools that browse the web, fetch URLs, send email, or touch sharing, members, settings, tokens, imports or exports.
- Voice conversation (voice capture already fills quick add), image input, and file attachments.
- Fine-tuning, embeddings, semantic search, or background agents that act without the user present.
- Optional environment presets for provider keys. Keys are set in Settings, stored in the secrets file.
- A mock provider for the demo instance.

ROADMAP: advances "Bring your agent" item 3, `in-app-assistant`.

**BREAKING:** none. There is no new mandatory environment variable and the op log format is unchanged. Assistant edits are ordinary ops with a new device prefix that existing devices treat as an opaque id. With the feature off, nothing about the server's network behaviour changes.

## Capabilities

### New Capabilities
- `in-app-assistant`: owner configuration and providers, key storage, the network policy, user consent, the turn route, proposals from the shared registry, change-set review and apply, undo, auto-apply, injection defences, response handling, cost controls, conversation storage, encrypted accounts, and the panel UI.

### Modified Capabilities
- `demo-mode`: "Restricted features" adds the assistant.
- `trash-and-history`: a new requirement labels in-app assistant writes "Assistant" in history.

## Impact

- Server:
  - `internal/assistant` (provider interface, the Anthropic adapter on `github.com/anthropics/anthropic-sdk-go`, an OpenAI-compatible chat adapter on the standard library used for OpenAI, Gemini and custom endpoints, the agent loop, the system prompt, usage accounting).
  - `internal/httpapi` (four routes, demo rules).
  - `internal/settings` (assistant settings and the secrets file).
  - Reuse of `internal/agenttools` and the `internal/webhook` address checks.
- Data: a server table `assistant_usage` and a settings key `assistant`. Secrets in `<data>/secrets/assistant.json`, which backups exclude. Client Dexie tables `assistantThreads` and `assistantUndo`, kept on the device. No op field changes.
- Client: a lazy-loaded `web/src/app/assistant/` chunk (panel, change-set review, consent), `web/src/lib/assistant.ts` (stream client, apply and undo through `mutateMany`), a Settings → Assistant section, a shortcut and a header button.
- Docs: `docs/assistant.md` (owner setup per provider, privacy disclosure, safety, costs, E2EE note), `docs/self-hosting` (outbound targets), `docs/keyboard.md`.
- Size, measured on 2026-10-12 (design D10):
  - The Anthropic Go SDK adds **about 4.9 MB** to the server binary (15.53 MB to 20.41 MB stripped, +31%).
  - Own code adds an estimated 200 KB.
  - The web main chunk grows by about 1 KB gzipped, and the lazy assistant chunk is about 20 KB gzipped.
