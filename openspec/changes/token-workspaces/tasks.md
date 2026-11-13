# Tasks

## 1. Storage and auth
- [x] 1.1 Migration `api_token_workspaces`; `auth` creates tokens with workspaces (checked as the person's), lists them, deletes them with the token.
- [x] 1.2 The caller carries the workspaces; `httpx.Policy.Workspaces()`; the middleware refuses a restricted token on unmarked routes (`token_restricted`); `policy_test.go` lists the marked routes.

## 2. Enforcement
- [x] 2.1 `sync.Reach` on the context; `reach.go` places every entity kind (table in design D2); every read filters; tests per entity kind.
- [x] 2.2 `ApplyStrict` with a reach: existing entities inside, new ones placed, moves inside; 404 vs 403 as in D3; tests.
- [x] 2.3 REST create handlers and `agenttools` planners write the first workspace when none is given.
- [x] 2.4 MCP: reach on the context; account-wide tools refused; `list_workspaces` and resources filtered; tests over every tool name in the registry (a new tool is covered or fails the test).

## 3. Surfaces
- [ ] 3.1 Settings → API tokens: **Workspaces: All / Only these** in the create dialog; the list names them; strings in every locale.
- [ ] 3.2 OAuth consent: the workspace choice; grants and minted tokens carry it; refresh keeps it.
- [ ] 3.3 `ot tokens create --workspace` (repeatable) and the list column.
- [ ] 3.4 Docs (`docs/api.md`, `docs/mcp.md`, `docs/cli.md`), changelog, `/security-review` of the diff.
