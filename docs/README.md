# OpenTodo documentation

Start with the [README](../README.md) for the feature overview, quick start and configuration table.

## Using OpenTodo

| Guide | What it covers |
| --- | --- |
| [Quick add syntax](quick-add.md) | Natural-language capture in six languages, preview chips, voice capture |
| [Filter queries](filters.md) | The filter language, the Filter view, saved views and dashboards |
| [Recurring tasks](recurrence.md) | Rule grammar, how next dates are computed, completing, skipping and detaching |
| [Reminders and notifications](reminders.md) | Relative and absolute reminders, snooze, web push and its privacy |
| [Capturing pages](capture.md) | Share sheet, bookmarklet and browser extension |
| [Importing data](import.md) | Own export, CSV and other apps' JSON exports; duplicates and undo |
| [End-to-end encryption](e2ee.md) | What is encrypted, the threat model, devices, recovery and limits |

## Self-hosting and operations

| Guide | What it covers |
| --- | --- |
| [Running with Docker](self-hosting/docker.md) | Compose, `docker run`, reverse proxies, push, bind mounts, recovery commands |
| [Deploying on Coolify](self-hosting/coolify.md) | One-click deployment from the compose file, environment variables, troubleshooting |
| [Single sign-on](self-hosting/sso.md) | Connecting an OpenID Connect provider, linking, SSO-only mode, break-glass |
| [Backups](backups.md) | Scheduled backups to disk, S3 or WebDAV, encryption, restore, archive format |
| [Email to task](email.md) | Pointing OpenTodo at an IMAP mailbox, provider notes, protection |
| [Calendar apps (CalDAV)](caldav.md) | Enabling CalDAV, app passwords, client setup, what maps to what |

The full list of environment variables is in the [README](../README.md#configuration); security details are in [SECURITY.md](../SECURITY.md).

## Integrations

| Guide | What it covers |
| --- | --- |
| [HTTP API](api.md) | Authentication, every route, entity fields, error codes, examples |
| [Command-line client](cli.md) | `ot`: install, sign in, commands, JSON output and exit codes |
| [Webhooks](webhooks.md) | Events, payload, signature verification, retries, receiver recipes |
| [AI assistants (MCP)](mcp.md) | Enabling the read-only MCP endpoint, tokens, tools and resources |

## Internals

| Guide | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Data flow, server packages, tables, client modules, build |
| [Sync protocol](sync.md) | Operations, schema, winner rule, exchange, sharing scopes, live updates, purge |

## Project

[Changelog](../CHANGELOG.md) · [Roadmap](../ROADMAP.md) · [Security policy](../SECURITY.md) · [Contributing](../CONTRIBUTING.md)
