# Railway template

Railway templates are made in Railway's dashboard (the template composer) and published from the account that owns them; there is no template file to import or submit. [`template.json`](template.json) is the record of exactly what the template holds, checked by `node scripts/deploy-check.mjs` (part of `make check`; `scripts/deploy/railway.mjs`, tests in `scripts/deploy/railway.test.mjs`) against [`deploy/deploy.json`](../deploy.json), and [`overview.md`](overview.md) is its overview text, laid out as Railway's [best practices](https://docs.railway.com/templates/best-practices) ask. The user guide is [docs/self-hosting/railway.md](../../docs/self-hosting/railway.md).

**Status: not yet published, and not yet run on Railway.** OpenTodo applied to Railway's [partner programme](https://docs.railway.com/templates/partners); a verified template needs to be published from the OpenTodo workspace and its marketplace URL sent to Railway. Until someone has deployed it there, the guide only describes the setup.

## The template

- One service from the Docker image `ghcr.io/opentodoapp/opentodo:stable` (public, no registry credential), named `OpenTodo`, one replica (Railway does not allow replicas with a volume).
- A volume on `/data` (the database, attachments and backups).
- Healthcheck path `/healthz`; HTTP networking with a generated domain on target port 8080.
- Variables, each with the description in `template.json`:
  - `OPENTODO_BASE_URL` = `https://${{RAILWAY_PUBLIC_DOMAIN}}` (the generated domain, which has no scheme);
  - `OPENTODO_SETUP_TOKEN` = `${{secret(32)}}` (a template variable function: a new random token per deploy; never a default credential);
  - `OPENTODO_ALLOW_SIGNUP` = `false`, `OPENTODO_TRUSTED_PROXIES` empty;
  - `PORT` = `8080`, the port Railway routes to and health-checks;
  - `RAILWAY_RUN_UID` = `0`: the image runs as `nonroot` (65532), and Railway's volumes are writable by root only; Railway documents this variable for non-root images ([Volumes](https://docs.railway.com/reference/volumes)).

## Creating and publishing it (the workspace owner)

1. Workspace settings → **Templates** → **New Template**: name `OpenTodo`, the icon from `template.json` (a 1:1 PNG with transparent corners), category and short description from `template.json`.
2. **Add New** → **Docker Image** → `ghcr.io/opentodoapp/opentodo:stable`; name the service `OpenTodo`.
3. **Variables**: the six above, values and descriptions from `template.json`.
4. **Settings**: healthcheck path `/healthz`; **Generate Domain** (HTTP) on target port 8080; one replica.
5. Right-click the service → **Attach Volume** → mount path `/data`.
6. Paste `overview.md` into the template's overview.
7. **Create Template**, deploy it once into a new project and check: the deploy is healthy, `https://<domain>/healthz` answers `ok`, the owner account is created with the setup token, a task survives a redeploy.
8. **Publish** it from the Templates page, and reply to Railway with the marketplace URL. Then this README and the guide link it, and the status above changes.

## What is not verified

That `${{RAILWAY_PUBLIC_DOMAIN}}` resolves in the service's own variables at deploy time, that `RAILWAY_RUN_UID=0` is enough for the volume, that Railway's health check uses `PORT`, and that Railway's edge proxy passes `X-Forwarded-For` from a private address (OpenTodo trusts proxies on private addresses by default): all from Railway's documentation, none run on Railway yet. Step 7 checks them.
