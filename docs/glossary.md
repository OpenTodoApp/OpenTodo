---
title: Glossary
summary: Every abbreviation and uncommon term OpenTodo shows, explained in one or two plain sentences.
audience: user
section: Reference
specs: [documentation]
order: 76
---
# Glossary

The abbreviations and terms you may meet in the app and in this guide, in alphabetical order.

- **API** (application programming interface): the way another program talks to your OpenTodo server, with an API token from Settings → Integrations. See [API](api.md).
- **CalDAV**: the standard calendar apps use to sync tasks and events. OpenTodo speaks it so Apple Reminders, Thunderbird and others can show your tasks. See [CalDAV](caldav.md).
- **CLI** (command-line interface): the `ot` command for the terminal, which does what the app does from a script or a shell. See [Command line](cli.md).
- **CSV** (comma-separated values): a spreadsheet saved as plain text, one row per line. You can import one. See [Import](import.md).
- **E2EE** (end-to-end encryption): your task text is encrypted on your devices with a key the server never sees. See [End-to-end encryption](e2ee.md).
- **GTD** (Getting Things Done): a method of working from an inbox, next actions, waiting-for and someday lists, with a weekly review. OpenTodo's Open Loops mode follows it.
- **HLC** (hybrid logical clock): the time stamp every change carries so that devices agree on the order of edits even when their clocks differ. See [Sync](sync.md).
- **IMAP**: the protocol mail apps use to read a mailbox. The server owner can point OpenTodo at a mailbox so that emails become tasks. See [Email to task](email.md).
- **MCP** (Model Context Protocol): the way an AI assistant you already use connects to your tasks, read-only unless you allow changes. See [MCP](mcp.md).
- **OIDC** (OpenID Connect): single sign-on with an identity provider such as Authentik, Keycloak or Google. See [Account security](account-security.md).
- **Passkey**: a sign-in without a password, stored on your device or in your password manager and unlocked with your fingerprint, face or PIN. See [Account security](account-security.md).
- **PWA** (progressive web app): a website you install like an app; OpenTodo is one, so it works offline and sends notifications. See [Install the app](install-app.md).
- **SMTP**: the protocol for sending email. The server owner configures it so OpenTodo can send invitations and the weekly digest. See [Email](email.md).
- **SSO** (single sign-on): signing in with an account you already have elsewhere; see OIDC.
- **TOTP** (time-based one-time password): the six-digit code an authenticator app shows for two-factor authentication. See [Two-factor authentication](two-factor.md).
- **VAPID**: the key pair that lets your server send push notifications to your browser without a third party. See [Push notifications](push-notifications.md).
- **WebDAV**: the file-sharing protocol CalDAV is built on; some calendar apps name it when you add a CalDAV account.
- **Webhook**: a message your server sends to an address you chose whenever a task or project changes. See [Webhooks](webhooks.md).
