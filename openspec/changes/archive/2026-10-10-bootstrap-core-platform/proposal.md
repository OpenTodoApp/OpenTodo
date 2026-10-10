# Proposal

## Why

OpenTodo wants to replace Todoist for people who refuse subscriptions and lock-in, but nothing exists yet: no server, no client, no sync, no way to deploy. Every later feature (natural-language capture, recurring tasks, sharing, CalDAV, encryption) needs a place to live. This change delivers the walking skeleton: a deployable, usable, local-first task manager with the architectural decisions that are hardest to retrofit (op-log sync, single-binary hosting, auth-by-default) made and proven end to end.

## What Changes

- A Go server with an embedded SQLite database that stores an append-only log of field-level operations and materializes current values with per-field last-writer-wins.
- A React progressive web app, embedded in the server binary, that keeps a full copy of the user's data in IndexedDB, applies every edit locally first, and syncs the resulting operations with the server in the background.
- Account bootstrap: the first visitor creates the owner account; sign-in with email and password; sessions; sign-up closed by default afterwards.
- Task and project management: Inbox, Today, Upcoming, Completed and per-project views; quick add; title, notes, project, priority, floating due date and time; complete / reopen / delete; keyboard shortcuts.
- An authenticated REST API with API tokens whose writes go through the same operation log, plus a full JSON export.
- Single distroless container with a health check, `docker-compose.yml` that Coolify can deploy with zero configuration, and a CI pipeline that tests, builds and publishes multi-arch images.

Out of scope for this change (tracked in ROADMAP.md): natural-language parsing, subtasks, labels UI, filters, recurrence, reminders, sharing, comments, CalDAV, webhooks, import, backups, passkeys, OIDC, MFA, end-to-end encryption, real-time push between devices.

This change advances ROADMAP.md items in sections 1 (core engine), 2 (REST API), 3 (projects and views), 4 (floating due dates), 6 (export) and 7 (owner setup, sessions, rate limiting).

No breaking changes; this is the first version of the op log format (fields listed in design.md).

## Capabilities

### New Capabilities
- `account-access`: who may use a server: first-run owner setup, sign-up policy, sign-in and sessions, API tokens, request-origin protection.
- `task-management`: the task entity and its lifecycle: create, edit fields, prioritise, schedule with floating dates, complete, delete.
- `project-organization`: projects as containers for tasks: creation, rename, colour, archive, delete, Inbox as the default container.
- `offline-first-sync`: local-first storage, the operation log, convergence rules, the sync exchange and offline behavior.
- `http-api`: the authenticated JSON API surface: collections, write-through semantics, error format, export.
- `web-app`: the installable client: views, quick add, keyboard navigation, sync status, settings.
- `self-hosting`: deployment contract: single container, data directory, configuration, health, security headers, footprint, Coolify compatibility.

### Modified Capabilities
- none (greenfield)

## Impact

- New repository layout: `cmd/opentodo`, `internal/{config,store,auth,sync,httpapi,web,ids}`, `web/`, `docs/`, `Dockerfile`, `docker-compose.yml`, `Makefile`, `.github/workflows/ci.yml`.
- New external dependencies: Go — `modernc.org/sqlite` (pure Go SQLite), `golang.org/x/crypto` (argon2id). Web — React 19, Dexie 4, Tailwind 4, vite-plugin-pwa; dev-only Vite, Vitest, fake-indexeddb.
- Public surfaces introduced: HTTP API `/api/v1/*` and `/healthz`, the sync protocol, the `OPENTODO_*` environment variables, the `/data` volume, the `ghcr.io/pixari/opentodo` image.
