---
title: Security limits
summary: What OpenTodo does not protect, in one place: what the operator sees, what is unencrypted at rest, backups, host mode, the demo and scale.
audience: developer
section: Internals
specs: []
screens: []
order: 43
---
# Security limits

This page lists, in one place, what OpenTodo does **not** protect, so nobody has to infer it from the controls. The [threat model](threat-model.md) explains each point in context, with the mechanisms and tests behind the parts that are protected.

## The server operator, without end-to-end encryption

Whoever runs the server, or can read its data directory, can see:

- **All content of every account:**
  - tasks, notes, comments and project, label and section names;
  - attachments, as plain files under `<data>/attachments/`;
  - task pages and their replies.
- **The full history.** The op log keeps who changed which field, to what, from which device and when, including values later overwritten. Purged history and items deleted from the Trash leave the live database, but not older backups.
- **Accounts:**
  - email addresses, names and roles;
  - passkey public keys;
  - TOTP secrets, which the server needs in readable form to check codes;
  - the audit log, with client addresses when the owner turned address logging on.
  
  Passwords (argon2id) and session, token, app password and link secrets (SHA-256) are stored only as hashes.
- **Credentials for other services,** in `<data>/secrets/*.json` (mode 0600, readable form): SMTP, single sign-on client secret, backup destinations and passphrase, assistant provider keys, issue tokens, calendar sync passwords and refresh tokens, notification channel secrets, speech-to-text key.
- **Traffic as it happens:** what people do and when, and the email-to-task messages read from the mailbox.
- **What the server sends out:** webhook payloads and delivery channel messages go to the addresses users set. With the assistant on, the conversation and read-tool results go to the model provider the person accepted.

The operator also controls the code the browser runs. They can change it to capture anything a user types.

## The server operator, with end-to-end encryption

Encryption hides **content fields** from the server: titles, descriptions, notes, comments, names and the other fields listed in [End-to-end encryption](../e2ee.md). It does not hide:

- **Metadata:**
  - dates, times, priorities, completion, structure (projects, parents, sections, label ids on tasks), assignees and recurrence;
  - reminder times, tracked time, reactions and attachment sizes;
  - every timestamp and device id of the op log.
- **The shape of activity:** how many items there are, when each was edited, from how many devices, and the approximate length of each text (ciphertext length follows plaintext length).
- **Shared projects.** They are never encrypted.
- **Plaintext from before encryption was turned on,** until **Purge plaintext history**, and in backups made before the purge.
- **Older versions.** The server can serve an older ciphertext of the same field, and the app cannot tell.
- **The device relay.** While a device is opted in to answer for AI assistants and is unlocked, the server can ask it to decrypt or encrypt values within its caps.
- **The code.** A malicious server can serve tampered JavaScript that captures the passphrase.

## What is not encrypted at rest

The server does not encrypt its own storage. Use disk or volume encryption on the host for that.

| Data | At rest |
|---|---|
| `opentodo.db` (accounts, op log, audit log, settings) | Unencrypted SQLite. Content fields of encrypted accounts are ciphertext inside it |
| `<data>/attachments/` | Unencrypted files, except files of encrypted accounts, which are encrypted on the device |
| `<data>/secrets/*.json` | Unencrypted JSON, mode 0600 |
| `<data>/cache/maps` | Map tiles and styles. No account data |
| Each device's IndexedDB | Unencrypted on the device, including for encrypted accounts. The browser and the operating system protect it. **Lock this device** forgets the key; signing out clears the data |
| Backup archives | Encrypted only when a backup passphrase is set (argon2id and AES-256-GCM) |

## What a backup contains

An archive holds:

- a consistent copy of the whole database: every account, session and token hash, invitation, project, task, label, the complete op log and the audit log;
- the web push key pair;
- every attachment file.

It never holds `<data>/secrets/` or earlier archives. Without a passphrase, anyone who can read the archive at its destination can read all of it. Archives keep everything they held, including later deleted items and purged plaintext history, until they expire under the retention setting. See [What a backup contains](../backups.md#what-a-backup-contains).

## Host mode isolation

In [host mode](../self-hosting/host-mode.md), tenants are isolated by data:

- each has its own data directory, database, sessions, tokens, services and HTTP server;
- one tenant's session or API token is refused on another tenant's host name;
- tenants cannot reach the operator's private network;
- tenants cannot change operator-owned settings.

They are **not** isolated by resources. All tenants share one process, its CPU, memory and file descriptors. The per-tenant limits bound storage, writes, requests per client address, imports and members, but not CPU time or memory, so a heavy tenant slows the others.

The assistant's limit of 8 concurrent answers applies per tenant, so the operator's provider key can serve 8 answers per open tenant.

The operator can read every tenant's data, as above.

## The public demo

A [demo instance](../self-hosting/demo.md) gives every visitor a private sandbox with these limits:

- 600 changes an hour and 5,000 in total;
- 2 MB of values;
- values of at most 4 KB, or 32 KB for notes;
- deleted after 2 hours idle, after 24 hours at most, and every night at 03:00 UTC.

Routes that make outbound requests or touch credentials, settings, members or bulk writes are refused. Its operator can read every sandbox until it is deleted, so don't type anything private into a demo.

## Scale

OpenTodo is held to [performance budgets](../performance.md) with a 10,000-task account, and a 50,000-task account is measured nightly without a budget. Beyond that, nothing is promised.

The server is one process with one SQLite writer, sized for a household, a team or a small organisation, not for thousands of concurrent writers. Rate limits and AI agent limits live in memory: they are per process and reset when the server restarts.

## Other limits

- **The audit log is not tamper-evident** against someone who can write the database file.
- **Rollback re-opens fixed issues.** Running a binary older than a security fix brings that issue back. There are no down-migrations.
- **Capability links** (public lists, task pages, calendar feeds) give their access to anyone who holds them, until revoked or expired.
- **Bearer tokens** are never asked for a second factor. A leaked `full` token can read and change the account's data until it is revoked.
- **No independent review** has been made yet ([Independent review](how-we-verify.md#independent-review)).
