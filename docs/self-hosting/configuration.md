---
title: Configuration reference
summary: Every OPENTODO_* environment variable the server and the ot command read, with its default, an example and the page that explains it.
audience: admin
specs: [self-hosting]
screens: []
order: 2
---
# Configuration reference

**No variable is required.** The server starts with none set and every setting has a safe default. An invalid value stops startup with a message naming the variable.

Variables marked *preset* seed a setting once, on the first start; after that **Settings** decides. Variables marked *locks* override the setting and make its field read-only in Settings while they are set.

A test reads the code and fails when a variable is read but missing here, or listed here but never read.

- [Server and network](#server-and-network)
- [Accounts and sign-in](#accounts-and-sign-in)
- [Features](#features)
- [Outgoing email](#outgoing-email)
- [Email to task](#email-to-task)
- [Calendar sync clients](#calendar-sync-clients)
- [Backups](#backups)
- [Demo and host mode](#demo-and-host-mode)
- [The ot command](#the-ot-command)

## Server and network

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_ADDR` | `:8080` | `127.0.0.1:8080` | [Docker](docker.md#docker-compose) |
| `OPENTODO_PORT` | unset | `7610` | [Docker](docker.md#docker-compose): in the container it moves the process; in Compose's `.env` it only changes the published port |
| `OPENTODO_DATA_DIR` | `./data` (binary), `/data` (image) | `/var/lib/opentodo` | [Handbook](README.md#1-install) |
| `OPENTODO_BASE_URL` | unset, inferred from requests | `https://todo.example.com` | [Behind a reverse proxy](docker.md#behind-a-reverse-proxy) |
| `OPENTODO_TRUSTED_PROXIES` | loopback and private networks | `cloudflare` | [Behind a reverse proxy](docker.md#behind-a-reverse-proxy) |
| `OPENTODO_LOG_LEVEL` | `info` | `debug` | [Monitoring](README.md#6-monitoring) |

`OPENTODO_BIND` in the `.env` next to `docker-compose.yml` is read by Compose, not by the server: it sets the host address the port is published on (default `0.0.0.0`).

## Accounts and sign-in

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_SETUP_TOKEN` | unset | a secret of 16+ characters | [The setup code](docker.md#the-setup-code) |
| `OPENTODO_SETUP_CODE` | `off` | `required` | [The setup code](docker.md#the-setup-code) |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` | [Docker](docker.md#the-setup-code) |
| `OPENTODO_SESSION_DAYS` | `90` | `30` | [Account security](../account-security.md) |
| `OPENTODO_OIDC_ISSUER` | unset (locks) | `https://auth.example.com/application/o/opentodo/` | [Single sign-on](sso.md#configuration-through-the-environment) |
| `OPENTODO_OIDC_CLIENT_ID` | unset (locks) | `opentodo` | [Single sign-on](sso.md#configuration-through-the-environment) |
| `OPENTODO_OIDC_CLIENT_SECRET` | unset (locks) | the client secret | [Single sign-on](sso.md#configuration-through-the-environment) |
| `OPENTODO_OIDC_DISPLAY_NAME` | unset (locks) | `Authentik` | [Single sign-on](sso.md#configuration-through-the-environment) |
| `OPENTODO_OIDC_SSO_ONLY` | unset (locks) | `true` | [Single sign-on](sso.md#sso-only) |

## Features

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_PUSH` | `on` | `off` | [Push notifications](../push-notifications.md) |
| `OPENTODO_MCP` | unset, off (preset) | `true` | [AI assistants (MCP)](../mcp.md#1-enable-it-owner) |
| `OPENTODO_MCP_WRITES` | unset, off (preset) | `true` | [AI assistants (MCP)](../mcp.md#letting-an-assistant-make-changes) |
| `OPENTODO_CALDAV` | unset, off (preset) | `true` | [Calendar apps (CalDAV)](../caldav.md) |
| `OPENTODO_CALENDAR_FEEDS` | unset, off (preset) | `true` | [Calendar feeds](../calendar-feeds.md) |
| `OPENTODO_AUTOMATIONS` | unset, on (locks) | `off` | [Automations](../automations.md) |
| `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` | unset, off (preset) | `true` | [Webhooks](../webhooks.md#private-network-protection) |
| `OPENTODO_IMPORT_MAX_MB` | `20` | `100` (1–200) | [Import formats](../import.md) |
| `OPENTODO_ATTACHMENTS_MAX_FILE_MB` | `25` (preset) | `100` (1–2048) | [Attachments](docker.md#attachments) |
| `OPENTODO_ATTACHMENTS_QUOTA_MB` | `1024` (preset) | `0` (unlimited) | [Attachments](docker.md#attachments) |
| `OPENTODO_TRASH_RETENTION_DAYS` | `30` | `0` (never purge) | [Trash retention](docker.md#trash-retention) |
| `OPENTODO_MAPS` | `on` | `off` | [Maps](maps.md) |
| `OPENTODO_MAPS_TILES_URL` | `https://tiles.openfreemap.org/styles/liberty` | your own style URL | [Maps](maps.md) |
| `OPENTODO_MAPS_GEOCODER_URL` | `https://photon.komoot.io` | `http://photon:2322` | [Maps](maps.md) |
| `OPENTODO_STT_URL` | unset, off (locks) | `http://speaches:8000` | [Speech to text](speech-to-text.md) |
| `OPENTODO_STT_MODEL` | unset (locks) | `Systran/faster-whisper-small` | [Speech to text](speech-to-text.md) |
| `OPENTODO_STT_KEY_FILE` | unset (locks) | `/run/secrets/stt_key` | [Speech to text](speech-to-text.md) |

## Outgoing email

`HOST` and `FROM` go together. Each one set locks its field in **Settings → Server → Outgoing email**.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_SMTP_HOST` | unset, off | `smtp.example.com:587` | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |
| `OPENTODO_SMTP_SECURITY` | from the port | `starttls` | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |
| `OPENTODO_SMTP_USER` | unset | `todo@example.com` | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |
| `OPENTODO_SMTP_PASSWORD` | unset | the password | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |
| `OPENTODO_SMTP_PASSWORD_FILE` | unset | `/run/secrets/smtp_password` | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |
| `OPENTODO_SMTP_FROM` | unset | `OpenTodo <todo@example.com>` | [Outgoing email](outgoing-email.md#configure-with-environment-variables) |

## Email to task

The first four go together and turn it on; setting only some stops startup.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_EMAIL_ADDRESS` | unset, off | `todo@example.com` | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_IMAP_HOST` | unset | `imap.example.com:993` | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_IMAP_USER` | unset | `todo@example.com` | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_IMAP_PASSWORD` | unset | the password | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_IMAP_PASSWORD_FILE` | unset | `/run/secrets/imap_password` | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_IMAP_MAILBOX` | `INBOX` | `Tasks` | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_POLL_SECONDS` | `60` | `300` (at least 15) | [Email to task](../email.md#operator-setup) |
| `OPENTODO_EMAIL_PROCESSED` | `move:OpenTodo/Processed` | `delete` | [Email to task](../email.md#operator-setup) |

## Calendar sync clients

The id and a secret go together; set, they lock the client in **Settings → Integrations → Calendar sync**.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_GOOGLE_CLIENT_ID` | unset | `1234-abc.apps.googleusercontent.com` | [Calendar sync](../calendar-sync.md#set-up-the-google-client-server-owner) |
| `OPENTODO_GOOGLE_CLIENT_SECRET` | unset | the client secret | [Calendar sync](../calendar-sync.md#set-up-the-google-client-server-owner) |
| `OPENTODO_GOOGLE_CLIENT_SECRET_FILE` | unset | `/run/secrets/google_secret` | [Calendar sync](../calendar-sync.md#set-up-the-google-client-server-owner) |
| `OPENTODO_MICROSOFT_CLIENT_ID` | unset | the application (client) id | [Calendar sync](../calendar-sync.md#set-up-the-microsoft-client-server-owner) |
| `OPENTODO_MICROSOFT_CLIENT_SECRET` | unset | the client secret value | [Calendar sync](../calendar-sync.md#set-up-the-microsoft-client-server-owner) |
| `OPENTODO_MICROSOFT_CLIENT_SECRET_FILE` | unset | `/run/secrets/microsoft_secret` | [Calendar sync](../calendar-sync.md#set-up-the-microsoft-client-server-owner) |
| `OPENTODO_MICROSOFT_TENANT` | `common` | `organizations` | [Calendar sync](../calendar-sync.md#set-up-the-microsoft-client-server-owner) |

## Backups

All are presets, applied once when no backup settings exist yet.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_BACKUP_DESTINATION` | unset | `local`, `s3` or `webdav` | [Backups](../backups.md#environment-presets) |
| `OPENTODO_BACKUP_LOCAL_DIR` | `<data>/backups` | `/backups` | [Backups](../backups.md#folder-on-the-server) |
| `OPENTODO_BACKUP_SCHEDULE` | unset | `daily` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_TIME` | unset | `03:00` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_WEEKDAY` | unset | `sunday` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_KEEP` | unset | `14` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_MAX_AGE_DAYS` | unset | `90` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_COMPRESS` | unset | `true` | [Backups](../backups.md#schedule-and-retention) |
| `OPENTODO_BACKUP_PASSPHRASE` | unset | a long passphrase | [Backups](../backups.md#encryption-and-secrets) |
| `OPENTODO_BACKUP_PASSPHRASE_FILE` | unset | `/run/secrets/backup_passphrase` | [Backups](../backups.md#encryption-and-secrets) |
| `OPENTODO_BACKUP_S3_ENDPOINT` | unset | `https://s3.eu-central-1.amazonaws.com` | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_REGION` | unset | `eu-central-1` | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_BUCKET` | unset | `opentodo-backups` | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_PREFIX` | unset | `home/` | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_ACCESS_KEY` | unset | the access key id | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_SECRET_KEY` | unset | the secret key | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_S3_PATH_STYLE` | unset | `true` | [Backups](../backups.md#s3-compatible-storage) |
| `OPENTODO_BACKUP_WEBDAV_URL` | unset | `https://cloud.example.com/remote.php/dav/files/me/backups/` | [Backups](../backups.md#webdav) |
| `OPENTODO_BACKUP_WEBDAV_USERNAME` | unset | `me` | [Backups](../backups.md#webdav) |
| `OPENTODO_BACKUP_WEBDAV_PASSWORD` | unset | an app password | [Backups](../backups.md#webdav) |
| `OPENTODO_BACKUP_WEBDAV_ALLOW_HTTP` | unset | `true` | [Backups](../backups.md#webdav) |

## Demo and host mode

Neither is needed to self-host.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_DEMO` | unset, off | `true` | [Public demo instance](demo.md) |
| `OPENTODO_DEMO_MAX_SANDBOXES` | `500` | `100` | [Public demo instance](demo.md#limits) |
| `OPENTODO_DEMO_MAX_DB_MB` | `1024` | `512` | [Public demo instance](demo.md#limits) |
| `OPENTODO_HOST_URL` | unset, off | `https://example.cloud` | [Host mode](host-mode.md) |
| `OPENTODO_HOST_TOKEN` | unset | a secret of 32+ characters | [Host mode](host-mode.md) |
| `OPENTODO_HOST_OPERATOR_ADDR` | `127.0.0.1:8081` | `10.0.0.5:8081` | [Host mode](host-mode.md) |
| `OPENTODO_HOST_IDLE_MINUTES` | `10` | `30` | [Host mode](host-mode.md) |
| `OPENTODO_HOST_MAX_OPEN` | `500` | `1000` | [Host mode](host-mode.md) |
| `OPENTODO_HOST_LIMITS` | unset | `db_mb=500,ops_per_hour=5000,members=10` | [Host mode](host-mode.md) |

## The ot command

Read by the `ot` client, not the server.

| Variable | Default | Example | Explained in |
| --- | --- | --- | --- |
| `OPENTODO_URL` | the profile's server | `https://todo.example.com` | [Command-line client](../cli.md) |
| `OPENTODO_TOKEN` | the profile's token | `ot_…` | [Command-line client](../cli.md) |
| `OPENTODO_PROFILE` | `default` | `work` | [Command-line client](../cli.md) |
| `OPENTODO_CONFIG` | the user config directory | `/path/to/config.json` | [Command-line client](../cli.md) |
| `OPENTODO_WORKSPACE` | the default workspace | `Work` | [Command-line client](../cli.md) |
| `OPENTODO_READ_ONLY` | unset | `1` | [Command-line client](../cli.md) |
