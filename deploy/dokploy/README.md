# Dokploy template

A [Dokploy](https://dokploy.com) template in the format of Dokploy's template catalogue ([`Dokploy/templates`](https://github.com/Dokploy/templates), `blueprints/<id>/`).

| Path | What |
| --- | --- |
| `blueprints/opentodo/docker-compose.yml` | One `opentodo` service: `ghcr.io/pixari/opentodo:stable` with `pull_policy: always`, `expose: 8080`, the named volume `opentodo-data` on `/data`, the image's health check. No ports, container name or networks (Dokploy's rules). |
| `blueprints/opentodo/template.toml` | The generated domain on port 8080, a generated setup token (`${password:32}`) passed as `OPENTODO_SETUP_TOKEN`, an empty `OPENTODO_BASE_URL`, closed sign-up, no trusted proxies. |
| `blueprints/opentodo/meta.json`, `opentodo.svg` | The catalogue entry and the logo (a copy of `deploy/coolify/opentodo.svg`). |
| `meta.json` | The list Dokploy reads from a templates base URL, so this folder works as one (see below). |
| `upstream/blueprints/opentodo/` | Byte-identical copies at the paths they take in `Dokploy/templates`. `upstream/PR.md` has the pull request title and body. |

Edit the files under `blueprints/opentodo/`, copy them to `upstream/blueprints/opentodo/`, and regenerate `meta.json`:

```bash
node -e 'const m=require("./deploy/dokploy/blueprints/opentodo/meta.json");process.stdout.write(JSON.stringify([m],null,2)+"\n")' > deploy/dokploy/meta.json
```

`node scripts/deploy-check.mjs` (part of `make check`) fails when the copies drift. It also checks Dokploy's rules, the stable tag, the port, the volume, the variables and the empty base URL (`scripts/deploy/dokploy.mjs`; tests in `scripts/deploy/dokploy.test.mjs`).

**Status: not yet submitted.**

## Why the base URL starts empty

Dokploy gives a template's domain a generated `*.sslip.io` name served over plain http, with no certificate. With an `https://` `OPENTODO_BASE_URL`, the session cookie is `Secure`, the browser drops it over http, and sign-in fails. An `http://` value works, but it goes stale once the domain gets https: links and the web push contact keep the http address. Empty works in both cases, because OpenTodo takes the address from the request. Once a real domain with HTTPS (Let's Encrypt) is attached, set `OPENTODO_BASE_URL=https://<domain>` in the Environment tab and redeploy. That turns on secure cookies and passkeys. The user guide (`docs/self-hosting/dokploy.md`) explains this.

## Install it now, before it is listed

Either way works in a Dokploy project:

- **Templates base URL.** Dokploy reads templates from `https://templates.dokploy.com` by default, and its template dialog accepts another base URL. Enter `https://raw.githubusercontent.com/pixari/opentodo/main/deploy/dokploy`, which serves `meta.json` and `blueprints/opentodo/` the same way. Then pick **OpenTodo** and create it.
- **By hand.** Choose **Create Service → Compose** and paste `blueprints/opentodo/docker-compose.yml` as the compose file. Under **Environment**, add the variables from `template.toml`, with a token of 32 letters and digits for `OPENTODO_SETUP_TOKEN`. Under **Domains**, add a domain for the service `opentodo` on port 8080. Then **Deploy**.

## Submit

Before you start:

- The `stable` tag must exist on `ghcr.io/pixari/opentodo`. The release job publishes it from the next release on. Until then the template cannot deploy, because `pull_policy: always` fetches the tag.
- You need a Dokploy instance to test on. Their PR template asks for it.

Steps:

1. Fork [`Dokploy/templates`](https://github.com/Dokploy/templates) and create a branch from `canary`, for example `add-opentodo-template`.
2. Copy `deploy/dokploy/upstream/blueprints/opentodo/` to `blueprints/opentodo/` in the fork. Do not add a root `meta.json`: theirs is generated, and CI rejects a committed one.
3. Run their checks. From the repository root: `node build-scripts/generate-meta.js --check`. Then `cd build-scripts && pnpm install`, followed by `pnpm exec tsx validate-docker-compose.ts --file ../blueprints/opentodo/docker-compose.yml --verbose` and `pnpm exec tsx validate-template.ts --dir ../blueprints/opentodo --verbose`.
4. Push and open the pull request against `canary`, using the title and body in `upstream/PR.md`.
5. Their CI builds a preview of the catalogue. Deploy OpenTodo from it in your instance: copy the template's Base64 into a compose service's **Advanced → Import**, or enter the preview URL as the base URL. Then tick the "tested" box and add a screenshot.

## On a release

Nothing changes. The template names `stable`, which every release moves, and `pull_policy: always` makes **Deploy** fetch it. `meta.json` says `"version": "stable"`, as other catalogue entries with a moving tag do.
