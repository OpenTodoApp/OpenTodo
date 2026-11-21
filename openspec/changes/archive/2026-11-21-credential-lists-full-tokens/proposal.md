# Proposal

## Why

The account's API tokens (`GET /api/v1/tokens`) and the AI apps connected over OAuth (`GET /api/v1/me/oauth-grants`) answered every signed-in credential, so a `read` or an `agent` token could list the account's other credentials. `/api/v1/me/agent-access` already refuses those tokens. The same rule fits these lists: a script or an assistant with a narrow token has no need to see which other tokens and apps the account has.

## What Changes

- `GET /api/v1/tokens` and `GET /api/v1/me/oauth-grants` answer a session, a `full` or an `admin` token, and refuse `read` and `agent` tokens with 403 `insufficient_scope`.
- `docs/stability.md` says that a security fix may refuse read or agent tokens on a route that lists the account's credentials or connected apps, and the v1 surface records the two routes' policy.

## Capabilities

### Modified Capabilities

- `account-access`: "API tokens" says who may list tokens.
- `mcp-server`: "Connected apps in Settings" says who may list connected apps.

## Impact

- `internal/httpapi`: two route policies (`.FullTokens()`), a test, the v1 surface, the OpenAPI description. No data, op or client change: the web app lists both with its session, and `ot` uses a full token.
