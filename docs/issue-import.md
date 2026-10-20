---
title: Issue import
summary: Bring the open GitHub and GitLab issues assigned to you into OpenTodo as tasks that complete when the issue closes.
audience: user
section: Integrations
specs: [webhooks, end-to-end-encryption]
screens: [settings/issues]
order: 35
---
# Issue import

Connect a GitHub or GitLab account and the open issues assigned to you become tasks. They show up in Today, Next and your weekly review next to everything else, and they follow the issue: when it closes, the task is completed; when it reopens, the task reopens; when it is renamed, the task is renamed. Nothing is ever written back to GitHub or GitLab.

The server owner turns issue import on under **Settings → Integrations → Issues**. Until then the panel says so and nothing is fetched.

## Connect an account

1. Create a personal access token that can read issues:
   - **GitHub**: Settings → Developer settings → Fine-grained tokens, with **Issues: Read-only** on the repositories you want (or a classic token with `repo` for private repositories).
   - **GitLab**: Preferences → Access tokens, with the `read_api` scope. On a self-hosted GitLab, use its own address.
   Give the token an expiry date; you can replace it at any time.
2. Open **Settings → Integrations → Issues** and choose **Connect issues**.
3. Pick the provider, keep `https://github.com` or `https://gitlab.com` or enter your own instance, and paste the token. The token is stored on your server, outside the database and its backups, and is never shown again.
4. Choose which issues: all issues assigned to you, or only those in up to 20 repositories or projects. You can also require up to 10 labels.
5. Choose the project the tasks go to (or the Inbox), whether issue labels become OpenTodo labels, and how often to check: every 15 minutes to once a day.

The connection checks the token at once and shows the account it belongs to. **Test token** checks it again later.

## What follows the issue

- A new open issue becomes a task with the issue's title, its text as notes and a link back to the issue. Issues that were already closed are not imported.
- Closing the issue completes the task on the day it closed; reopening it reopens the task; renaming it renames the task.
- Your own edits win until the issue changes the same thing again. Complete a task yourself and it stays completed; rename it and it keeps your title until the issue is renamed.
- The notes are written once. Later edits to the issue text are not copied.
- Nothing is ever deleted. A task you moved to the Trash stays there. An issue that is unassigned from you, or loses a label you filter on, leaves its task as it is.
- With label mapping on, each issue label becomes the label of the same name, created when missing. Labels you add yourself are kept.

Tasks arrive on your devices with their next sync, like tasks from any other device, and work offline like every task. Pull requests and merge requests are never imported.

## The connection card

Each connection shows its state first: up to date and when, failed with the last error, or stopped with the reason. Then the host and account, the project, the filter and what the last run did. Use **Sync now** to check at once; checks and syncs are limited to 12 an hour.

A connection stops, and waits for you, when the provider refuses the token, when the host turns out to be on a private network the owner has not allowed, or when no token is stored. A restored backup never contains tokens, so after a restore enter each token again with **Edit → Replace token**. When the host is down, the wait between checks doubles, up to six hours.

## Limits

- Up to five connections per account, at most 1,000 new tasks per check; a larger backlog arrives over the next checks.
- Hosts on your local network work only when the owner allows private network targets (**Settings → Integrations → Webhooks**).
- Accounts with [end-to-end encryption](e2ee.md) cannot use issue import: the server would write issue text into the history unencrypted. Turning encryption on stops existing connections; their tasks stay.

Deleting a connection removes its token. The tasks it created stay as ordinary tasks.
