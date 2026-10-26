# Proposal

## Why

An internal security audit found three low-severity gaps between what a credential is meant to allow and what it could do:

- **L3.** `GET /api/v1/email-inbox` created an enabled inbox with an empty sender allowlist on first read and returned its secret address, also to `read` and `agent` tokens. A read-only token thereby gained a lasting way to create tasks, outside its scope and outside the agent audit trail. A cross-site navigation to the route also created and enabled an inbox.
- **L4.** The owner's security settings (webhooks to private networks, map providers, AI assistant connections and writes, audit retention and address logging) accepted a non-admin `full` token, although AGENTS.md reserves security and secret-holding settings for `admin` tokens.
- **L6.** Adding a project member by email needs no consent, tells whether an account exists, and had no limit, so any account could list the server's accounts or push projects at many people.

## What Changes

- Reading the email inbox creates nothing; the address is created when the person turns email to task on (or asks for a new address). The three `/api/v1/email-inbox` routes refuse `read` and `agent` tokens, also on `GET`. Settings shows only the on switch until then.
- `PUT /api/v1/settings/webhooks`, `/maps`, `/mcp` and `/audit` are credential routes: a session or an `admin` token.
- Adding people by email to projects and workspaces is limited to 30 attempts per account per hour (429 `rate_limited`), and each project add is recorded as `project.member_added`.

No op schema change, no migration, no new environment variable. Not **BREAKING** for the web app. Scripts that change these owner settings with a `full` token need an `admin` token; scripts that read the email address with a `read` token need a `full` one; an account that had never opened the email settings has no address until it turns the feature on.

**Out of scope**: consent for direct member adds (an invitation the added person accepts) and answering the same way for known and unknown emails. The audit recommends both; they change the sharing flow and its UI and belong in their own change. ROADMAP.md item advanced: none; this is a security fix for 0.14.1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-access`: security settings join the credential routes.
- `email-capture`: the inbox is created by an explicit change and the routes need full access.
- `project-sharing`: adding people by email is limited and recorded.
