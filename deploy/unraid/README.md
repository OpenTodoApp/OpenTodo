# Unraid Community Applications template

[`opentodo.xml`](opentodo.xml) is an Unraid Community Applications (CA) template: the `stable` image (every release moves it), the web port 8080, the appdata folder `/mnt/user/appdata/opentodo` on `/data`, the Web UI link and icon, and the optional settings with their descriptions (base URL and setup token shown, the rest under **Show more settings**). No setting is required. The facts it shares with the other templates are in [`../deploy.json`](../deploy.json); `make check` keeps them in line ([`../README.md`](../README.md)).

**Status: listed in Community Applications.** Unraid users install OpenTodo from the **Apps** tab; the steps are in [docs/self-hosting/unraid.md](../../docs/self-hosting/unraid.md).

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

Done: the template repository was submitted and approved. One submission covers the repository and every later version of the template; the steps are kept for reference.

1. Test first: install from the template URL on an Unraid server, open the Web UI, create the owner, add a task, restart the container and check the task is still there, then update the container and check again.
2. Make sure the template repository is public and matches `upstream/`.
3. Submit it at [ca.unraid.net/submit](https://ca.unraid.net/submit): sign in, enter `https://github.com/pixari/opentodo-unraid`, run **Validate** and **Scan**, fix anything they report (here, then publish again) and submit. The CA moderators review it; they may ask for a support thread on the Unraid forums, which then becomes the `<Support>` link.
4. Once listed, CA picks up changes to the template repository's `main` by itself.

## After a release

Nothing to do. The template names `ghcr.io/pixari/opentodo:stable`, which every release moves; Unraid users see the release in **Check for Updates** and install it with **Update**. Republish the template repository only when the template itself changes.
