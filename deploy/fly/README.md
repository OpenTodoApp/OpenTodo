# Fly.io configuration

A [Fly.io](https://fly.io) app configuration, [`fly.toml`](fly.toml), for `flyctl`. Fly has no app store: people download this file and run `fly launch` and `fly deploy` with it (`docs/self-hosting/fly.md`).

What the file sets:

- `[build] image = "ghcr.io/pixari/opentodo:stable"`: Fly deploys the published image, no Dockerfile or build.
- `[env]`: `OPENTODO_BASE_URL = ""` (the guide says to set `OPENTODO_BASE_URL = "https://<app>.fly.dev"` once the name is chosen), `OPENTODO_ALLOW_SIGNUP = "false"`, `OPENTODO_TRUSTED_PROXIES = ""`. The setup token is not in the file: it is a secret, set with `fly secrets set OPENTODO_SETUP_TOKEN=...` before the first deploy.
- `[mounts]`: the volume `opentodo_data` on `/data` (`initial_size = "1gb"`).
- `[http_service]`: `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1`, and one HTTP check on `/healthz`.
- `[[vm]]`: `shared-cpu-1x` with 256 MB (OpenTodo idles at about 20 MB).
- `kill_signal = "SIGTERM"`, `kill_timeout = "30s"`: OpenTodo shuts down cleanly on SIGTERM and gets time to finish.
- No `app` or `primary_region`: `fly launch --copy-config --no-deploy --name <app> --region <region>` writes them, so nobody deploys to a name in our file.

`node scripts/deploy-check.mjs` (part of `make check`) parses the file with a strict TOML-subset parser and checks the keys and value types against what flyctl's `internal/appconfig` reads, plus the rules above (`scripts/deploy/fly.mjs`; tests in `scripts/deploy/fly.test.mjs`). It also checks that this README and the guide tell people to set the setup token as a secret.

**Status: usable now** (no submission needed). Not run on a real Fly account yet (see "Tested").

## Choices, and the evidence

- **`stable` tag.** On every `fly deploy`, flyctl asks Fly's API to resolve the image reference and deploys `image@digest` ([`internal/build/imgsrc/remote_image_resolver.go`](https://github.com/superfly/flyctl/blob/master/internal/build/imgsrc/remote_image_resolver.go): "Searching for image ... remotely", `ResolveImageForApp`, then `Tag@Digest` in `DeploymentImage`). So the machine keeps the release it was deployed with, and the next `fly deploy` picks up whatever `stable` points at. Nothing updates by itself: updates reach people when they run `fly deploy` again.
- **One machine.** SQLite has one writer, and Fly does not replicate volumes. Fly's [app availability](https://fly.io/docs/reference/app-availability/) page says `fly launch` and `fly deploy` create "only one Machine if the process group has volumes mounted" (otherwise two). The guide says never to `fly scale count 2` or clone the machine.
- **Always on.** With `auto_stop_machines = "stop"` Fly would stop an idle machine and start it on the next request. OpenTodo's reminders (push), scheduled backups, webhook retries and email-to-task polling run on the server, so a stopped machine would miss them. `"off"` with `min_machines_running = 1` keeps it running. (Sync itself would survive a stop: devices keep their changes and sync when it is back.)
- **https and the base URL.** Fly serves `https://<app>.fly.dev` with a certificate and `force_https` redirects http. The address is only known after `fly launch`, so the committed value is empty and the guide sets it. With it empty OpenTodo still works through Fly's proxy (it takes the address from the request), but passkeys stay off, the session cookie is not marked `Secure`, and push uses no contact address. Fly's proxy is the only proxy and appends the client to `X-Forwarded-For`, so trusted proxies stay empty.
- **Health check.** Fly does not run the image's Docker `HEALTHCHECK`; `[[http_service.checks]]` on `/healthz` is what Fly uses for routing and deploys.
- **Volume ownership.** Fly staff: "We automatically chown the mount destination of your volume with your docker image's user and group" ([community.fly.io/t/1773](https://community.fly.io/t/fly-volumes-getting-permission-denied/1773)). The image's user is `nonroot` (65532). Not verified on Fly; the guide asks people to open an issue if the log says "permission denied".
- **Commands.** `fly launch` flags (`--copy-config` "Use the configuration file if present without prompting", `--no-deploy`, `--name`, `--region`) from [flyctl launch](https://fly.io/docs/flyctl/launch/). `fly secrets set` on an app without machines prints "Secrets are staged for the first deployment" (`internal/command/secrets/secrets.go`).

## On a release

Nothing changes here: the file names `stable`, which every release moves. People get the release with `fly deploy` (the guide says so).

## Tested

- `node --test scripts/deploy/fly.test.mjs`, and the file also parses with Python's `tomllib` and validates against the SchemaStore schema for `fly.toml` (`https://www.schemastore.org/fly.json`) with no errors.
- Docker, the way Fly runs it: `[build] image`, `[env]` plus the secret, `internal_port` on a host port, a volume directory with a root-owned `lost+found` whose root was chowned to 65532 (what Fly's init does), the stop signal and timeout, and 256 MB of memory. `/healthz` answered ok; with Fly's headers (`X-Forwarded-Proto: https`, `Host: <app>.fly.dev`) and the base URL set, passkeys were offered, creating the owner needed the token and set a `Secure` cookie; the owner survived a restart (clean "shutting down" on SIGTERM) and a replaced container; with the base URL empty, sign-in still worked.
- Not tested: a real Fly account (`fly launch`, the volume's ownership, the health check, certificates).
