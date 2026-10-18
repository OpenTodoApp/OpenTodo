# Design

## D1 Two kinds of links
- **Mailed links** (`mailLinkOrigin`) grant access and leave the server: an anonymous caller can trigger some of them. They use `cfg.Origin()` only. Without a base URL, every flow that would mail one answers 409 `base_url_required` before anything is created (reset, invitation and sign-up rows included), and nothing is sent. The check comes after the `smtp_disabled` check, so a server without email still answers as before. The anonymous reset route reveals only server configuration, never anything about an account.
- **Shown links** (`publicOrigin`) are returned to the authenticated user who asked for them. Their host comes from that user's own request, so they keep using the request's origin when no base URL is set, and LAN installs keep working.
- The SMTP test message and the weekly digest name the origin but grant nothing, so they are unchanged.

## D2 Forwarded headers
`requestHost` and the scheme in `publicOrigin` read `X-Forwarded-Host`/`-Proto` only when `RemoteAddr` is inside the `OPENTODO_TRUSTED_PROXIES` prefixes (the `cloudflare` keyword's ranges included). `originAllowed` uses the same helper, so one rule applies to every forwarded host. `clientIP` (X-Forwarded-For) is not changed.

## D3 Owner warning
`/api/v1/me` adds a `config_warnings` entry for `OPENTODO_BASE_URL` while outgoing email is enabled and no base URL is set. It is computed per request because SMTP can be configured at run time in Settings. The existing notice shows it, and no client change is needed.

## D4 Entity id charset
`ValidEntityID`: 1–64 bytes from `[A-Za-z0-9._:@+=~-]`. The web client makes UUIDs and name-derived UUIDs; the server makes `ids.New`/`NameID`; the CalDAV `usableID` UIDs are a subset of the allowed set; the user preferences row is `"me"` and weekly reviews use week keys. Only new ops are checked, and stored rows are not rewritten. `QuoteJSON` (json.Marshal) replaces `%q`, `strconv.Quote` and the old `quoteID`. For allowed ids its output is byte-identical to what clients store, so the value lookups in trash and comments still match.

## D5 Project id conflicts
`share` counts `project` rows with the same id in other `user:` scopes and refuses with `ErrProjectIDConflict` (409 `project_id_conflict` on member routes, the uniform 404 `invitation_invalid` on invite acceptance). Once a project is shared, `projectRole` already takes the role from `project_members` and the resolver sends every write on that id to the project scope, so no second owner can appear. A contested id cannot be shared by either account; the owner can duplicate the project and share the copy.

## D6 Attachments
`share` relabels each moved task's attachments (`childIDsWhere(..., "attachment", "task_id", ...)`) the same way it relabels comments. SQL migration `0035_shared_attachments` handles projects that were shared earlier. It finds attachments in a `user:U` scope whose task lives in a `project:P` scope, when U is a member of P and `user:U` no longer holds the task. It moves their `scope_fields` and `op_scopes` labels and deletes `member_backfills` rows of the affected projects, so members' devices replay that history once (ops keep their seq, which is behind those devices' cursors). Running it again finds nothing to move. If another branch also adds migration 0035, renumber this one when merging; its test finds the file by name suffix.

Data model: no new fields and no op change. Image size and memory: unchanged, with no new dependency. UI: two new translated error messages, and the "Forgot password?" screen treats `base_url_required` like a server that sends no email. No new chrome or shortcuts.
