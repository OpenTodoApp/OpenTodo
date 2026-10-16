# Unraid Community Applications template

[`opentodo.xml`](opentodo.xml) is an Unraid Community Applications (CA) template: the `0.6` image line, the web port 8080, the appdata folder `/mnt/user/appdata/opentodo` on `/data`, the Web UI link and icon, and the optional settings with their descriptions (base URL and setup token shown, the rest under **Show more settings**). No setting is required. The facts it shares with the other templates are in [`../deploy.json`](../deploy.json); `make check` keeps them in line ([`../README.md`](../README.md)).

**Status: to be submitted to Community Applications.** Until OpenTodo shows up in the **Apps** tab, install it from the template URL; the steps are in [docs/self-hosting/unraid.md](../../docs/self-hosting/unraid.md).

## Submitting to Community Applications (maintainer)

CA lists templates from repositories that are registered with it. One registration covers every later version.

1. Test first: install from the template URL on an Unraid server, open the Web UI, create the owner, add a task, restart the container and check the task is still there, then update the container and check again.
2. Templates are read from the default branch, so `TemplateURL` and `Icon` point to `main`. Keep them there.
3. Apply through the Community Applications support thread on the Unraid forums (the first post links the current application form) with this repository's URL, `https://github.com/pixari/opentodo`. The moderators review the template; they may ask for a support thread for OpenTodo on the forum, which then becomes the `<Support>` link.
4. Once listed, CA picks up changes to `opentodo.xml` on `main` by itself.

## After a release

When a new minor line is released (for example `0.7`), change `<Repository>` to `ghcr.io/pixari/opentodo:0.7`. Unraid users get patch releases of their line from **Check for Updates**; a new line needs the template change and then **Update** in their Docker tab.
