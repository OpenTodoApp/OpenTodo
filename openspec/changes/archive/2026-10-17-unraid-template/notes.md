# Notes

## Verification (task 2.3), 2026-10-16

No Docker in the build environment, so the server binary was started the way the template starts the container: the template's variables with their defaults (`OPENTODO_BASE_URL=`, `OPENTODO_SETUP_TOKEN=`, `OPENTODO_ALLOW_SIGNUP=false`, `OPENTODO_TRUSTED_PROXIES=`, `OPENTODO_PUSH=on`, `OPENTODO_SESSION_DAYS=90`, `OPENTODO_TRASH_RETENTION_DAYS=30`, `OPENTODO_IMPORT_MAX_MB=20`, `OPENTODO_LOG_LEVEL=info`), a fresh folder as the appdata path, port 8080 equivalent.

- Started; `/opentodo healthcheck` passed. Empty base URL and setup token are accepted.
- In Chromium over plain http on the host's network address (not localhost), the first visitor created the owner and a task added in the Inbox reached the server. This needs the plain-http fix (pull request #99); on v0.6.0 the same flow shows Offline and saves nothing.
- Restarted on the same folder: the task was still there.
- `deploy/unraid/opentodo.xml` parses with Python's `xml.etree` and PHP's `simplexml_load_file` (what Unraid uses).

Not tested on a real Unraid server: the maintainer does that before submitting to Community Applications (deploy/unraid/README.md, step 1).

## Permissions

The tester on #4 ran the image with its default user (65532) on `/mnt/user/appdata/opentodo` and signed up, so a default appdata share is writable for it. The template therefore keeps the image's user; the guide gives `chown` and `--user 99:100` for shares with stricter permissions.
