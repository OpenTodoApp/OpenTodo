# OpenTodo app store for Runtipi

This is [OpenTodo](https://open-todo.app)'s app store for [Runtipi](https://runtipi.io). It holds one app, OpenTodo: an open-source, local-first task manager that runs on your own server.

The files are published from [`deploy/runtipi/upstream/`](https://github.com/pixari/opentodo/tree/main/deploy/runtipi/upstream) in the OpenTodo repository; change them there.

## Add the store to Runtipi

1. In Runtipi, open **Settings**, then **App Stores → Add App Store**.
2. Paste `https://github.com/pixari/opentodo-runtipi` and give it a name, such as `opentodo`.
3. Open the app store, search for **OpenTodo** and install it.

Runtipi 4.7.0 or newer is needed. The install guide is at [open-todo.app/docs/self-hosting/runtipi](https://open-todo.app/docs/self-hosting/runtipi).

## Layout

- `apps/opentodo/config.json`: the app's settings for Runtipi (port, form fields, version).
- `apps/opentodo/docker-compose.yml`: the containers, in Runtipi's native compose format (`x-runtipi`, schema version 2).
- `apps/opentodo/metadata/`: the description and logo shown in the app store.
- `__tests__/apps.test.ts`: checks every app against Runtipi's app format. Run `bun install && bun test`.

## Updates

The **Renovate** workflow (`.github/workflows/renovate.yml`) runs every night. When a new OpenTodo release is published it opens a pull request that changes the image tag in `docker-compose.yml`, and `scripts/update-config.ts` raises `version`, `tipi_version` and `updated_at` in `config.json`, which is what makes Runtipi offer the update. Merge the pull request after the tests pass. Runtipi shows the update once it refreshes its app stores (**Settings → Update App Stores** does it right away).

## License

MIT. OpenTodo itself is AGPL-3.0.
