# Running a public demo instance

`OPENTODO_DEMO=true` turns an OpenTodo server into a public showroom: visitors click **Try the demo** on the sign-in screen, land in an account full of realistic data, and everything they change is wiped every night. Features that could be abused on a public server are switched off. Without the variable nothing changes.

Use a **dedicated instance with its own empty data directory**. Demo mode is not meant to be turned on for a server that holds real accounts: the demo accounts are public, and the nightly reset deletes everything they hold.

## What a visitor gets

- **Sign-in screen**: the demo credentials (`demo@example.com` / `opentodo-demo`) and a **Try the demo** button that signs in with them.
- **Banner** on every screen: "Demo instance — data resets every night, don't store anything private."
- **Seeded data**, dated relative to the day it was seeded so it always looks current: projects with sections and a sub-project (Work → Q4 launch, shown as a board), labels, recurring tasks, subtasks, comments with a reply and an @mention, a project shared with a second demo member ("Sam Rivera") including assignments and edit history, saved views and a dashboard, reminders, a few completed tasks and a few items in the Trash.
- Everything else works as on any instance: quick add, editing, completing, drag and drop, filters, views, the calendar, offline use, export, Trash and history.

All visitors share the same demo account, so they can see each other's changes until the next reset.

## Accounts

| Account | Role | Sign-in |
| --- | --- | --- |
| Demo account `demo@example.com` | member | public password `opentodo-demo` |
| Second member `sam@example.com` | member | random password, never shown |
| Hidden owner `owner@demo.invalid` | owner | random password, discarded at creation |

The demo account is deliberately **not** the server owner. The hidden owner exists so that "first visit creates the owner" never happens on a public URL, and so that every owner-only setting (sign-up, single sign-on, backups, CalDAV, MCP, the audit log, the two-factor policy) stays at its default. Nobody can sign in as the owner. If you need to, stop the server and use `opentodo reset-owner-password`.

## Nightly reset

At **03:00 UTC** every day, and at startup when the data was seeded before the most recent 03:00 UTC (for example after the server was down at that time), the server:

1. deletes every task, project, section, label, view, reminder, comment and per-project preference the two demo accounts hold, plus the shared project with its membership and their in-app notifications;
2. leaves a purge marker for every removed entity in each demo account's personal scope (the same mechanism as emptying the Trash, see [Purge](../sync.md#purge));
3. seeds fresh data through the op log, exactly like any REST write, and wakes connected devices.

Open browsers recover on their own: their next sync (immediately, through the live channel) reports the old entities as purged and the old shared project as gone from the membership list, so the device drops them and pulls the new seed. Sessions are kept, nobody is signed out. An edit a device made offline before the reset is discarded when it arrives, because the entity it targets was purged.

To force a reset, for example after changing the instance, send `SIGUSR1` to the server process: `kill -USR1 <pid>` (`docker kill --signal=USR1 <container>`). There is no HTTP route for it.

Accounts, sessions and the audit log are kept across resets; the database does not grow with visitor data. Purge markers (about 100 small rows per reset) are kept, like every purge marker.

## What is switched off

Every request below is refused with `403 {"error":{"code":"demo_restricted","message":"<feature> is disabled on this demo instance."}}` before authentication, whoever sends it. The web app hides these sections in Settings (or disables the control) with a short note.

- Sign-up, invitations, user administration and owner transfer, password change and password-reset links, linked accounts, single sign-on (`/api/v1/auth/oidc/*`)
- API tokens, app passwords and CalDAV (`/dav/`, `/.well-known/caldav`), passkeys, two-factor enrolment, end-to-end encryption (it would lock every other visitor out)
- All owner settings writes (`/api/v1/settings/*`), backups, webhooks, email to task, import, the MCP endpoint (`/mcp`)
- Web push subscriptions, and any change to a project's members (add, remove, change role, leave, transfer)

The server also makes **no outbound requests** in demo mode: web push is off (as with `OPENTODO_PUSH=off`), the webhook worker, the backup scheduler and the email poller do not run, and `OPENTODO_ALLOW_SIGNUP` is ignored. Rate limits (sign-in, comments, invitations and so on) stay in force.

## Docker

```sh
docker run -d --name opentodo-demo -p 8080:8080 \
  -e OPENTODO_DEMO=true \
  -e OPENTODO_BASE_URL=https://demo.example.com \
  -v opentodo-demo:/data ghcr.io/pixari/opentodo:latest
```

Or with the repository's `docker-compose.yml`: put `OPENTODO_DEMO=true` in `.env` next to it and run `docker compose up -d`. The compose file passes the variable through (`OPENTODO_DEMO=${OPENTODO_DEMO:-}`).

## Coolify

1. Create a separate resource from the repository exactly as in [Deploying on Coolify](coolify.md) (Docker Compose build pack). Do not reuse the volume of a real instance.
2. In the resource's **Environment Variables** add `OPENTODO_DEMO` = `true`.
3. Assign a domain (for example `https://demo.example.com`) and deploy.
4. Open the domain: the sign-in screen shows the demo credentials and **Try the demo**.

The startup log says `demo mode is on` and logs each reset (`demo data reset`, with the next reset time).

## Turning it off

Remove the variable and restart. The demo accounts and their data stay in the database; since the hidden owner's password is unknown, the simplest way back to a normal instance is a fresh data directory.
