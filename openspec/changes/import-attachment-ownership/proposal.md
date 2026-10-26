# An import never links a file another account stored

## Why

Importing a ZIP export stores each attachment file under the attachment's original id. When a file with that id was already stored, `blobs.Write` answered `ErrExists` before checking size or digest, and the importer counted that as stored: it wrote the attachment row, marked it uploaded as the server, and the content route then served whatever file the id named. With an attachment id of another account (task pages publish them), a signed-in user could read that account's file, and the other account could no longer purge it while the new row referenced it (security audit finding M2, found in an internal audit). The sync change for H1 stops the duplicate row from being created at all; this change closes the file side on its own.

## What Changes

- `blobs.Store.Matches(id, spec)` reports whether the stored file has exactly that size and SHA-256 digest.
- When `blobs.Write` meets an existing file during an import, the importer links it only when the importing account itself sees an attachment with that id that the server marked uploaded, with the same size and digest, and the stored bytes match. Otherwise the row is refused ("another file with this id is stored on this server"), nothing is written for it, and the stored file is untouched.
- In practice the planner only creates attachments the account does not see, so an existing file is now refused in every case but a race with the account's own upload.

Not **BREAKING**: no op, API or variable changes.

Out of scope: making ids unique across accounts (H1, a separate change). Advances the 0.14.1 security release (no ROADMAP item).

## Impact

- `internal/blobs/blobs.go` (`Matches`), `internal/importer/service.go` (`storeFiles`, `ownStoredFile`); tests in `internal/blobs` and `internal/importer/attachments_test.go`.
- `docs/import.md`, CHANGELOG.
