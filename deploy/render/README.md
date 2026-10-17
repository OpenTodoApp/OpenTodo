# Render Blueprint

[`render.yaml`](render.yaml) is a [Render Blueprint](https://render.com/docs/infrastructure-as-code) with one web service:

- `runtime: image` pulling `ghcr.io/pixari/opentodo:stable` (public, no registry credential);
- a persistent disk `opentodo-data` of 1 GB on `/data` (it can be grown later, never shrunk);
- `plan: 0.5c-512mb`, the smallest paid instance type. **A disk needs a paid instance type**: Free web services cannot have one, lose their filesystem on every restart and spin down after 15 minutes idle ([Deploy for Free](https://render.com/docs/free), [Persistent Disks](https://render.com/docs/disks)). So this template always costs money: the instance plus the disk, see [render.com/pricing](https://render.com/pricing);
- `healthCheckPath: /healthz`;
- `PORT=8080`, so Render routes to the port OpenTodo listens on;
- `OPENTODO_BASE_URL` from the service itself (`fromService` with `envVarKey: RENDER_EXTERNAL_URL`, its `https://<name>.onrender.com` address, [self-referencing variables](https://render.com/docs/blueprint-spec#self-referencing-environment-variables));
- `OPENTODO_SETUP_TOKEN` with `generateValue: true` (a random 44-character base64 value per service; the owner reads it under **Environment** and enters it when creating the owner account);
- `OPENTODO_ALLOW_SIGNUP=false` and `OPENTODO_TRUSTED_PROXIES` empty (Render's load balancer is the only hop, and OpenTodo trusts the nearest proxy by default).

`node scripts/deploy-check.mjs` (part of `make check`) parses it and checks it against the fields of Render's Blueprint reference and JSON Schema ([blueprint-spec](https://render.com/docs/blueprint-spec), [render.yaml.json](https://render.com/schema/render.yaml.json)), plus the shared rules (`scripts/deploy/render.mjs`; tests in `scripts/deploy/render.test.mjs`). The user guide is [docs/self-hosting/render.md](../../docs/self-hosting/render.md).

**Status: not yet published.** Render has no app store or template list to submit to: a Blueprint is deployed from a Git repository. The button works once this file is on `main` of the public repository.

## The Deploy to Render button

```markdown
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pixari/opentodo&path=deploy/render/render.yaml)
```

The file does not have to be at the repository root. Since February 2026 a Blueprint can live at any path ([changelog](https://render.com/changelog/blueprints-now-support-custom-filenames-and-paths), [Blueprint setup step 7](https://render.com/docs/infrastructure-as-code#setup)). The button's documented parameters are `repo` (and a branch as `/tree/<branch>`) ([Deploy to Render Button](https://render.com/docs/deploy-to-render)); `path` is not documented, but `https://render.com/deploy` forwards the whole query string to `https://dashboard.render.com/blueprint/new`, and that page reads `path` into its **Blueprint Path** field (checked on 2026-10-17 in the dashboard's code; `curl -sI` the button URL shows the redirect). If Render drops it one day, the form shows `render.yaml` in **Blueprint Path**, and the user types `deploy/render/render.yaml` there. No file at the repository root is needed.

The manual flow, which the guide also describes: Render Dashboard → **New → Blueprint** → **Public Git Repository** `https://github.com/pixari/opentodo` (or a connected fork) → branch `main` → **Blueprint Path** `deploy/render/render.yaml` → **Deploy Blueprint**.

## What a change to render.yaml does to existing installs

A Blueprint created from the button stays linked to `pixari/opentodo` on `main`, and Render syncs it on each push that changes the Blueprint file ("Auto Sync", on by default; [Disabling automatic sync](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync)). So **an edit to `render.yaml` on `main` reaches every install that kept Auto Sync on** and redeploys it: changing the plan changes their bill, renaming the service or the disk recreates resources. Keep the file stable; only add things that are safe for everyone, and mention any change in the changelog. A sync also resets `OPENTODO_BASE_URL` to the onrender.com address, which is why the guide tells people with a custom domain to turn Auto Sync off first.

## Updates (policy: stable)

The image is `stable`, which every release moves. Render does **not** redeploy an image-backed service when its tag moves, but it pulls the image again on **every** deploy and keeps no cached copy ([Deploy a Prebuilt Docker Image](https://render.com/docs/deploying-an-image#pulling-images)). So a release reaches a user when they click **Manual Deploy → Deploy latest reference** on the service (or call its deploy hook URL, for example from a scheduled job of their own), or when a Blueprint sync redeploys it. With a disk, Render stops the old instance before starting the new one, so each deploy has a few seconds of downtime. `autoDeployTrigger` has no effect for image services, so the template leaves it out.

## On a release

Nothing to do here. Users press **Deploy latest reference**.

## Not verified

Without a Render account, these were not tried on Render itself: the deploy from the button, the self-referenced `RENDER_EXTERNAL_URL`, that an empty `value: ""` is accepted for `OPENTODO_TRUSTED_PROXIES`, and that the disk is writable by the image's user 65532 (Render's documentation does not say who owns a new disk; other non-root images with a disk on Render, such as OpenClaw's Blueprint, write to it). The file validates against Render's JSON Schema, and the same container settings were smoke-tested with Docker behind a TLS proxy. Before announcing the button, deploy it once on a Render account and check the steps in the guide.
