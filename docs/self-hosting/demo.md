# Running a public demo instance

`OPENTODO_DEMO=true` turns an OpenTodo server into a public showroom: visitors click **Try the demo** on the sign-in screen and land in a **private sandbox** full of realistic data. Nobody sees anybody else's sandbox, and every sandbox is deleted after two hours without activity, a day after it was created at the latest, and every night. Features that could be abused on a public server are switched off. Without the variable nothing changes.

Use a **dedicated instance with its own empty data directory**. Demo mode is not meant to be turned on for a server that holds real accounts: the nightly reset deletes every sandbox, and the shared accounts of earlier versions are deleted on first start.

## What a visitor gets

- **Sign-in screen**: a short explanation and a **Try the demo** button. There are no credentials and no password form: the button creates a sandbox and signs the browser into it.
- **Banner** on every screen: "Demo — this sandbox is private to you and is deleted after 2 hours of inactivity. Don't store anything personal."
- **Their own copy of the sample data**, dated relative to the day the sandbox was created so it always looks current: projects with sections and a sub-project (Work → Q4 launch, shown as a board), labels, recurring tasks, subtasks, comments with a reply and an @mention, a project shared with a demo collaborator ("Sam Rivera") including assignments and edit history, saved views and a dashboard, reminders, a few completed tasks and a few items in the Trash.
- Everything else works as on any instance: quick add, editing, completing, drag and drop, filters, views, the calendar, offline use, export, Trash and history.

A visitor who comes back in the same browser while the sandbox is alive continues where they left off (the session cookie). When the sandbox has been deleted, the open tab's next request is answered `401 demo_expired`; the app deletes its local copy and shows "Your demo sandbox has expired" with **Start a new sandbox**.

## Sandboxes

Each sandbox is two accounts, both without a password, so nobody can sign into them with one:

| Account | Role | Sign-in |
| --- | --- | --- |
| Visitor `sandbox-<random>@demo.invalid` ("Alex Demo") | member | only the session issued when the sandbox is created |
| Collaborator `collab-<random>@demo.invalid` ("Sam Rivera") | member | none; it never has a session |
| Hidden owner `owner@demo.invalid` | owner | random password, discarded at creation |

Isolation comes from the ordinary sharing rules: a sandbox reads and writes its personal data and the project shared with its own collaborator. Membership changes are refused on a demo instance, so a sandbox can never share anything with another sandbox, and assignments and @mentions accept only members of the project. Notifications and activity stay inside the sandbox. Nothing is visible without a session: there is no share link and no public page.

The hidden owner exists so that "first visit creates the owner" never happens on a public URL, and so that every owner-only setting (sign-up, single sign-on, backups, CalDAV, MCP, the audit log, the two-factor policy) stays at its default. Nobody can sign in as the owner. If you need to, stop the server and use `opentodo reset-owner-password`.

### Creating a sandbox

The sign-in page gets a creation token from `GET /api/v1/auth/status` (`demo.token`): signed with a key kept in the database, valid for 10 minutes, usable once. "Try the demo" sends it to `POST /api/v1/demo/sandbox`, which also requires a same-origin request (an `Origin` header naming this server). Crawlers and link previews only fetch pages and never create a sandbox. The new sandbox is seeded through the op log, exactly like any REST write (about 570 ops, 0.1 s).

## Limits

| Limit | Default | When reached |
| --- | --- | --- |
| Live sandboxes | 500 (`OPENTODO_DEMO_MAX_SANDBOXES`) | the least recently active sandbox idle for more than 15 minutes is deleted to make room; if there is none, `503 demo_busy` "The demo is busy, try again in a few minutes" |
| New sandboxes per client address | 5 per hour | `429 rate_limited` |
| Changes per sandbox | 600 ops per hour, 5,000 in total | `429 demo_limit` on sync and REST writes, nothing of the batch is applied; the app shows a notice in the banner and keeps its changes queued |
| Stored data per sandbox | 2 MB of values in total | `429 demo_limit`, nothing of the batch is applied |
| Field size | 4 KB for every value except notes; 32 KB for task notes (`description`, `notes_doc`) | `400 invalid_input` (REST) or `400 invalid_op` (sync), like other size limits |
| Database size | above 1 GB of live data (`OPENTODO_DEMO_MAX_DB_MB`) no new sandboxes are created (expired ones are deleted at once) and live sandboxes cannot write | `503 demo_busy` for new sandboxes, `429 demo_limit` for writes |

Both variables are optional. The client address is the **last** `X-Forwarded-For` hop, the one your reverse proxy appended (as for every rate limit, see [reverse proxy](docker.md#behind-a-reverse-proxy)), or the connection address without the header. Run the demo behind exactly one proxy that appends the client address (Coolify's Traefik does) and do not publish the container port, or a client could send its own header. Only a hash of the address, salted with a value that lives in the server's memory, is stored with the sandbox; it cannot be turned back into the address and cannot be linked to it after a restart. The write budget is counted in the database, so it holds across server processes during a rolling update. The other rate limits (sign-in, comments and so on) stay in force.

## Expiry and the nightly reset

A sandbox is **idle** when it has had no authenticated request for **2 hours** (activity is recorded at most once a minute); it is deleted then, and **24 hours** after creation regardless. A cleanup job runs every **5 minutes** and deletes expired sandboxes, one transaction per sandbox: the two accounts, their sessions, ops, materialized fields, shared project and membership, notifications, purge markers, audit events about them and the sandbox's bookkeeping row. No purge markers are written, because nobody is left who could see the data. Activity is derived from ops, so it goes with them.

At **03:00 UTC** every day, and at startup when the last reset predates the most recent 03:00 UTC (for example after the server was down at that time), every sandbox is deleted the same way and the server runs `VACUUM`, so the database file shrinks back. Open tabs learn on their next request (immediately, through the live channel, when they are connected to the process that did it) and offer a new sandbox. An edit a tab made offline before the deletion is discarded with the sandbox.

The cleanup job and the nightly reset run in one server process only (the one holding the jobs lock, see [rolling updates](docker.md#updating)); sandbox creation and the limits work in every process.

To force the nightly reset, for example after changing the instance, send `SIGUSR1` to the server process that runs the background jobs: `kill -USR1 <pid>` (`docker kill --signal=USR1 <container>`). There is no HTTP route for it.

Each sandbox takes about 470 KB in the database before visitor changes; 500 live sandboxes are about 235 MB, which `VACUUM` returns every night.

## Upgrading from the shared demo account

Earlier versions gave every visitor the same account (`demo@example.com` / `opentodo-demo`) and a second member (`sam@example.com`). The first start of this version deletes both accounts with their sessions and data; the hidden owner stays. Visitors with an open tab get `401 demo_expired` and the expiry screen.

## What is switched off

Every request below is refused with `403 {"error":{"code":"demo_restricted","message":"<feature> is disabled on this demo instance."}}` before authentication, whoever sends it. The web app hides these sections in Settings (or disables the control) with a short note.

- Sign-up, invitations, user administration and owner transfer, password change and password-reset links, linked accounts, single sign-on (`/api/v1/auth/oidc/*`)
- API tokens, app passwords and CalDAV (`/dav/`, `/.well-known/caldav`), passkeys, two-factor enrolment, end-to-end encryption
- All owner settings writes (`/api/v1/settings/*`), backups, webhooks, email to task, import, the MCP endpoint (`/mcp`)
- Web push subscriptions, and any change to a project's members (add, remove, change role, leave, transfer)

The server also makes **no outbound requests** in demo mode: web push is off (as with `OPENTODO_PUSH=off`), the webhook worker, the backup scheduler and the email poller do not run, and `OPENTODO_ALLOW_SIGNUP` is ignored. Sandbox creation is the only unauthenticated write besides sign-in.

## Nothing worth posting

- Every response of a demo instance carries `X-Robots-Tag: noindex, nofollow`, and the page declares `<meta name="robots" content="noindex">` (added only in demo mode).
- Links in comments and notes render with `rel="nofollow ugc noopener noreferrer"` and open in a new tab (on every instance). The renderer drops raw HTML and links other than http(s) and mailto.
- Visitor content is only ever visible to the sandbox that wrote it.

## Docker

```sh
docker run -d --name opentodo-demo -p 8080:8080 \
  -e OPENTODO_DEMO=true \
  -e OPENTODO_BASE_URL=https://demo.example.com \
  -v opentodo-demo:/data ghcr.io/pixari/opentodo:latest
```

Or with the repository's `docker-compose.yml`: put `OPENTODO_DEMO=true` in `.env` next to it and run `docker compose up -d`. The compose file passes the variable through (`OPENTODO_DEMO=${OPENTODO_DEMO:-}`). To tune the limits, add `OPENTODO_DEMO_MAX_SANDBOXES` or `OPENTODO_DEMO_MAX_DB_MB` to the container's environment.

## Coolify

1. Create a separate resource from the repository exactly as in [Deploying on Coolify](coolify.md) (Docker Compose build pack). Do not reuse the volume of a real instance.
2. In the resource's **Environment Variables** add `OPENTODO_DEMO` = `true`.
3. Assign a domain (for example `https://demo.example.com`) and deploy.
4. Open the domain: the sign-in screen offers **Try the demo**.

The startup log says `demo mode is on`; the jobs process logs deleted sandboxes (`demo: expired sandboxes deleted`) and each reset (`demo reset: all sandboxes deleted`, with the next reset time).

## Turning it off

Remove the variable and restart. Live sandbox accounts stay in the database until you delete the data directory; since the hidden owner's password is unknown, the simplest way back to a normal instance is a fresh data directory.
