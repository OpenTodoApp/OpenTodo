# How to submit the OpenTodo template to Coolify

This folder holds everything the upstream contribution needs, laid out with the same paths it will have in the target repositories:

| File here | Goes to | Repository |
| --- | --- | --- |
| `templates/compose/opentodo.yaml` | `templates/compose/opentodo.yaml` | `coollabsio/coolify` |
| `public/svgs/opentodo.svg` | `public/svgs/opentodo.svg` | `coollabsio/coolify` |
| `coolify-docs/content/docs/services/opentodo.mdx` | `content/docs/services/opentodo.mdx` | `coollabsio/coolify-docs` |
| `coolify-docs/public/images/services/opentodo-logo.svg` | `public/images/services/opentodo-logo.svg` | `coollabsio/coolify-docs` |
| `PR.md` | title and body of the pull request | `coollabsio/coolify` |

`templates/compose/opentodo.yaml` is a byte-for-byte copy of [`../opentodo.yaml`](../opentodo.yaml), and `make check` fails if the two drift apart. Edit `../opentodo.yaml` and copy it here.

The rules below were taken from Coolify's `CONTRIBUTING.md`, `.github/pull_request_template.md` and `.github/workflows/pr-quality.yaml` on `main` (12 October 2026), and from the docs page "Add a new service template to Coolify" (`coolify-docs` `content/docs/contribute/service.mdx`). Check them again on the day you submit: they change often.

## 0. Before you start: eligibility

- **1,000 GitHub stars.** The docs page says: "The service repository must have at least 1,000 GitHub stars before it can be added to Coolify as a one-click service." On 12 October 2026 `pixari/opentodo` had 2. Until it reaches 1,000, a PR will most likely be closed. Users can still deploy the template by pasting it (step 1), and you can post it in the [service template requests](https://github.com/coollabsio/coolify/discussions/categories/service-template-requests) discussion so others can upvote it.
- Coolify's PR quality check closes PRs automatically when, among other things, the GitHub account is younger than 30 days, the profile is mostly empty, "Allow edits by maintainers" is off, the title is not a conventional commit, the description is longer than 2,500 characters or contains "Generated with Claude Code", or the PR touches `templates/service-templates.json` or `templates/service-templates-latest.json`.
- One PR = one logical change: the template and its logo only.

## 1. Test it first in your own Coolify

The docs page asks for a test "from a fresh Docker Compose Empty resource, not only an already-running local container". In current Coolify versions this resource is called **Docker Compose** ("without a Git repository"); older versions call it **Docker Compose Empty**.

1. Open a project and choose **+ New → Docker Compose** (the option without a Git repository).
2. Paste the contents of `templates/compose/opentodo.yaml` and save. Coolify lists one service, `opentodo`, and the environment variables from the template.
3. Open the `opentodo` service and set **Domains** to an https URL you control, for example `https://todo.example.com`. Coolify may have generated an `sslip.io` domain; replace it so the service has **only** the domain users will open.
4. Click **Deploy**. Open the domain as soon as the deployment finishes: the first visitor becomes the owner.

Check, and tick in `PR.md` only what you saw:

- [ ] The service shows **Running (healthy)** within about 15 s of starting.
- [ ] The domain opens over https and shows the owner setup screen. After you create the owner, a private window cannot register ("sign-up closed").
- [ ] **Settings → Security** says "Passkeys are tied to todo.example.com" (your domain), and adding a passkey works.
- [ ] Create a task. **Restart** the service, then **Deploy** again: the task is still there.
- [ ] Set `OPENTODO_LOG_LEVEL` to `debug` in **Environment Variables**, then **Restart**: the logs show one line per request. Set it back to `info`.
- [ ] Optional: change the domain and redeploy. The app now uses the new domain, and passkeys must be added again, as documented.
- [ ] Optional, behind Cloudflare's proxy (orange cloud): set `OPENTODO_TRUSTED_PROXIES` to `cloudflare`, redeploy, and check that **Settings → Audit log** with addresses enabled shows your own address, not a Cloudflare one.
- [ ] Take a screenshot of the running service and the app for the PR's Preview section.

Updating later: **Deploy** pulls the image again, but plain **Restart** does not. Use **Deploy** or **Restart (pull latest)**.

## 2. Open a discussion or issue

CONTRIBUTING: "Every pull request should reference and close an Issue or Discussion. If none exists, create one first." Open a discussion in [General](https://github.com/coollabsio/coolify/discussions/categories/general), or comment on an existing request in [service template requests](https://github.com/coollabsio/coolify/discussions/categories/service-template-requests). Say in a few lines what OpenTodo is and that you would like to contribute the template. Note its number for `PR.md`.

## 3. Docs pull request (coollabsio/coolify-docs)

The docs page says the matching docs PR "is required before the template PR can be merged".

```bash
gh repo fork coollabsio/coolify-docs --clone && cd coolify-docs
git switch next && git switch -c add-opentodo
cp <OpenTodo>/deploy/coolify/upstream/coolify-docs/content/docs/services/opentodo.mdx content/docs/services/
cp <OpenTodo>/deploy/coolify/upstream/coolify-docs/public/images/services/opentodo-logo.svg public/images/services/
bun install && bun run generate:services   # refreshes the generated service lists; commit any tracked file it changes
bun run dev                                # check the OpenTodo card, the Productivity filter and the page
git add -A && git commit -m "docs(services): add OpenTodo"
git push -u origin add-opentodo
gh pr create --repo coollabsio/coolify-docs --base next --title "docs(services): add OpenTodo"
```

The docs repository works from `next`: "Do not open pull requests against `main`" (`content/docs/contribute/documentation.mdx`).

## 4. Template pull request (coollabsio/coolify)

**Target branch: `main`.** The sources disagree, so here is why:

- The service docs page says "open the template pull request against `next`". It was written before 7 October 2026, when Coolify replaced `next` with per-minor release branches (commit `8ae3b91`, "docs(release): replace next branch with per-minor release branches"). CONTRIBUTING now says "There is no `next` branch", even though a stale `next` branch still exists.
- CONTRIBUTING sends "fixes and small improvements" to `main` and "new features and larger changes" to `release/v4.x`, which is currently `release/v4.5`.
- Every recently merged new service went straight to `main` as a squash commit, for example Linkwarden (#11561), Lidarr (#11576) and OpenWA (#11448). Coolify instances download the template list from Coolify's CDN (`config/constants.php`, `services.official`), which maintainers publish separately from releases, so a merged template can reach users without a Coolify upgrade.

Use `main` unless the maintainers ask in your discussion for `release/v4.5`. If they do, base the branch on `release/v4.5` and set `--base release/v4.5` below.

```bash
gh repo fork coollabsio/coolify --clone && cd coolify
git switch main && git switch -c add-opentodo-service
cp <OpenTodo>/deploy/coolify/upstream/templates/compose/opentodo.yaml templates/compose/
cp <OpenTodo>/deploy/coolify/upstream/public/svgs/opentodo.svg public/svgs/
git add templates/compose/opentodo.yaml public/svgs/opentodo.svg
git commit -m "feat(service): add opentodo"
git push -u origin add-opentodo-service
```

Do **not** run `php artisan generate:services` or commit `templates/service-templates.json` / `service-templates-latest.json`. The docs say not to edit them, and the PR quality check rejects PRs that touch them. Maintainers regenerate them.

Open the PR on GitHub (so the template is filled in), against `coollabsio/coolify` `main`:

1. Title: `feat(service): add OpenTodo`.
2. Body: paste the body from `PR.md`, write **Changes** and **Why** yourself (the template requires them to be written by a person), fill in the discussion and docs PR links, the Coolify version and the screenshot, and tick only what you did.
3. Keep "Allow edits by maintainers" checked.
4. Keep the commit author the same as the PR author (another quality check).

## 5. After it is merged

- Nothing to regenerate. Coolify's maintainers rebuild the template index and publish it to their CDN.
- A new OpenTodo release line (for example `0.3`) needs a small PR: change the tag in `templates/compose/opentodo.yaml` (bump `../opentodo.yaml` here first; `make check` reminds you), titled `feat(service): update opentodo to 0.3`. Existing installations keep their compose file. Their owners change the image tag in **Edit Compose file** and click **Deploy**.
