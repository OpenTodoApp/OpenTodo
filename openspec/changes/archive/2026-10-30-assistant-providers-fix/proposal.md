# Proposal

## Why

Issue #501: an owner on v0.15.0 behind Caddy selected **Test connection** for Google Gemini and got `{"error":{"code":"not_found","message":"unknown API route"}}`, while OpenRouter through the compatible endpoint worked on the same server.

What the code says about that report:

- **The message is OpenTodo's own 404, not Gemini's.** It is the catch-all `/api/` handler (`internal/httpapi/router.go`), which in v0.15.0 answered every unmatched method and path with exactly that text. `POST /api/v1/settings/assistant/test` is registered unconditionally (`internal/httpapi/assistant.go`). The provider name is read from the JSON body only after routing, so no provider value can make that route miss. The web client (`web/src/lib/api.ts` `request`) never changes the method and retries only after a 403 `reauth_required`. So the request that produced the reply arrived as something else: a `GET` (a 301/302 redirect in front of the server), or a path with a trailing slash. Since #502 (`api-method-not-allowed`), that case answers 405 or a 404 naming the method and path, and the settings form says the provider was not asked. The reporter has not yet confirmed their proxy setup, so the issue stays open for that.
- **Gemini's own failures were also hard to read.** Tracing the Gemini path after the route turned up three defects. They are specific to Google's endpoint and to compatible endpoints, and they make a misconfigured provider look like "the request was refused" or like the server's own "not found". Each was checked against `generativelanguage.googleapis.com` on 2026-10-29:
  1. Google answers errors as a **JSON array**, `[{"error":{"code":400,"message":"…","status":"INVALID_ARGUMENT"}}]`. `errorType` in `internal/assistant/chat.go` only reads an object, so the error type is lost.
  2. Google answers an **invalid API key with HTTP 400** `INVALID_ARGUMENT` ("Please pass a valid API key"), not 401/403. `providerErr` therefore reports "the provider refused the request" instead of `provider_auth`. The test then sends a pointless second request without tools (`Service.test`), and on a turn the owner is never pointed to the key.
  3. An **unknown model or a wrong path is a 404** (Google: `NOT_FOUND`, or an empty body for a wrong path; a compatible base URL without `/v1`, or with `/chat/completions` already appended, behaves the same). This becomes the generic "the provider refused the request (HTTP 404)". It does not say to check the model id or base URL, and an owner reading "404 … not found" reasonably blames OpenTodo's routing.
- The on-device assistant (`web/src/lib/assistantDevice/providers.ts` `statusError`) classifies errors from the same status-only rule and has the same three gaps.

## What Changes

- **One error classifier for Chat Completions providers, on the server and the device.** It reads an error body as an object or as a one-element array. It takes the type from `error.type`, a string `error.code`, or Google's `error.status`. A 400 whose error says the API key is invalid (Google's `API_KEY_INVALID` reason, or an `INVALID_ARGUMENT` message naming the API key) is `provider_auth`, like 401/403. The provider's message is used only to classify and is never shown, logged or stored.
- **A provider-side 404 gets its own code, `provider_not_found`**, with a fixed message: "the provider has no such model or endpoint (HTTP 404): check the model id". For the compatible provider, the message adds "and the base URL (it usually ends in /v1)". It never contains the provider's text.
- **The connection test stops retrying without tools after an auth or not-found answer.** Only a plain `provider_error` 4xx still triggers the no-tool-support check, as today.
- **A compatible base URL that already ends in `/chat/completions` is trimmed to its base** on save and on test, and the trimmed value is what the form then shows. Today the server appends the path a second time and gets a 404.
- Shared test vectors (status + body → code, type) pin the Go and TypeScript classifiers to the same answers.

Out of scope:
- Reverse-proxy behaviour: already diagnosed by #502.
- New providers, model lists fetched from providers, and Gemini's native (non-OpenAI) API.
- Showing the provider's own error text.

Advances ROADMAP-1.0 0.17 item `assistant-providers-fix`.

Fixes #501

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `in-app-assistant`: new requirements "Provider errors are read the same for every Chat Completions provider" and "Compatible base URL without the request path". The existing requirements and scenarios are unchanged.

## Impact

- **Code:** `internal/assistant/chat.go` (`errorType` → a classifier returning code and type), `internal/assistant/provider.go` (`providerErr`, the new `CodeProviderNotFound`), `internal/assistant/service.go` (`test` skips the no-tools retry for auth and not-found), `internal/assistant/config.go` (base URL trim in validation and the draft merge), `web/src/lib/assistantDevice/providers.ts` (`statusError` reads the body), and `web/src/app/assistant` for the new code's display (it reuses the message, no new UI).
- **API:** `provider_not_found` is a new value of `code` in the test result and in the turn's `event: error`. This is additive: clients that do not know it show the message as they do for `provider_error`. `docs/api.md` lists it.
- **Data model, ops, sync, E2EE, CalDAV, vault, CLI, MCP:** none. No route, no setting, no environment variable. Nothing is **BREAKING**.
- **Size:** a few dozen lines in Go and TypeScript, plus one vectors JSON file used only by tests. No dependency.
