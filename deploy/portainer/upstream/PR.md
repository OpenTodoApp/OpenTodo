# Pull request to lissy93/portainer-templates

Submitted on 2026-10-24 as [lissy93/portainer-templates#160](https://github.com/lissy93/portainer-templates/pull/160). The title and body below are what was submitted, kept as the record of it; later updates to the app are separate pull requests (see ../README.md).

## Title

Add OpenTodo (app source)

## Body

### Category
New app source

### Summary
Adds [OpenTodo](https://github.com/pixari/opentodo) as an `app` source. OpenTodo is an open-source (AGPL-3.0), self-hosted, local-first task manager: one container with SQLite, an embedded web app that works offline and syncs every device. The template lives in the OpenTodo repository on `main`, at https://raw.githubusercontent.com/pixari/opentodo/main/deploy/portainer/portainer-template.json, and holds one container template (no `id`):

- official image `ghcr.io/pixari/opentodo:stable` (amd64 and arm64; `stable` is moved by every release), `unless-stopped`, port `8080:8080/tcp`, one new volume on `/data`;
- four optional, labelled variables with safe defaults (setup token, public https address, sign-up, trusted proxies). No secrets, no default passwords;
- a note covering the port, the first visit creating the owner account (with the optional setup token), where the data lives, and what needs https.

`python3 lib/validate_sources.py <raw URL>` and `python3 lib/validate_sources.py sources.csv` pass with 0 errors and 0 warnings.

Tested in Portainer CE 2.45.3 on a clean Docker host (a fresh Docker-in-Docker engine, added as the local environment): with the raw URL above as the App Templates URL, I deployed OpenTodo from **Templates → Application** with the form left at its defaults. The container came up healthy on port 8080; in the browser I created the owner account and added a task. Recreating the container with the image re-pulled (Portainer's recreate with `PullImage`) and restarting the whole Docker host both kept the account and the task, and the container came back by itself after the host restart.

### Checklist
- [x] I've read the [contributing guide](.github/CONTRIBUTING.md)
- [x] I've self-reviewed my changes to ensure they are valid
- [x] I'm not modifying `templates.json` directly (it's auto-generated)
- [x] My template URL points at a branch (not a tag or commit), so updates flow through
- [x] I've removed my app's old copy from `sources/local/`, if it had one (it had none)

### Screenshots
The deploy form in Portainer CE 2.45.3, and OpenTodo signed in again after the container was recreated:

![Deploy form](https://raw.githubusercontent.com/pixari/portainer-templates/pr-assets/opentodo/portainer-deploy-form.png)
![After recreate](https://raw.githubusercontent.com/pixari/portainer-templates/pr-assets/opentodo/portainer-after-recreate.png)
