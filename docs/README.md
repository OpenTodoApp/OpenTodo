---
layout: index
title: OpenTodo docs
summary: How to use OpenTodo day to day, run your own server, and connect it to other tools.
---
# OpenTodo documentation

Start with the [README](../README.md) for the feature overview, quick start and configuration table.

## Using OpenTodo

The same guides are published, with screenshots and search, at [opentodo.pixari.dev/docs](https://opentodo.pixari.dev/docs/).

| Guide | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | From the demo or your first sign-in to adding, scheduling and completing a task |
| [Installing the app](install-app.md) | Home screen and desktop install on iPhone, Android, Windows, macOS and Linux |
| [Tasks and projects](tasks-and-projects.md) | Editing tasks, notes, subtasks, priorities, projects and sub-projects |
| [Views](views.md) | Inbox, Today, Upcoming, the calendar, saved views, dashboards and the start view |
| [Sections and boards](sections-and-boards.md) | Sections in a project and the board layout |
| [Labels and filters](labels-and-filters.md) | Labels across projects and the filter language |
| [Recurring tasks and reminders](recurring-and-reminders.md) | Repeat rules, skipping, and reminders |
| [Time blocking](time-blocking.md) | Estimates and the Day and Week calendar |
| [Sharing and comments](sharing.md) | Roles, invitations, assignments, comments and the activity feed |
| [Notifications](notifications.md) | The bell, reminder pop-ups and push notifications |
| [Offline and sync](offline-and-sync.md) | Working offline, the sync status and several devices |
| [Keyboard shortcuts](keyboard.md) | Every shortcut, generated from the app, and Vim keybindings |
| [Account security](account-security.md) | Passkeys, two-factor authentication, password and sign-ins |
| [Import and export](import-export.md) | Downloading your data and importing from files |
| [Trash and history](trash-and-history.md) | Restoring deleted items, task history and archived projects |
| [Settings](settings.md) | A tour of every section of Settings |
| [Troubleshooting and FAQ](troubleshooting.md) | Fixes for common problems and frequent questions |

### Reference

| Page | What it covers |
| --- | --- |
| [Quick add syntax](quick-add.md) | Natural-language capture in six languages, preview chips, voice capture |
| [Filter queries](filters.md) | The filter language, the Filter view, saved views and dashboards |
| [Recurring task rules](recurrence.md) | Rule grammar, how next dates are computed, completing, skipping and detaching |
| [Reminders reference](reminders.md) | Relative and absolute reminders, snooze, web push and its privacy |
| [Capturing pages](capture.md) | Share sheet, bookmarklet and browser extension |
| [Import formats](import.md) | Own export, CSV and other apps' JSON exports; duplicates and undo |
| [End-to-end encryption](e2ee.md) | What is encrypted, the threat model, devices, recovery and limits |

## Self-hosting and operations

| Guide | What it covers |
| --- | --- |
| [Running with Docker](self-hosting/docker.md) | Compose, `docker run`, reverse proxies, push, bind mounts, recovery commands |
| [Deploying on Coolify](self-hosting/coolify.md) | One-click deployment from the compose file, environment variables, troubleshooting |
| [Public demo instance](self-hosting/demo.md) | `OPENTODO_DEMO=true`: a private sandbox per visitor, limits, expiry and the nightly reset, what is switched off, Docker and Coolify |
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
