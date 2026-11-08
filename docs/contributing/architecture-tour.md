---
title: Architecture tour
summary: Follow one task edit from the click through mutate(), the outbox, the sync exchange and the op log to another device, with the file for each step.
audience: developer
section: Contributing
specs: []
screens: []
order: 2
---
# Architecture tour

One edit, followed end to end: you rename a task on your laptop and your phone shows the new title. Each step names the file to open. The reference is [Architecture](../architecture.md); the protocol is [Sync protocol](../sync.md).

## On the laptop

1. **The click.** The title field in the task panel (`web/src/app/`) calls the data layer; screens never write to the database themselves.
2. **`mutate()`** in `web/src/lib/ops.ts` turns the change into one field-level operation, `{entity: "task", entityId, field: "title", value, ts, device}`, with a hybrid logical clock timestamp (`web/src/lib/hlc.ts`). In one IndexedDB transaction (Dexie, `web/src/lib/db.ts`) it updates the local row, so the list re-renders at once, and appends the op to the `outbox`. Several changes at once go through `mutateMany()`.
3. **The exchange.** `web/src/lib/sync.ts` sends the outbox and the device's cursor in one `POST /api/v1/sync`. Offline, the op waits in the outbox; nothing is lost.

## On the server

4. **The route.** `internal/httpapi` checks the session or token through the route's policy (`internal/httpapi/policy.go`), then hands the ops to `internal/sync`.
5. **The op log.** `sync.Service.Apply` (`internal/sync/service.go`) validates each op against the schema (`internal/sync/ops.go`), resolves its sharing scope, checks the author's role, appends it to the `ops` table and keeps the winning value per field in `scope_fields`: last writer wins by `ts`, then `device`. Applying the same ops twice, or in another order, gives the same state.
6. **The answer.** The response carries the ops this device has not seen yet and its new cursor. A refused op is reported per op and never blocks the outbox.
7. **The wake-up.** After the commit, `NotifyApplied` tells every open event stream (`GET /api/v1/sync/events`) of everyone who can see the task that the cursor moved. The stream carries no data.

## On the phone

8. **The pull.** The phone's stream wakes `sync.ts`, which runs the same exchange: its outbox (empty) up, the new op down.
9. **The merge.** The client applies the op with the same last-writer-wins rule as the server, updates the row in IndexedDB, and the open list re-renders.

## What else writes

Every other writer takes the same path from step 5: the REST API and the `ot` command (`ApplyStrict`, all or nothing), CalDAV, imports, automation rules, email to task, calendar sync and AI agents. The table of writers and their device ids is in [Architecture](../architecture.md#every-write-is-an-op). Accounts, tokens, settings and membership are not ops: they are ordinary tables behind authenticated routes.

## Where to read next

- A new synced field: declare it once in `internal/sync/ops.go` `Schema` and regenerate (see `AGENTS.md`, rule 3).
- Logic that must match on both sides: [Add a shared contract](add-a-shared-contract.md).
- Background work: one entry in `internal/tenant/jobs.go` ([Background work](../architecture.md#background-work)).
