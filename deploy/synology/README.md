# Synology Container Manager project

[`docker-compose.yml`](docker-compose.yml) is a Docker Compose file shaped for a **Project** in Synology's Container Manager (DSM 7.2 and later): project path `/volume1/docker/opentodo`, one service `opentodo` with

- `ghcr.io/pixari/opentodo:stable` and `pull_policy: always`, so **Action → Build** on the project pulls the tag again;
- `user: "1026:100"`, the DSM account that owns the data folder (1026 is the first account DSM creates, 100 the `users` group; the guide shows how to read yours without SSH);
- port `8080:8080`, `restart: unless-stopped`, the image's own health check (`/opentodo healthcheck`, no shell);
- the bind mount `./data:/data`, which Container Manager resolves against the project path to `/volume1/docker/opentodo/data`;
- the four essential variables, all at their safe defaults (base URL and setup token empty, sign-up `false`, trusted proxies empty).

`node scripts/deploy-check.mjs` (part of `make check`) parses it and checks the stable tag and pull policy, the user, the port, the mount, the health check, the restart policy, the variables, and that the guide shows the same file (`scripts/deploy/synology.mjs`; tests in `scripts/deploy/synology.test.mjs`). The user guide is [docs/self-hosting/synology.md](../../docs/self-hosting/synology.md).

**Status: nothing to submit.** Synology has no store for containers. Package Center installs `.spk` packages, Synology's own and those of third-party sources such as [SynoCommunity](https://synocommunity.com), which are native builds for DSM, not containers. Container Manager installs images from registries and compose projects that the user creates. So the guide and this file are the distribution; people copy the file into a new project.

## Install it now

As in the guide: create `docker/opentodo/data` in File Station, then **Container Manager → Project → Create**, path `/docker/opentodo`, **Create docker-compose.yml**, paste the file, put your `uid:gid` in `user:`, **Next**, **Done**.

## Permissions: why `user:`

DSM shared folders and the folders created in them belong to DSM accounts (uids from 1026, group `users` 100, with DSM's ACLs on top), while the image runs as 65532 by default. A container writing a File Station folder as 65532 gets `open /data/opentodo.lock: permission denied`. The usual Synology answers are:

1. run the container as the DSM account (`user:` or the `PUID`/`PGID` of linuxserver images), with the ids from `id` (over SSH, or with the Task Scheduler without SSH) — **chosen**, because it works without SSH and keeps the files owned by the user, visible and manageable in File Station and Hyper Backup;
2. `chown 65532:65532` the folder over SSH and drop `user:`;
3. grant **Everyone** Read/Write on the folder in File Station (ACL) and drop `user:`.

The guide documents 1 and the other two as alternatives.

## Updates (policy: stable)

The image is `stable`, which every release moves. Container Manager shows "update available" only for images from Docker Hub (and, in third-party guides, only for `latest`), never for `ghcr.io`, and a project's containers are not recreated by an image update; the usual way is **Project → Action → Stop**, then **Action → Build**, which recreates the containers ([Dr. Frankenstein: Updating containers in Container Manager](https://drfrankenstein.co.uk/updating-containers-in-container-manager/), [Marius Hosting: How to update containers in Container Manager](https://mariushosting.com/synology-how-to-update-containers-in-container-manager/)). With `pull_policy: always` the build pulls the moved tag itself; the fallback in the guide is **Clean**, delete the image, **Build**. A moving tag is the right policy here: there is no store version to bump, and a pinned tag would need every user to edit their YAML on each release.

## On a release

Nothing to do. Users run **Stop** and **Build** on their project.

## Not verified

There was no DSM system to test on. The file was smoke-tested with Docker Compose as close to DSM as possible: the project in a `volume1/docker/opentodo` folder with `data` owned by `1026:100` and mode 755, `docker compose up -d` (with `--pull never`, because `stable` is not on ghcr.io until the next release), healthy, owner created, data kept across restart and `down`/`up`. Running as the image's 65532 against that folder fails with `permission denied`, as the guide says. Not tried on DSM itself: Container Manager's handling of `pull_policy: always` on Build (it ships Docker Compose v2, which supports it), the Task Scheduler steps to read the ids, DSM's ACLs with `user:` (the container has only the group in `user:`, not the account's other groups, which is why the guide asks for **Read & Write** for the account itself), and the reverse proxy and Let's Encrypt steps.
