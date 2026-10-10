# Email to task

Forward or send an email to your personal OpenTodo address and it becomes a task in your Inbox. It works from any mail client on any device, including ones where OpenTodo is not installed.

The feature is **optional and off by default**. The server operator turns it on by giving OpenTodo one mailbox to read; nothing listens for mail, no port is opened and no DNS change is needed.

## How it works

1. The operator creates (or reuses) one mailbox at any provider that supports **plus addressing** (`todo+anything@example.com` lands in `todo@example.com`) or a catch-all domain, and gives OpenTodo its IMAP login.
2. Each user opens **Settings → Email to task** and gets a secret address such as `todo+k3f9w2…@example.com`.
3. Mail sent to that address is delivered into the shared mailbox. OpenTodo checks the mailbox every minute over IMAP (TLS only), finds the secret in the recipient (`Delivered-To`, `X-Original-To`, `To`, then `Cc`) and creates the task in that user's account.
4. The message is then marked read and moved to `OpenTodo/Processed` (or deleted, if the operator prefers). Messages that match no user are moved or deleted the same way, so the mailbox does not fill up.

The task is an ordinary change in the operation log (device `server`), so every device receives it on its next sync, and offline devices converge like with any other edit.

### What the task looks like

| Task field | From the message |
| --- | --- |
| Title | The subject, with reply and forward prefixes removed (`Re:`, `Fwd:`, `FW:`, `AW:`, `WG:`, `SV:`, `TR:`, `RV:`…). Without a subject: the first line of the text, else `(no subject)` |
| Description | The plain-text part. HTML-only mail is converted to text (links keep their address in parentheses; scripts, styles and images are dropped, nothing is loaded). Text beyond 16 KB is cut with a note. A message forwarded *as an attachment* is included as a "Forwarded message" block |
| Attachments | Not stored. Each one is listed at the end of the description with its name and size, so nothing disappears silently |
| Project, priority, due | Inbox, priority 4, no due date. Natural-language parsing of the subject (`tomorrow`, `#project`, `p1`) is not applied yet |

Character sets: UTF-8, US-ASCII, ISO-8859-1, ISO-8859-15 and windows-1252 are decoded, as are encoded subjects (`=?UTF-8?B?…?=`) and file names. Text in other character sets keeps its valid UTF-8 parts.

## Protection

- **The secret is the key.** 128 random bits, lowercase so providers that lowercase addresses still work. Rotate it any time in Settings (**New address…**); the old one stops working at once.
- **Off switch** per account, and an optional **sender allowlist** (“Only accept mail from”). The sender address can be forged, so the allowlist filters mistakes and casual spam; the secret is the real protection.
- **At most 60 tasks per account per hour** from email; more messages in the same hour are discarded.
- **Messages over 10 MB** are discarded without being downloaded.
- **Each message creates one task at most.** The Message-ID is remembered per account for 90 days, and the task id is derived from it, so a second poll, a restart in the middle of a batch or a message delivered twice never makes a duplicate.
- **Deactivated accounts** get no tasks; their mail is discarded.
- **Privacy:** OpenTodo keeps no copy of the message beyond the task and the Message-ID. Subjects, bodies and sender addresses are never logged at the default log level; the per-poll log line only counts outcomes (`created=2 unknown_secret=1`). The mailbox credentials stay in the server's memory and are never returned by any API or included in exports.
- **Network:** the only outbound connection is to the IMAP server you configure. Credentials are sent only after TLS is established (implicit TLS on port 993, STARTTLS on any other port; a server without STARTTLS is refused).

Creating, rotating and changing the address are recorded in the audit log as `email_inbox.created`, `email_inbox.rotated` and `email_inbox.updated` (never the secret or the allowlist addresses).

## Operator setup

Set all four required variables, or none. Setting only some stops the server at startup with a message naming the missing one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENTODO_EMAIL_ADDRESS` | unset | The public address pattern, e.g. `todo@example.com`. Users get `todo+<secret>@example.com`. Must not contain `+` |
| `OPENTODO_EMAIL_IMAP_HOST` | unset | `host:port` of the IMAP server, e.g. `imap.fastmail.com:993`. Port 993 uses implicit TLS, any other port STARTTLS. Without a port, 993 |
| `OPENTODO_EMAIL_IMAP_USER` | unset | IMAP login |
| `OPENTODO_EMAIL_IMAP_PASSWORD` | unset | IMAP password, ideally an app-specific password. Or use `OPENTODO_EMAIL_IMAP_PASSWORD_FILE` |
| `OPENTODO_EMAIL_IMAP_PASSWORD_FILE` | unset | File holding the password (Docker / Coolify secrets). Use instead of the variable above |
| `OPENTODO_EMAIL_IMAP_MAILBOX` | `INBOX` | Folder to read |
| `OPENTODO_EMAIL_POLL_SECONDS` | `60` | Seconds between checks, 15–86400 |
| `OPENTODO_EMAIL_PROCESSED` | `move:OpenTodo/Processed` | What happens to handled mail: `move:<folder>` (created if missing; `/` is translated to the server's folder separator) or `delete` |

Use a **dedicated mailbox** (or at least a dedicated folder filled by a server-side rule): OpenTodo processes every unread message in the folder it reads.

### Provider notes

- **Fastmail, Proton (Bridge), mailbox.org, Posteo, iCloud+ custom domains, Gmail / Google Workspace, Outlook.com / Microsoft 365**: plus addressing works out of the box. Create an app password for IMAP (Gmail and Microsoft require 2-step verification first; Microsoft 365 tenants may have basic-auth IMAP disabled, in which case use another provider: OAuth sign-in is not supported).
- **Your own domain with a catch-all**: point the catch-all at the mailbox; `todo+secret@yourdomain` is delivered even if the provider ignores plus addressing. OpenTodo looks at `Delivered-To` and `X-Original-To` first, which keep the original recipient.
- **Self-hosted Dovecot / Stalwart / Maddy**: enable the `+` recipient delimiter (Postfix `recipient_delimiter = +`).
- Some providers lowercase the local part; secrets are lowercase and matched case-insensitively, so that is harmless.

### Docker Compose

```yaml
services:
  opentodo:
    environment:
      - OPENTODO_EMAIL_ADDRESS=todo@example.com
      - OPENTODO_EMAIL_IMAP_HOST=imap.example.com:993
      - OPENTODO_EMAIL_IMAP_USER=todo@example.com
      - OPENTODO_EMAIL_IMAP_PASSWORD_FILE=/run/secrets/opentodo_imap_password
    secrets:
      - opentodo_imap_password
secrets:
  opentodo_imap_password:
    file: ./imap_password.txt
```

### Coolify

Add the variables in the resource's **Environment Variables** tab. For the password, either mark `OPENTODO_EMAIL_IMAP_PASSWORD` as a secret (Coolify hides it in the UI), or mount a file through **Storages → Add file mount** at `/run/secrets/opentodo_imap_password` and set `OPENTODO_EMAIL_IMAP_PASSWORD_FILE` to that path. Redeploy; the log shows `email capture polling interval=1m0s`.

### Troubleshooting

- `email poll failed … login failed`: wrong user or password, or the provider requires an app password.
- `… offers no STARTTLS on this port`: use port 993, or enable STARTTLS on the server. OpenTodo never sends the password unencrypted.
- `email poll unroutable=1`: the message reached the mailbox but no recipient carried a `+secret` for `OPENTODO_EMAIL_ADDRESS`. Check that the provider keeps plus addressing and that the address matches.
- `unknown_secret`: the address was rotated, mistyped, or belongs to no account. `disabled` / `not_allowed` / `rate_limited` are the user's switch, allowlist and hourly cap.
- When the mail server is down, the app keeps working; one warning is logged per interval and polling resumes on its own.

## End-to-end encryption

For an account with [end-to-end encryption](e2ee.md) the server creates the task in plaintext like any REST write (it has no key, and the message crossed mail servers in the clear anyway). The next unlocked device that syncs re-writes title and description as ciphertext and marks the task "not yet encrypted" until then; **Purge plaintext history** in Settings removes the plaintext operations afterwards.

## Limits and what is not included

Not in this version: a built-in SMTP receiver for operators who own an MX record (planned as `email-smtp-receiver`), storing attachments, replying to or sending mail, per-project addresses, parsing dates and projects from the subject, and OAuth mailbox sign-in. This implementation was tested against an in-process IMAP server and realistic RFC 5322 messages, not yet against each provider listed above.
