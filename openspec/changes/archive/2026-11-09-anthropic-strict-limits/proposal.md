## Why

Every in-app assistant turn with Anthropic fails with "the provider refused the request" (issue #1102). The server marks every tool `strict`, and Anthropic refuses a request with more than 20 strict tools or more than 24 optional parameters across them. A chat turn sends about 32 tools, and even the device's 15 tools carry 47 optional parameters. Test connection sends one tool, so it passes, and the server logs nothing for the failed turn.

## What Changes

- Anthropic requests, from the server and from the device, mark their tools strict only when the whole tool set fits Anthropic's limits (at most 20 tools and 24 optional parameters). A larger set is sent with the same schemas, not strict. The registry validates every call's arguments either way.
- A turn the provider refuses is logged on the server with the provider's status and error type, never its text.

## Capabilities

### Modified Capabilities
- `in-app-assistant`: strict tools for Anthropic only within its limits; refused turns are logged.

## Impact

`internal/assistant` (anthropic.go, schema.go), `internal/httpapi/assistant.go`, `web/src/lib/assistantDevice/providers.ts`. No new dependency; bundle size unchanged within a few bytes.
