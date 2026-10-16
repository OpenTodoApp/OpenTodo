# Unraid Community Applications template

[`opentodo.xml`](opentodo.xml) is an Unraid Community Applications (CA) template: the `0.6` image line, the web port 8080, the appdata folder `/mnt/user/appdata/opentodo` on `/data`, the Web UI link and icon, and the optional settings with their descriptions (base URL and setup token shown, the rest under **Show more settings**). No setting is required. The facts it shares with the other templates are in [`../deploy.json`](../deploy.json); `make check` keeps them in line ([`../README.md`](../README.md)).

**Status: to be submitted to Community Applications.** Until OpenTodo shows up in the **Apps** tab, install it from the template URL; the steps are in [docs/self-hosting/unraid.md](../../docs/self-hosting/unraid.md).

## The template repository

CA lists apps from template repositories: a repository with `ca_profile.xml` at its root and one XML file per app under `templates/`, under an OSI-approved license. OpenTodo's is [`pixari/opentodo-unraid`](https://github.com/pixari/opentodo-unraid), so the app's own repository keeps its root to itself.

[`upstream/`](upstream/) is that repository's content, file for file:

| File | What it is |
| --- | --- |
| `templates/opentodo.xml` | An identical copy of [`opentodo.xml`](opentodo.xml) |
| `ca_profile.xml` | The repository overview CA shows, with the icon and links |
| `README.md` | Install steps, and a note that the files are published from here |
| `LICENSE` | MIT |

`make check` fails when the copy differs from `opentodo.xml` or the profile is missing. `<TemplateURL>` is the raw URL of the copy in the template repository, which is where Unraid looks for template updates.

Edit the template here, never in the template repository. To publish, copy `upstream/` over the template repository's content on its `main` branch and push:

```bash
git clone https://github.com/pixari/opentodo-unraid /tmp/opentodo-unraid
cp -R deploy/unraid/upstream/. /tmp/opentodo-unraid/
cd /tmp/opentodo-unraid && git add -A && git commit -m "OpenTodo template: <what changed>" && git push
```

## Submitting to Community Applications (maintainer)

One submission covers the repository and every later version of the template.

1. Test first: install from the template URL on an Unraid server, open the Web UI, create the owner, add a task, restart the container and check the task is still there, then update the container and check again.
2. Make sure the template repository is public and matches `upstream/`.
3. Submit it at [ca.unraid.net/submit](https://ca.unraid.net/submit): sign in, enter `https://github.com/pixari/opentodo-unraid`, run **Validate** and **Scan**, fix anything they report (here, then publish again) and submit. The CA moderators review it; they may ask for a support thread on the Unraid forums, which then becomes the `<Support>` link.
4. Once listed, CA picks up changes to the template repository's `main` by itself.

## After a release

When a new minor line is released (for example `0.7`), change `<Repository>` to `ghcr.io/pixari/opentodo:0.7` in `opentodo.xml`, copy it to `upstream/templates/opentodo.xml` (the check fails until both name the new line) and publish. Unraid users get patch releases of their line from **Check for Updates**; a new line arrives as a template update, then **Update** in their Docker tab.
