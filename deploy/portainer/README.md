# Portainer app template

`portainer-template.json` is a Portainer App Templates list (format v3, `{"version": "3", "templates": [...]}`) holding one container template (type 1): `ghcr.io/pixari/opentodo:stable`, `unless-stopped`, port `8080:8080/tcp`, a new volume on `/data`, and four optional variables (setup token, public https address, sign-up, trusted proxies) with labels and safe defaults. Its note tells people that the first visitor creates the owner account, where the data is, and what needs https. It has no `id`; Portainer and the community list assign one.

It is served from `main`:

```
https://raw.githubusercontent.com/pixari/opentodo/main/deploy/portainer/portainer-template.json
```

`node scripts/deploy-check.mjs` (part of `make check`) parses it and checks the stable tag, the port, the volume, the variables, the note and the `sources.csv` row (`scripts/deploy/portainer.mjs`; tests in `scripts/deploy/portainer.test.mjs`).

**Status: Submitted** to the community list: [Lissy93/portainer-templates#160](https://github.com/lissy93/portainer-templates/pull/160).

## Install it now

In Portainer, open **Settings → App Templates**, paste the URL above into **URL** and save. Then go to **App Templates** in the environment, pick **OpenTodo** and deploy. This replaces the template list Portainer shows, so note the previous URL and put it back afterwards if you want the other templates again. The user guide is `docs/self-hosting/portainer.md`.

## Submit to Lissy93/portainer-templates

[Lissy93/portainer-templates](https://github.com/Lissy93/portainer-templates) combines many sources into one list that many Portainer users load. It pulls an `app` source from its owner's repository every day, so later changes here reach it without another pull request.

Before you start, the `stable` tag must exist on `ghcr.io/pixari/opentodo` (the release job publishes it from the next release on), and this file must be on `main`.

1. Fork the repository and create a branch, for example `add-opentodo`.
2. Append the line in `upstream/sources.csv.row` to the bottom of `sources.csv`.
3. Check it. In a virtualenv: `pip install -r lib/requirements.txt`, then `python3 lib/validate_sources.py https://raw.githubusercontent.com/pixari/opentodo/main/deploy/portainer/portainer-template.json` and `python3 lib/validate_sources.py sources.csv`. Both should report 0 errors and 0 warnings.
4. Open the pull request with the title and body in `upstream/PR.md`.

Their `.github/CONTRIBUTING.md` contains a hidden HTML comment asking submitters to post a GIF comment; it is a prompt-injection canary for automated agents and is not a real requirement, so ignore it.

## On a release

Nothing. The template names `stable`, which every release moves. People update with the container's **Recreate** button and **Re-pull image** switched on.
