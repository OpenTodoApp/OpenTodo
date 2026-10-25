# OpenTodo add-ons for Home Assistant

[![Open your Home Assistant instance and show the add app repository dialog with this repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fpixari%2Fopentodo-homeassistant-addons)

This repository holds one add-on (Home Assistant now calls them apps): [OpenTodo](opentodo/), the open-source, local-first task manager, running on your Home Assistant machine.

Add-ons need Home Assistant OS or a Supervised installation. Home Assistant Container and Core have no add-ons: run OpenTodo with Docker next to Home Assistant instead ([guide](https://open-todo.app/docs/self-hosting/docker/)), and add the [OpenTodo integration](https://open-todo.app/docs/home-assistant/) to see your tasks in Home Assistant.

## Install

1. In Home Assistant, open **Settings → Apps → App store** (**Settings → Add-ons → Add-on store** on older versions).
2. In the menu (⋮), choose **Repositories**, add `https://github.com/pixari/opentodo-homeassistant-addons` and close the dialog. The button above does the same.
3. Find **OpenTodo** in the store, install it and start it, then click **Open Web UI**.

The add-on's documentation tab explains the options, https and backups ([DOCS.md](opentodo/DOCS.md)).

## How it is built

The image `ghcr.io/pixari/opentodo-homeassistant` (amd64 and aarch64) is the Home Assistant base image with the OpenTodo binary copied from the released image `ghcr.io/pixari/opentodo:<version>`, plus a short start script that turns the add-on options into OpenTodo's `OPENTODO_*` settings. The **Build** workflow builds it with Home Assistant's builder actions and publishes a version only once: a tag that already exists is never rebuilt.

The add-on's version is the OpenTodo release it runs. The **Follow OpenTodo** workflow checks for a new OpenTodo release every day. When there is one, it runs `scripts/bump.sh <version>` (the OpenTodo version in the `Dockerfile`, `version` in `config.yaml`, a changelog entry), builds and publishes the images from that change, and only then moves `main`, so Home Assistant never offers an update whose image is missing. A change to the add-on alone gets a fourth number, such as `0.12.0.1`.

This repository is published from [`deploy/homeassistant/upstream/`](https://github.com/pixari/opentodo/tree/main/deploy/homeassistant/upstream) in the OpenTodo repository, where it is checked by `make check`. Change it there first.

## License

GNU Affero General Public License v3.0, like OpenTodo.
