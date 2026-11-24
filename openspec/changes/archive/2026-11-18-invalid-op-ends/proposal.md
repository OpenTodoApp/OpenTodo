## Why

Issue #1532. Since `sync-invalid-op-alone` (#1475), the server refuses one op it cannot accept, with reason `invalid`, and applies the rest. The web app keeps every `invalid` op and offers it again every minute. That retry is right only for a field the server doesn't know, which a later server may accept. Most `invalid` refusals are verdicts on a value the server knows and will refuse on every retry: a link `net/url` rejects, a slot over `MaxSlotMinutes`, an impossible date, a reserved device. Such a change never leaves the device, the status reads "Sync error" for good, nothing lets the person clear it, and other devices show the entity without that field.

## What Changes

- **Two reasons.** The server refuses an op for an entity or field it doesn't know with the new reason `unknown_field`. Every other op it can't accept (a value a rule refuses, a device only the server may write) is still refused as `invalid`.
- **`invalid` ends.** The answer carries the field's server value, as for any refused op, except for a request limited to workspaces. The device drops the change like a `forbidden` one: the server's value wins, or the field's default if the server has none. The dismissable "not accepted" notice says "(this server could not accept the value)" and names the task. Nothing is held, so no error stays.
- **`unknown_field` is held** as `invalid` was: the change stays, is offered again every minute, and the status shows the error with the same sentence.
- **Changes already held** by a build of main since #1475 go out with the next retry, come back as `invalid`, and end.

## Capabilities

### Modified Capabilities

- `offline-first-sync`:
  - "Field-level operations" gets the two reasons.
  - "An invalid refusal keeps the change on the device" becomes "A refusal on an unknown field keeps the change on the device", with a scenario for the verdict case.

## Impact

- **Server:** `internal/sync/validate.go` (`SplitInvalid`, `ReasonUnknownField`, `WithInvalidRefused`), `internal/sync/apply.go` (restore of pre-refused ops), and `internal/httpapi/sync_handlers.go`.
- **Web:** `web/src/lib/limits.ts`, `sharing.ts` and `sync.ts`, plus one new string in every shipped language.
- **Docs:** `docs/sync.md` and `docs/build-a-client.md`.
- **Additive:** a client without `invalid_ops` sees no change. A client from #1475 that receives `unknown_field` treats it as a refusal on the merits and drops the change, which is safe, because the web app is served by its own server.
- **Not in this change (follow-ups from #1532):**
  - a list of held changes with a Discard action;
  - dropping a held op once a newer write replaces it;
  - client checks pinned to the server's value rules;
  - `invalid_ops` for the Obsidian plugin and `ot vault`.
