# Design

## Email inbox (L3)

`email.Store.Find` reads without creating; the `GET` handler uses it and answers `address: null, enabled: false` for an account without an inbox. `Update` and `Rotate` keep creating the row on first use (`Get`), so the first `PATCH {enabled: true}` creates the inbox and records `email_inbox.created` as before. The routes use `fullTokens()`: the address is a write capability, so even reading it is refused to `read` and `agent` tokens. Existing inboxes are untouched.

The settings section renders only the "Create tasks from email" switch while `address` is null; turning it on sends `PATCH {enabled: true}` and the response fills in the address, copy, rotate and allowlist controls. No new strings.

## Security settings (L4)

`.credential()` on `PUT /api/v1/settings/webhooks`, `/maps`, `/mcp` and `/audit`. Their `GET` routes stay as they are (the values are not secret). `TestCredentialRoutesNeedAdminToken` and the policy table pin them. No other owner setting changed: the remaining switches (CalDAV, calendar feeds, attachments, branding, automations…) are feature switches, not security policy.

## Member adds (L6)

One `memberAddLimiter` (30 per hour, keyed by the actor's account id) shared by the project and workspace add routes, counted after the role check and before the email lookup, for found and unknown emails alike, so probing and spamming share one budget. Adds by directory id (closed workspaces) are not counted: they only reach accounts already in the caller's workspace. `audit.ProjectMemberAdded` (`project.member_added`, actor, target, `shared_project_id`, `project_role`) joins the closed catalogue, the web audit filter and its label.

Consent before a direct add, and a uniform answer for unknown emails, are left for a separate change: both need an invitation state for existing accounts and a new share-dialog flow.

Interface budget: no new chrome; the email section shows fewer controls before it is turned on. Data model: none (no migration). Size: negligible.
