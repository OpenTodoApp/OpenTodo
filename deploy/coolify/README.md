# Coolify one-click template

`opentodo.yaml` is a service template in the format Coolify uses for its built-in service list (`templates/compose/` in the Coolify repository), and `opentodo.svg` is its logo (`public/svgs/`). Until it is part of Coolify, deploy with **New resource → Docker Compose** pointing at this repository (see [docs/self-hosting/coolify.md](../../docs/self-hosting/coolify.md)), or paste `opentodo.yaml` as an empty Docker Compose resource.

What it does: pulls the `0.2` image line (patch releases update on redeploy), assigns the domain on port 8080, passes it as `OPENTODO_BASE_URL` (secure cookies, passkeys, web push), keeps sign-up closed (the first visit creates the owner) and stores everything in one volume. Every other setting is optional and lives in the app's Settings; the full list of environment variables is in the [README](../../README.md#configuration).

## Submitting it to Coolify

1. Fork `coollabsio/coolify`, copy `opentodo.yaml` to `templates/compose/opentodo.yaml` and `opentodo.svg` to `public/svgs/opentodo.svg`.
2. Follow the repository's contribution guide for service templates (it may ask you to regenerate the template index or test the template on a Coolify instance first).
3. Open the pull request against the branch the guide names, with a screenshot of the deployed service.

Keep the template in sync when the image tag line changes (for example `0.2` after a minor release).
