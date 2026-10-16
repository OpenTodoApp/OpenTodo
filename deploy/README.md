# Platform templates

One folder per platform, each with its template in that platform's own format. They all describe the same container, so the facts they must agree on live in one file, [`deploy.json`](deploy.json): the image, the port, the data directory, the health check, the name, links and icon, and the catalogue of optional `OPENTODO_*` variables a template may offer, with their defaults and descriptions.

| Platform | Folder | Status |
| --- | --- | --- |
| Coolify | [`coolify/`](coolify/) | Pending in Coolify's service list; paste it as Docker Compose meanwhile |
| Unraid | [`unraid/`](unraid/) | To submit to Community Applications; install from the template URL meanwhile |

## Checks

`make check` (and CI) runs `node scripts/deploy-check.mjs`. For every folder here it loads `scripts/deploy/<folder>.mjs`, which parses that platform's format and applies the shared rules in `scripts/deploy/common.mjs`:

- the image is `ghcr.io/pixari/opentodo:<major.minor>` and matches the latest release in `CHANGELOG.md`;
- the container port is 8080 and the data is mounted on `/data`;
- every `OPENTODO_*` variable is in the catalogue and read by `internal/config`, with the catalogue's default, and none is required;
- the essential variables (base URL, setup token, sign-up, trusted proxies) are offered.

A folder without a checker fails the run. Tests: `node --test scripts/deploy/*.test.mjs`.

## Adding a platform

1. Add the variable to `deploy.json` first if the platform should offer one that is not catalogued yet (the check refuses it otherwise).
2. Create `deploy/<platform>/` with the template and a `README.md` (how to install before it is listed, how to submit it).
3. Add `scripts/deploy/<platform>.mjs` exporting `check(ctx)` and `summary`. Parse the format strictly, check what is specific to the platform, and pass `{ image, port, dataTarget, variables }` to `checkShared()`. `unraid.mjs` is a short example. Add cases to `scripts/deploy/deploy.test.mjs`.
4. Add `docs/self-hosting/<platform>.md` and list it in `docs/README.md`, and add a row to the table above.

## On a release

Preparing a minor release (for example `0.7.0`) makes the check fail until every template names the new line. Bump the tag in each template (and in Coolify's `upstream/` copy), then follow each folder's README for the upstream update.
