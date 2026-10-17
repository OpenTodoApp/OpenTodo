# Podman Quadlet

`opentodo.container` and `opentodo.volume` are Podman Quadlet units: systemd unit files that Podman's generator turns into `opentodo.service` and `opentodo-volume.service`. The container runs `ghcr.io/pixari/opentodo:stable` with `AutoUpdate=registry`, publishes `8080:8080`, mounts the named volume `systemd-opentodo` on `/data`, runs the health check in exec form (`HealthCmd=["/opentodo", "healthcheck"]`: the image has no shell, and a plain string becomes `CMD-SHELL` and always fails), is read-only with no capabilities and no new privileges, and offers the four essential variables as `Environment=` lines with the catalogue's defaults. `[Install] WantedBy=default.target` starts it at boot, rootful and rootless. The user guide is `docs/self-hosting/podman.md`.

They need **Podman 4.6** or later: `AutoUpdate=` arrived in 4.6 and the `Health*` keys in 4.5; Quadlet itself in 4.4, but 4.4 and 4.5 refuse the unit because of `AutoUpdate=` (release notes: <https://github.com/containers/podman/blob/main/RELEASE_NOTES.md>, unit reference: <https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html>). `Notify=healthy` (Podman 5) is left out on purpose.

`node scripts/deploy-check.mjs` (part of `make check`) parses both files with a strict parser for the unit syntax (sections, `Key=Value`, comment lines; no continuations, no keys outside a section, no repeated sections, only keys Podman 4.6 knows) and checks the stable tag, `AutoUpdate=registry`, the health check, the port, the volume, the hardening keys and the variables (`scripts/deploy/podman.mjs`; tests in `scripts/deploy/podman.test.mjs`).

**Status: nothing to submit.** There is no store: people install by copying the two files (the guide downloads them from `main`).

## Image policy: `stable`

`podman auto-update` compares the image digest of the tag in the registry with the running one, pulls when it changed and restarts the unit (rolling back if it does not start), so a moving tag is exactly what it follows (<https://docs.podman.io/en/latest/markdown/podman-auto-update.1.html>). A version tag would never change and never update.

## Verified

With Podman 4.9.3 (Ubuntu 24.04): `quadlet -dryrun` (rootful and `-user`) generates the services without errors; the generated `podman run` command (without the systemd-only `--cgroups=split --sdnotify=conmon --cidfile`) starts OpenTodo, `podman healthcheck run` reports healthy, the owner account survives a restart and a re-created container. Rootless (a fresh user with a subuid range): the named volume is created owned by the container's user and OpenTodo starts; a bind-mounted folder fails with "permission denied" without `:U` and works with it. Not verified here: starting it through systemd (the test machine has no systemd as init), and `podman auto-update` itself.

## On a release

Nothing. The unit names `stable`, which every release moves; `podman auto-update` (or its timer) installs it.
