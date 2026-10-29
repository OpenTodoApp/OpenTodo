# Design

## Context

See proposal.md (Why) for the trace of #501. In short: the reported reply is OpenTodo's own catch-all 404, which a correctly routed `POST /api/v1/settings/assistant/test` cannot produce, whatever the provider. That part was handled by `api-method-not-allowed` (#502). This change fixes what the trace found after the route: how the one Chat Completions adapter (`ChatProvider` in `internal/assistant/chat.go`, used for OpenAI, Gemini and compatible endpoints) and its browser twin (`chatProvider` in `web/src/lib/assistantDevice/providers.ts`) read a provider's error.

Today both reduce an error to its HTTP status. `providerErr` maps 401/403 to `provider_auth`, 429 to `provider_rate_limited`, 5xx to `provider_error` "had a problem", and everything else to `provider_error` "refused the request". The Go side also reads `error.type` or a string `error.code` from an object body as the `Type` shown in brackets.

Google's OpenAI-compatible endpoint, observed on 2026-10-29:

| Request | Status | Body |
|---|---|---|
| invalid key | 400 | `[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]` |
| wrong path | 404 | empty |
| unknown model (documented) | 404 | `[{"error":{"code":404,"message":"models/… is not found …","status":"NOT_FOUND"}}]` |

## Goals / Non-Goals

**Goals:**
- A wrong Gemini key reads as a rejected key, on the server and on the device.
- A wrong model or base URL reads as "no such model or endpoint", clearly the provider's answer and not OpenTodo's routing.
- The Go and TypeScript readers agree, pinned by shared vectors.

**Non-Goals:**
- Showing or storing the provider's error text. The existing rule stays: messages are fixed strings plus status and a short type.
- Any change to the Anthropic path, which goes through the official SDK and its typed errors.
- Proxy or redirect diagnostics, which #502 covers.

## Decisions

### D1: Classify from status plus a bounded read of the body

The classifier reads at most 4 KiB of the error body, as `errorType` does today. It accepts an object `{"error":{…}}` or an array whose first element is one. It returns `(code, type)`:

- `type` is the first non-empty of `error.type`, a string `error.code`, and `error.status`, clipped to 64 characters on one line as today.
- 401, 403 → `provider_auth`.
- 400 whose error marks an invalid key → `provider_auth`. "Marks an invalid key" means any of: a `details[].reason` equal to `API_KEY_INVALID`; `error.code` equal to `invalid_api_key` (OpenAI's string code); or `error.status` equal to `INVALID_ARGUMENT` with a message that contains "API key" (case-insensitive). The message is read only for this test and then dropped.
- 404 → `provider_not_found` (D2).
- 429 → `provider_rate_limited`. 5xx → `provider_error` "had a problem". Any other status → `provider_error` "refused the request". All three are unchanged.

*Alternatives considered:*
- **Treat every Gemini 400 as an auth failure.** Rejected: a 400 is also how Gemini refuses a malformed schema, which the no-tool-support check must still see.
- **Surface the provider's message.** Rejected: provider messages can echo request content (model ids are fine, but prompts and tool arguments are not), and the spec forbids it. Classifying from the message and then dropping it keeps that rule.

### D2: A new code for a provider-side 404, not a reused one

`provider_not_found` is distinct from OpenTodo's own `not_found`. The settings form already treats a *response* of 404 `not_found` as "the server rejected the test request" (`testRequestError`). The provider's 404 arrives inside a 200 test result, so the two cannot be confused, but the name makes logs and the API docs unambiguous. The fixed message names the likely fix: the model id, and for the compatible provider the base URL. The test result keeps `status: 404`.

*Alternative considered:* keep `provider_error` and only change the message. Rejected, because API and CLI callers could then not tell a configuration mistake from a refusal without parsing text.

### D3: The connection test's second request only for plain refusals

`Service.test` retries without tools when the first answer is `provider_error` with a 4xx other than 404, to detect missing tool support. After D1, an invalid Gemini key is `provider_auth` and a wrong model is `provider_not_found`, so neither triggers the retry. That makes the test send exactly one request in those cases. The device's test follows the same rule.

### D4: Trim a pasted `/chat/completions` from the compatible base URL

Owners often paste the full endpoint from a provider's docs. When the compatible base URL's path ends in `/chat/completions` (with or without a trailing slash), the server stores and tests the URL without it. The rule is the same in the save validation and the test draft merge, so the test checks what will be saved. The response's `base_url` shows the trimmed value, so the form shows it after a save. On the device, `baseUrlOf` in `web/src/lib/assistantDevice/settings.ts` applies the same trim to a model-server base URL the user typed. The owner's list of model-server origins holds origins only and is unaffected.

*Alternative considered:* refuse the value with `invalid_input`. Rejected: the intent is unambiguous, and an error for a fixable paste is friction.

### D5: Shared vectors

`web/src/lib/assistantDevice/errors.vectors.json` lists `{provider, status, body, code, type}` cases: the three Google bodies above, OpenAI's `invalid_api_key` object, an empty-body 404 for the compatible provider, a 429, a 503, and a plain 400 schema refusal. `internal/assistant` reads the file with the existing `checkFile` helper (as for `plan.vectors.json` and `prompt.vectors.json`), and `providers.test.ts` reads it in vitest.

## Data model, size and budget

- No data model, op, sync, E2EE, CalDAV or vault change. No setting is added.
- No dependency, so no effect on image size or runtime memory. The bundle grows by well under 1 KB.
- Interface budget: no new chrome, property, destination, scroll region or shortcut. The settings form shows a different sentence for the same result slot.
- Simple-list users see nothing new.

## Risks / Trade-offs

- [Google changes its error wording] → The `API_KEY_INVALID` reason and the 401/403 rule still catch most cases. A missed one falls back to today's "refused the request", never to something worse. The vectors document the bodies we rely on.
- [A compatible server uses 404 for a missing tool feature] → It reads as "no such model or endpoint" instead of `no_tool_support`, the same as today's skipped retry on 404. This is acceptable because the test already excluded 404 from that check.
- [#501's reporter's proxy problem remains] → Out of this change's reach. The issue is closed by this change's code fixes. The proxy diagnosis is already in the docs, and the reporter can reopen with the new 405 or 404 detail.

## Migration Plan

None. Saved compatible base URLs that end in `/chat/completions` are trimmed the next time the owner saves, and on every test or turn in the meantime, because the trim also runs where the provider is built.
