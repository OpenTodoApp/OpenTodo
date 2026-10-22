# Design

## Context

`markUploaded` wrote the op with `s.opTS()` (`Service.ServerTS`, greater than any timestamp the server issued, but not than a device's). A device creates the row with every field, `uploaded_at: null` included, at its own HLC time; `/api/v1/sync` accepts timestamps up to five minutes ahead of the server. LWW in `scope_fields` keeps the greater timestamp, so a server op issued within the device's lead is dropped: `ApplyResult.Applied` is 0 and the handler still answered 204. `members.go` already solves the same problem for `assignee_id` with `ServerTSAt(max(now, stored+1))`.

## Decisions

**D1. Beat the stored field.** `Service.FieldTS(ctx, user, entity, id, field)` reads the winning timestamp of one field over the user's visible scopes (the reader connection, like `Get`); `markUploaded` writes with `ServerTSAt(max(now, fieldTS+1))`. The timestamp stays within the skew window because the stored one was admitted under it. Alternative: write with `now + MaxFutureSkewMs`. Rejected: a fixed lead would still lose to a device further ahead and skews the history of every upload.

**D2. No silent success.** `Applied == 0` is an error: the handler removes the stored file and answers 500, and the device's upload pass keeps the blob and retries. Alternative: keep 204. Rejected: that is the bug's shape.

## Data model

None.
