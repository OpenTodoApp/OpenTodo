---
title: Outgoing email
summary: Optional SMTP so the server can mail password resets, sign-up confirmations and invitations: Settings or environment, Docker secrets, providers, troubleshooting.
audience: admin
specs: [self-hosting]
screens: []
order: 45
---
# Outgoing email

OpenTodo works without email. When you give it an SMTP server, it can also send:

- **Password resets.** "Forgot password?" appears on the sign-in screen, and administrators can send a reset link instead of copying it.
- **Sign-up confirmations.** With open sign-up on (`OPENTODO_ALLOW_SIGNUP=true`), new accounts are created only after the person opens the link mailed to their address.
- **Invitations by email.** Server invitations and project invite links can be mailed to the address you type.
- **A test message**, to check the configuration.

Nothing else is ever sent: no newsletters, no notifications of task changes, no tracking. Messages are plain text, carry one link, and never contain task, project, label or comment content. Without a configuration the server opens no mail connection at all.

## Set the base URL first

Links in these emails always start with `OPENTODO_BASE_URL`, the address people open OpenTodo at, such as `https://todo.example.com`. The server never builds a mailed link from the request: anyone can send a request with a made-up host name, and a reset link pointing to their site would hand them the account.

Without `OPENTODO_BASE_URL`, outgoing email stays configured, the test message and weekly digests still go out, but password resets, sign-up confirmations and invitations are not sent by email:

- "Forgot password?" tells the visitor to ask an administrator for a reset link.
- **Send by email** on an invitation, an invite link or a reset fails with "This server cannot email links until the owner sets its public address (OPENTODO_BASE_URL)". Nothing is created; turn **Send by email** off to get a link to copy instead.
- With open sign-up, registering fails with the same message and no account is created.
- The owner sees a **Server configuration warning** naming `OPENTODO_BASE_URL` at the top of **Settings**.

Set the variable (see [Running with Docker](docker.md#behind-a-reverse-proxy)) and restart; the warning goes away and emails are sent again.

## Configure in Settings

As the owner, open **Settings → Server → Outgoing email** and choose **Configure**:

| Field | What to enter |
| --- | --- |
| Host | The SMTP server's name, such as `smtp.example.com` |
| Port | 587 for STARTTLS (the default), 465 for TLS from the start |
| Security | **STARTTLS**, **TLS**, or **None** (only for a relay on your network that needs no sign-in) |
| Username, Password | The SMTP account, if the server needs one. Leave the password empty to keep the stored one |
| From | The sender, such as `todo@example.com` or `OpenTodo <todo@example.com>`. Bounces go to this address |

Then press **Send test email**. The message goes to your own address, and the panel shows either that it was sent or at which stage it failed, with the server's reply.

The password is stored in `<data>/secrets/smtp.json` (readable by the server only), never in the database, so [backups](../backups.md) do not contain it. After a restore on a new machine, enter it again.

## Configure with environment variables

Every field can also be set by a variable. A field set this way wins over Settings and is shown there as read-only, labelled with its variable.

| Variable | Meaning |
| --- | --- |
| `OPENTODO_SMTP_HOST` | `host` or `host:port`; a bare host uses port 587 |
| `OPENTODO_SMTP_SECURITY` | `tls`, `starttls` or `none`; default `tls` on port 465, `starttls` otherwise |
| `OPENTODO_SMTP_USER` | SMTP username |
| `OPENTODO_SMTP_PASSWORD` or `OPENTODO_SMTP_PASSWORD_FILE` | the password, or a file holding it (a trailing line break is ignored) |
| `OPENTODO_SMTP_FROM` | `addr` or `Name <addr>` |

`HOST` and `FROM` go together, as do `USER` and a password, and `none` never goes with a username. A partial or invalid configuration stops the server at startup with a message naming the variable.

With Docker Compose, keep the password in a secret rather than the environment:

```yaml
services:
  opentodo:
    environment:
      OPENTODO_SMTP_HOST: smtp.example.com:587
      OPENTODO_SMTP_USER: todo@example.com
      OPENTODO_SMTP_PASSWORD_FILE: /run/secrets/smtp_password
      OPENTODO_SMTP_FROM: OpenTodo <todo@example.com>
    secrets: [smtp_password]
secrets:
  smtp_password:
    file: ./smtp_password.txt
```

A demo instance (`OPENTODO_DEMO=true`) never sends email, whatever is configured.

## Provider notes

- **Gmail and Google Workspace:** host `smtp.gmail.com`, port 587, STARTTLS, your address as username and an [app password](https://support.google.com/accounts/answer/185833) (your normal password is refused).
- **Microsoft 365 / Outlook.com:** host `smtp.office365.com`, port 587, STARTTLS. The account needs "Authenticated SMTP" enabled by its administrator. OpenTodo uses the LOGIN method these servers offer.
- **Transactional services** (Postmark, Mailgun, Amazon SES, Brevo and others): use their SMTP host, port 587 and the SMTP credentials they give you, and a From address on a domain you verified with them.
- **A relay on your network** (Postfix, a NAS, your router): security **None** and no username, if the relay accepts mail from the server's address. The panel warns that this connection is not encrypted.

## Language

Messages are written in the language of the browser that caused them (English, German, French, Spanish, Italian or Portuguese; English otherwise). An invitation uses the language of the person who sent it.

## Weekly digest

With outgoing email configured, each user can opt in to a weekly digest in **Settings → Notifications** ([user guide](../statistics.md#weekly-digest-by-email)). The server sends it on the user's chosen weekday and hour in their time zone, from one background pass every 5 minutes. A failed send is retried every 15 minutes for six hours, then given up and recorded as `email.failed` with reason `skipped`; a restart never sends a second digest for the same day. Digests count towards the per-recipient limit but not the server-wide one, so a busy digest morning never blocks a password reset. The digest contains task and project names, so it is never built for an account with end-to-end encryption. Without `OPENTODO_BASE_URL` the review link uses the address the user saved the setting from.

## Limits

At most 5 messages of one kind to one address per hour, and 100 messages per hour for the whole server. A message over a limit is not sent and is recorded in the audit log. Sending is immediate and never retried: if the SMTP server cannot be reached, an invitation or reset sent by email is not created and the screen says so, so you can try again or copy a link instead.

## Troubleshooting

The test result names the stage that failed:

| Stage | Usual cause |
| --- | --- |
| `connect` | Wrong host or port, a firewall blocking outbound port 587 or 465 (some hosting providers block mail ports), or the server is down |
| `tls` | The server does not offer STARTTLS (try port 465 with TLS), its certificate is not valid for the host name, or the security setting does not match the port |
| `auth` | Wrong username or password, an app password is required, or SMTP sign-in is disabled for the account |
| `send` | The server refused the From or the recipient address: the From must usually be an address of the signed-in account or a verified domain |

Every message sent or refused is recorded in **Settings → Server → Audit log** as `email.sent` or `email.failed` with its kind, the recipient and the reason; links are never recorded.

## Security notes

- Mailed links are built from `OPENTODO_BASE_URL` only, never from the request's `Host` or `X-Forwarded-Host` (see [Set the base URL first](#set-the-base-url-first)).
- Credentials are only ever sent over an encrypted connection. With STARTTLS, if the server does not offer the upgrade, nothing is sent.
- The forgot-password form answers the same way, after the same time, whether or not an account exists.
- Confirmation links create the account only when the person presses the button on the page, so mail scanners that open links cannot complete a sign-up.
- Accounts created by invitations, by administrators or through single sign-on are not asked to confirm their address: someone with authority already vouched for it.
