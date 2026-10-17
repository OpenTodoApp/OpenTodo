# Pull request to Lissy93/portainer-templates

Change: one row added to the bottom of `sources.csv`, exactly the line in `sources.csv.row`. Nothing else: `templates.json` is generated, and OpenTodo has no copy in `sources/local/` or `overrides.json`.

Branch in the fork: `add-opentodo`.

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

`python3 lib/validate_sources.py <raw URL>` and `python3 lib/validate_sources.py sources.csv` pass with 0 errors and 0 warnings. Portainer CE 2.45.2 loads the file as an App Templates URL, and the container starts with the defaults, creates the owner account and keeps its data when it is recreated.

### Checklist

- [x] I've read the [contributing guide](.github/CONTRIBUTING.md)
- [x] I've self-reviewed my changes to ensure they are valid
- [x] I'm not modifying `templates.json` directly (it's auto-generated)

- [x] My template URL points at a branch (not a tag or commit), so updates flow through
- [x] I've removed my app's old copy from `sources/local/`, if it had one
