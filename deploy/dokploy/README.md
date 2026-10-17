# Dokploy template

A [Dokploy](https://dokploy.com) template, in the format of Dokploy's template catalogue ([`Dokploy/templates`](https://github.com/Dokploy/templates), `blueprints/<id>/`):

| Path | What |
| --- | --- |
| `blueprints/opentodo/docker-compose.yml` | One `opentodo` service, `ghcr.io/pixari/opentodo:stable` with `pull_policy: always`, `expose: 8080`, the named volume `opentodo-data` on `/data`, the image's health check. No ports, container name or networks (Dokploy's rules). |
| `blueprints/opentodo/template.toml` | The generated domain on port 8080, a generated setup token (`${password:32}`) passed as `OPENTODO_SETUP_TOKEN`, an empty `OPENTODO_BASE_URL`, closed sign-up. |
| `blueprints/opentodo/meta.json`, `opentodo.svg` | Catalogue entry and logo (a copy of `deploy/coolify/opentodo.svg`). |
| `meta.json` | The list Dokploy reads from a templates base URL, so this folder works as one (below). |
| `upstream/blueprints/opentodo/` | Byte-identical copies at the paths they take in `Dokploy/templates`, and `upstream/PR.md` (title and body). |

Edit the files under `blueprints/opentodo/`, then copy them to `upstream/blueprints/opentodo/` and regenerate `meta.json` (`node -e 'const m=require("./deploy/dokploy/blueprints/opentodo/meta.json");process.stdout.write(JSON.stringify([m],null,2)+"\n")' > deploy/dokploy/meta.json`). `node scripts/deploy-check.mjs` (in `make check`) fails when they drift, and checks Dokploy's rules, the stable tag, the port, the volume, the variables and the empty base URL (`scripts/deploy/dokploy.mjs`, tests in `scripts/deploy/dokploy.test.mjs`).

**Status: not yet submitted.**

## Why the base URL starts empty

Dokploy gives a template's domain a generated `*.sslip.io` name served over plain http (no certificate). With an `https://` `OPENTODO_BASE_URL` the session cookie is `Secure`, the browser drops it over http, and sign-in fails. An `http://` value works but goes stale once the domain gets https (links and the web push contact keep the http address). Empty works on both: OpenTodo takes the address from the request. When the user attaches a real domain with HTTPS (Let's Encrypt), they set `OPENTODO_BASE_URL=https://<domain>` in the Environment tab and redeploy; that turns on secure cookies and passkeys. The guide says so.

## Install it now, before it is listed

Either of these, in a Dokploy project:

- **Base URL:** Dokploy reads templates from `https://templates.dokploy.com` by default, and its template dialog takes another base URL. Use `https://raw.githubusercontent.com/pixari/opentodo/main/deploy/dokploy`, which serves `meta.json` and `blueprints/opentodo/` the same way. Pick **OpenTodo** and create it.
- **By hand:** **Create Service → Compose**, paste `blueprints/opentodo/docker-compose.yml` as the compose file (Raw), add the variables from `template.toml` under **Environment** (with a 32-character token of your own for `OPENTODO_SETUP_TOKEN`), add a domain for service `opentodo` on port 8080 under **Domains**, and **Deploy**.

## Submit

Prerequisites: the `stable` tag must exist on `ghcr.io/pixari/opentodo` (the release job publishes it from the next release on; until then the template cannot deploy, because `pull_policy: always` fetches it), and a Dokploy instance to test on (their PR template asks for it).

1. Fork [`Dokploy/templates`](https://github.com/Dokploy/templates) and branch from `canary`, for example `add-opentodo-template`.
2. Copy `deploy/dokploy/upstream/blueprints/opentodo/` to `blueprints/opentodo/` in the fork. Do not add a root `meta.json` (theirs is generated; CI rejects one).
3. Run their checks: `cd build-scripts && pnpm install`, then `node ../build-scripts/generate-meta.js --check` from the repository root, `pnpm exec tsx validate-docker-compose.ts --file ../blueprints/opentodo/docker-compose.yml --verbose` and `pnpm exec tsx validate-template.ts --dir ../blueprints/opentodo --verbose`.
4. Push and open the pull request against `canary` with the title and body in `upstream/PR.md`. Their CI builds a preview of the catalogue; deploy OpenTodo from it in your instance (copy the template's Base64 into a compose service's **Advanced → Import**, or paste the preview URL as the base URL), tick the "tested" box and add a screenshot.

## On a release

Nothing. The template names `stable`, which every release moves, and `pull_policy: always` makes **Deploy** fetch it. `meta.json` says `"version": "stable"`, as other catalogue entries with a moving tag do.
