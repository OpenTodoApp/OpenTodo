## Why

On a fresh Unraid install the container stopped at once with `opentodo: /data: open lock file: open /data/opentodo.lock: permission denied` (issue #511). Docker creates a missing host folder owned by root, the image runs as user 65532, and the log line did not say which user needs to write where or how to fix it. The Unraid guide also claimed appdata is writable by default and did not list this message.

## What Changes

- When the server cannot create or write its data directory because of permissions, it stops with a message that names the directory, the user and group ids the process runs as, and the command that fixes it (`chown -R <uid>:<gid>` on the folder mounted there), with a link to the guide.
- The Unraid guide and template say that the appdata folder must belong to user 65532 (or that the container runs as `--user 99:100` with the folder given to `99:100`), list the exact log line, and explain how to bring back a template field that was removed (the setup token).

Not **BREAKING**: no new variable, no behavior change for a writable directory.

## Out of scope

- Changing the image's user or adding an init helper to the Unraid template (Unraid has no init containers; the image stays rootless).

## Roadmap

Fixes #511 for `self-hosting` (ROADMAP section 7, Unraid row).

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: an unwritable data directory is explained at startup.

## Impact

- `internal/store/lock.go` (the first file the server writes), `cmd/opentodo` maintenance commands share it.
- `docs/self-hosting/unraid.md`, `docs/self-hosting/docker.md`, `deploy/unraid/opentodo.xml` and its upstream copy.
