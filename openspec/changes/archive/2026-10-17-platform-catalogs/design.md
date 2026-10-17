# Design: platform catalogs

## Decisions

### D1. One folder per platform, same contract as Unraid

Each platform keeps its template in its native format, hand-written, plus `upstream/` with byte-identical copies at the paths the target repository uses. The checker parses the format strictly, applies platform rules found in the store's own documentation and linters, compares the upstream copy, and passes `{ image, port, dataTarget, variables, policy }` to the shared rules. The runner already fails a `deploy/` folder without a checker.

### D2. Image policy per platform

The maintainer's rule is `stable` everywhere it is allowed. Three stores do not allow it: Umbrel's linter requires `<version>@sha256:<digest>`, Easypanel's rules require exact versions, and TrueNAS, CasaOS and Runtipi offer updates only when a version field changes. Those templates use the `release` policy (the latest release in `CHANGELOG.md`) or `release-digest`. The release preparation bumps them (the check fails until it does), as it did for every template before `stable`. The digest cannot exist before the release job runs, so `scripts/deploy/pin.mjs` rewrites it afterwards from the registry's index digest; the checker verifies only its shape, keeping `make check` offline.

### D3. Permissions on platform bind mounts

The image runs as uid 65532 and has no shell. Platforms that bind-mount a host folder Docker creates as root (CasaOS, Runtipi) get a pinned one-shot init container that changes its owner before OpenTodo starts. Platforms with their own convention run OpenTodo as that user instead (Umbrel 1000:1000, TrueNAS 568:568 with its permissions container); the static binary runs as any uid that can write `/data`.

### D4. Base URL and HTTPS per platform

`OPENTODO_BASE_URL` set to an https address makes cookies `Secure`, which breaks sign-in over plain http. Templates set it only where the platform serves the app over https by default (Easypanel, Cosmos); on platforms whose default domain is plain http the template leaves the decision to the user and the guide explains it.

## Size and data

No image, binary, runtime or data model change.

## Interface budget

No screen changes.
