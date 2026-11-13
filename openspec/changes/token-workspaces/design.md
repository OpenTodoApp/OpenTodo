# Design

## D1. Stored with the token, fixed for its life

`api_token_workspaces(token_id, workspace_id, PRIMARY KEY(token_id, workspace_id))`, rows written in the same transaction as the token, deleted with it. No rows means all workspaces. The default workspace is stored by its id like any other (the `workspaces` change). A token's workspaces are never edited: a restriction that can be widened later by a stolen token's holder is not a restriction, and a new token is one click.

**Downgrades fail safe.** A binary from before this change would ignore the rows and give the token the whole account. So a restricted token's secret starts with `otw_` and is stored as the hash of a prefixed value: an older binary hashes the secret as it is, finds no token and answers 401. A downgrade makes a restricted token stop working; it never widens it.

Removing a workspace (deletion, losing membership) leaves its row; it then matches nothing. A token whose every workspace is gone sees nothing and creates nothing (403 `token_restricted` on creates).

## D2. One reach on the request, applied in the sync service

The auth middleware loads the token's workspaces into the caller (`httpx.Caller.Workspaces []string`, nil = all). Handlers do not filter by hand. `sync.WithReach(ctx, sync.Reach{Workspaces: ...})` puts it on the context, and the sync service applies it in every read (`List`, `ListWhere`, `ListIDs`, `Get`, `FieldValues`, `LastChanged`, `FieldTS`) and in `ApplyStrict`. A read without a reach on the context is unchanged, so the web app, sync and background jobs are untouched.

Where an entity is (`reach.go`), read from the materialized rows:

| Entity | Its workspace |
| --- | --- |
| project | `workspace_id` (null = the default workspace) |
| task | its project's workspace; without a project, its `workspace_id` (an Inbox) |
| section, field, project_prefs | their project's |
| note, rule | their project's when they have one, else `workspace_id` |
| label, view | `workspace_id` |
| reminder, comment, attachment, time_entry | their task's |
| user_prefs, theme | readable everywhere, never writable |
| frame, slot, place, objective, memory, review | outside every restriction: not listed, not written |

A task in a shared project of another person is placed by that project's workspace as the member sees it (the membership's workspace), the same rule `syncscope` uses for CalDAV.

## D3. Writes

`ApplyStrict` with a reach checks each op's entity: an existing entity must be inside; a new one is placed by the fields of the batch (its `workspace_id`, `project_id` or `task_id`), else by the reach's first workspace, which the planner writes explicitly (`agenttools` and the REST create handlers fill `workspace_id` before planning). A move (a change of `project_id`, `workspace_id` or `task_id`) must end inside. A refused op refuses the batch with 404 `not_found` for an existing entity outside (no existence leak) and 403 `token_restricted` for a destination outside.

## D4. Fail closed at the router

A policy modifier `.workspaces()` marks a route as applying the reach. The middleware answers 403 `token_restricted` to a restricted token on any route without it, before the handler. `policy_test.go` lists the marked routes, so a new route is closed until someone marks it on purpose. Marked: the task, project, section, label, view, note, comment, reminder, attachment, time-entry and field routes, search, `GET /api/v1/workspaces`, `/mcp`. Not marked: `/api/v1/sync` (it streams the whole op log), export, import, settings, members, workspace management, tokens, app passwords, backups, the assistant, routines, digest, calendar sync, issues, `/dav/`.

MCP: the transport passes the reach on the context. Tools over account-wide records (`list_frames`, `list_slots`, `list_objectives`, `find_free_time`'s frames and slots, memories, reviews, routines) answer `token_restricted`; `list_workspaces` lists the reach. `find_free_time` still counts calendar events and timed tasks inside the reach.

## D5. OAuth

The consent page lists the person's workspaces with **All workspaces** checked; unchecking it shows the list. The grant stores the choice, and every access token minted from it carries it (`api_token_workspaces` rows for the minted token). Refreshing keeps it.

## D6. What is not covered

The owner's own server-level views (logs, metrics) are not tokens. A restricted `admin` token keeps the admin routes closed by D4, so restricting an admin token makes it a `full` token of those workspaces in practice; Settings says so.

## Size

One table, one Go file in `internal/sync` (~250 lines), a policy modifier, the consent and token dialog changes. No dependency, no bundle change beyond the dialog (~1 KB).
