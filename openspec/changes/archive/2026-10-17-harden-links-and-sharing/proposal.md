# Harden emailed links, entity ids and first-time sharing

## Why

An audit found four problems:

- **Links in emails took their host from the request.** Without `OPENTODO_BASE_URL` the server built password-reset, sign-up and invitation links from the request's `Host` or `X-Forwarded-Host`, which any client can set. An anonymous "Forgot password?" request could therefore make the server mail a real reset link that points to someone else's site.
- **Entity ids had no character rules.** Only the length was checked, and ids were put into JSON with Go's `%q`, which is not JSON. One editor could store an id with a control character and break every member's lists (REST, MCP, CalDAV).
- **A project id could be taken over.** Sharing created the project's scope for whoever asked first. Someone who learned the id of another account's unshared project could create a project with that id and share it, and the real owner lost access for good.
- **Sharing left attachments behind.** The first share moved a project's tasks, sections, fields and comments to the project's scope, but not the tasks' attachments. Members never saw files added before the share, and a purge left them behind.

## What Changes

- Mailed links (password reset, sign-up verification, instance and project invitations) are built from `OPENTODO_BASE_URL` only. Without it these emails are not sent: the request is answered 409 `base_url_required`, and the owner sees a configuration warning while outgoing email is configured. Links shown to the signed-in user who asked for them (copy-a-link invitations and resets, CalDAV address, calendar feeds, public links, MCP endpoint, OIDC redirect) keep working without a base URL.
- `X-Forwarded-Host` and `X-Forwarded-Proto` are believed only when the connection comes from an address in `OPENTODO_TRUSTED_PROXIES`. Otherwise the request's own `Host` and TLS state are used, for links and for the cookie origin check.
- Entity ids are limited to ASCII letters, digits and `. _ : @ + = ~ -` (1 to 64 characters). That covers every id the clients make. JSON values are quoted with a single helper (`sync.QuoteJSON`).
- Sharing a project for the first time is refused with 409 `project_id_conflict` when another account's personal scope holds a project with the same id.
- The first share also moves the tasks' attachments. Migration `0035_shared_attachments` repairs projects that were shared earlier, and members' devices replay the project's history once so they receive the moved attachments.

**Behaviour change, not BREAKING:** a server with outgoing email and no `OPENTODO_BASE_URL` stops mailing reset, verification and invitation links until the variable is set. A reverse proxy that is not in `OPENTODO_TRUSTED_PROXIES` no longer controls the host or scheme of the links the server shows, so `OPENTODO_BASE_URL` (recommended) or the proxy's address must be set behind a TLS-terminating proxy. No new mandatory variable, and no change to the op log format.

## Out of scope

- Server-assigned, unforgeable project ids (first creation wins). The refusal is enough to stop the takeover.
- Trusting `X-Forwarded-For` for client addresses: that is a separate finding, and `clientIP` is unchanged.
- Advances ROADMAP items `project-sharing`, `attachments` and `outgoing-email` (hardening of shipped features).
