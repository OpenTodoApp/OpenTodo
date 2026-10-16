# Coolify one-click template

`opentodo.yaml` is a Coolify service template, in the format of Coolify's built-in service list (`templates/compose/` in the Coolify repository), and `opentodo.svg` is its logo (`public/svgs/`).

**Status: prepared for Coolify's service list and pending upstream review.** Coolify lists a service only once its repository has 1,000 GitHub stars, so this can take a while. Until then:

- **Use it now:** in Coolify choose **+ New → Docker Compose** (without a Git repository; "Docker Compose Empty" in older versions), paste `opentodo.yaml`, set the `opentodo` service's domain and click **Deploy**. Then open the domain right away: the first visitor becomes the owner. Details are in [docs/self-hosting/coolify.md](../../docs/self-hosting/coolify.md#one-click-template-pending-in-coolifys-service-list).
- Or deploy from the repository with `docker-compose.yml` (Option A in the same guide).

What the template does: it pulls the `0.6` image line (patch releases arrive on **Deploy**), routes the domain to port 8080 (`SERVICE_URL_OPENTODO_8080`) and passes it as `OPENTODO_BASE_URL` (secure cookies, passkeys, web push). It keeps sign-up closed, stores everything in one named volume, checks health with `/opentodo healthcheck`, and lists the useful optional variables, with their defaults, in Coolify's Environment Variables tab. No variable is required.

## Files

| Path | What |
| --- | --- |
| `opentodo.yaml`, `opentodo.svg` | The template and logo. Edit these. |
| `upstream/` | Ready to submit: byte-identical copies at the paths they take in `coollabsio/coolify`, a draft docs page for `coollabsio/coolify-docs`, `PR.md` (title and body) and `HOW-TO-SUBMIT.md` (test first, then submit). |

`make check` runs `scripts/coolify-template-check.mjs`. It fails when the template breaks Coolify's conventions, when its tag does not match the latest release in `CHANGELOG.md`, when it names an `OPENTODO_*` variable the server does not read, or when the upstream copies differ. With Docker it also validates the file with `docker compose config`. `make coolify-smoke` starts the image the way Coolify does and checks the health check, the owner setup, closed sign-up, the https base URL and data surviving a redeploy.

After a minor release (for example `0.3.0`), bump the tag in `opentodo.yaml` and copy it to `upstream/templates/compose/opentodo.yaml`. Once the template is in Coolify, open a `feat(service): update opentodo to 0.3` pull request there.
