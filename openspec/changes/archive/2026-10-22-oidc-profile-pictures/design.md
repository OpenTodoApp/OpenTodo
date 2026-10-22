# Design

## Context

`handlePutAvatar` accepts a 256×256 PNG or JPEG the browser cropped, re-encodes it and bumps `user_profiles.avatar_version`; `handleGetAvatar` serves `<data>/avatars/<id>.jpg` at a versioned address. `oidc.Claims` reads `email`, `name` and `preferred_username`; the callback runs `MatchOrProvision` and issues the session. Nothing records where a picture came from.

## Decisions

**D1. Owner switch, off by default.** The fetch is an outbound request to an address the provider names, often on another host than the issuer (Google's `lh3.googleusercontent.com`, GitHub's avatars host). It happens only once the owner turns `syncPictures` on, and through `internal/outbound` with the same private-target rule the calendar feeds and webhooks use. Alternative: on whenever the `profile` scope is requested. Rejected by rule 5: the owner states which outbound targets are acceptable.

**D2. Provenance on the profile row.** `user_profiles` gains `avatar_source` (`upload`, `provider` or NULL) and `avatar_provider_url` (the last address synced). The rules: `upload` is never replaced; a provider picture whose address equals the stored one is not fetched again (version > 0); a removed picture keeps the address with the version at 0 and `source` NULL, so the same address is not fetched again while a new one is. Alternative: compare the fetched bytes. Rejected: it would fetch on every sign-in. The columns are added by a Go step at startup like `project_members.via` (an `ALTER TABLE ADD COLUMN` cannot be repeated in a SQL migration).

**D3. Fit on the server, standard library only.** `internal/imgfit.Square` centre-crops and box-filters down to 256 (bilinear up for tiny pictures); the result is JPEG-encoded at the same quality as uploads, so no metadata survives and the stored file is what `handleGetAvatar` serves today. Alternative: `golang.org/x/image/draw`. Rejected: one more dependency for one resampler the instance logo (`instance-branding`) also needs; the package is 150 lines with tests.

**D4. Synchronous, bounded, never fatal.** The fetch runs inside the callback with a 5-second timeout and a 2 MB cap, after the session cookie is issued; any failure is a warning in the log and the sign-in completes. Alternative: a background job. Rejected: a job needs a queue and a worker for a request that takes well under a second in the normal case, and the picture is then there when the app loads.

**D5. Co-members learn by sync.** After a stored picture the server wakes the devices of every project co-member (`notifyCoMembers`), as an upload does, so their member lists carry the new version.

## Data model

Two nullable columns on `user_profiles`; no op, no sync field. Downgrade: an older server ignores the columns and treats every picture as uploaded.

## Size

No dependency; the binary grows by the `imgfit` package (a few KB).
