# Proposal

## Why

People who track work in GitHub or GitLab keep two lists: the issues assigned to them there, and everything else here. The issues never show up in Today, Next or the weekly review, so the day is planned around half the work. OpenTodo already has every piece this needs: a server that fetches other people's data on a schedule under the owner's outbound policy (`calendar-feeds`), tasks created by the server through the op log (`email-capture`), per-user secrets kept out of the API, and, with the sibling change `task-origin`, an additive `origin` on tasks that says where a task came from. Issue import puts them together: a user connects an account with a personal access token, and their open issues become tasks that complete when the issue closes.

## What Changes

- **Issue connections**, per user, under Settings → Integrations → Issues: a provider (`github` or `gitlab`), a host (github.com, gitlab.com or a self-hosted instance, checked by the outbound policy shared with webhooks and calendar subscriptions), a personal access token stored in the server's secrets directory and never returned by any API, a filter (issues assigned to the user by default; optionally a list of repositories or projects and a list of labels), a target project in OpenTodo, whether issue labels become OpenTodo labels, and a poll interval of at least 15 minutes. At most 5 connections per user.
- **An owner switch** `integrations.issues`, off by default like `mcp.enabled`: while off, every `/api/v1/issues` route answers 404 and nothing is polled. Every signed-in user reads it; only the owner changes it; the change is audited.
- **A poller** on the jobs leader (a self-hosted server's background jobs, the host's shared scheduler): for each enabled connection it lists the matching issues with conditional requests (`ETag`/`If-None-Match`) and an updated-since cursor, creates one task per new open issue (title, the body as notes cut like email to task, labels mapped when asked, `origin` with the provider, the issue reference and its URL), completes the task when the issue closes, reopens it when the issue reopens, re-titles it when the issue is renamed, and never deletes anything. Every write goes through the op log with device `issues:<connection-id>`, so devices get the tasks on their next sync and the user's own edits converge by last-writer-wins. Each field follows the issue only when the issue changed since the poller last saw it, so a user's rename or completion is not overwritten until the issue itself changes.
- **Limits and failure handling**: a bounded page count per run, at most two polls in flight per server, the provider's own rate-limit answers honoured, doubling backoff to 6 hours after failures, a connection stopped (no more polls) when the token is refused or the host turns private, and the last error with its time on the connection card. `POST .../sync` and `POST .../test` run a poll or a token check now, rate limited per user.
- **Encrypted accounts**: a connection cannot be created or enabled for an account with end-to-end encryption (409 `encryption_enabled`), and enabling encryption stops existing connections, as for the weekly digest. The server would otherwise write issue titles and bodies into the op log in plaintext on every poll.
- **Demo**: every `/api/v1/issues` route and the settings route are refused with 403 `demo_restricted` before authentication, so the demo never contacts a visitor's host; the panel shows the demo note.
- **Audit**: `issue_connection.created`, `issue_connection.updated` (which setting, never its value for the token) and `issue_connection.deleted`, plus `settings.changed` for the owner switch. Hosts, tokens, filters and issue content never reach the log.
- **CLI and MCP**: `ot issues list` prints the caller's connections and their state without secrets; `ot issues sync [<id>]` runs one poll now and prints what it created, completed, reopened and renamed. The MCP server exposes a read-only `opentodo://integrations/issues` resource with the same state and no secrets.
- **Nothing is written back** to the provider in this change: no comments, no closing, no labels, no time entries. No webhook from the provider into OpenTodo, no OAuth app: the token is the only credential.
- No new dependency (stdlib HTTP and JSON over the existing outbound client), no new environment variable, no change to the op log schema (this change reads `origin` as `task-origin` defines it and adds no field). Not **BREAKING**.

Out of scope: other issue trackers (Jira is the natural next provider, as a separate change on the same connection model), write-back of any kind, provider webhooks, OAuth, importing closed issues as completed tasks on the first run, merge or pull requests, milestones and due dates from the provider, assignees other than the connected account, comments as OpenTodo comments, and an in-app view of issues that are not tasks.

Advances ROADMAP.md: "Integrations and data ownership" (the outbound family of `webhooks` and `calendar-feeds`, under the same owner policy) and the gaps the comparison pages concede to Linear, where issue-tracker integration is listed as missing.

Depends on the change `task-origin` (the additive `origin` object `{kind, provider, id, url, title}` on tasks and how screens show it); this change writes `origin` and adds nothing to it.

## Capabilities

### New Capabilities

- `issue-connections`: the owner switch, per-user connections and their fields, token handling, the outbound policy, the poll schedule and backoff, how an issue becomes and follows a task, limits, the management API, the Settings panel, and the refusals for encrypted accounts.

### Modified Capabilities

- `webhooks`: the "Private network policy shared with calendar subscriptions" requirement also governs issue connection hosts, and Settings names all three features beside the toggle.
- `demo-mode`: issue connections are refused on the demo before authentication, like calendar feeds (ADDED requirement).
- `audit-log`: issue connection events and what they may carry (ADDED requirement).
- `multi-tenant-host`: "Background work scales with due work" includes issue polls; they run on the shared scheduler only for tenants with a poll due.
- `end-to-end-encryption`: issue connections are refused and stopped for an encrypted account (ADDED requirement, beside the calendar feeds one).
- `cli-client`: `ot issues list|sync` (ADDED requirement).
- `mcp-server`: the `opentodo://integrations/issues` resource (ADDED requirement).

## Impact

- Server: new package `internal/issues` (store, two provider clients on `internal/outbound`, the mapping of issues to ops, the poller), migration `internal/store/migrations/0039_issue_connections.sql` (`issue_connections`, `issue_links`), tokens in `<data>/secrets/issues.json` through `settings.SecretsFile`, routes in a new `internal/httpapi/issues.go` registered through `routes.handle` with `.demoDenied()` and a matching deny-list entry in `internal/httpapi/demo.go`, the owner switch `integrations.issues` in the settings store, audit constructors in `internal/audit/events.go`, wiring in `internal/tenant/tenant.go` (`StartJobs`) and `internal/host/scheduler.go` (a `KindIssues` entry), the body-fit helper moved out of `internal/email/parse.go` so both features cut notes the same way.
- CLI: `ot issues list|sync` in `internal/cli` with their schemas. MCP: one resource in `internal/mcp/resources.go`.
- Web: `web/src/app/IssuesPanel.tsx` in the Integrations section of `web/src/app/SettingsView.tsx`, types in `web/src/lib/types.ts`, API methods in `web/src/lib/api.ts`, a story and tests, strings in the six catalogs.
- Specs: `openspec/specs/issue-connections/spec.md` (new) and deltas on the seven capabilities above. Docs: a new `docs/issue-import.md`, plus `docs/api.md`, `docs/cli.md`, `docs/mcp.md`, `docs/e2ee.md`, `docs/settings-data.md`, `docs/self-hosting` (the demo deny list), `docs/README.md`.
- Size: the server binary grows by about 300 KB (two small REST clients, the poller, the store, handlers and the CLI command, all stdlib; the figure goes into the design); the web bundle by about 6 KB gzipped for the panel; runtime memory is unchanged while no connection exists and about one HTTP client plus one page of issues per poll in flight otherwise. No new container layer or dependency.
- Outbound traffic: only to hosts a user typed and the owner's policy allows, only while the owner switch is on, never on the demo.
