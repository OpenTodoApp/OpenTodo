# Demo sandboxes

## Why

The public demo (OpenSpec `demo-mode`, live at opentodo-demo.pixari.dev) gives every visitor the same account with a published password. Whatever one visitor types (insults, spam, links to scams, illegal content) is shown to every other visitor until the 03:00 UTC reset, under the operator's domain, and a launch can bring hundreds of visitors at once. Nothing stops one visitor from bloating the shared account with thousands of tasks or from vandalising the sample data for everyone. The current restrictions close outbound requests and credentials, but not abuse of the shared space itself.

## What Changes

- **A private sandbox per visitor.** "Try the demo" creates a fresh, isolated account with its own copy of the sample data (including a shared project with a non-interactive demo collaborator) and signs the browser into it. Visitors never see each other's data. The published demo password goes away; sandbox accounts cannot sign in with a password at all.
- **Short life.** A sandbox is deleted after 2 hours without activity and at most 24 hours after creation, and every sandbox is deleted by the nightly reset. Deletion removes the account, its sessions, ops and fields; the open tab is told its sandbox expired and offers a new one.
- **Limits against exhaustion.** A global cap on live sandboxes, a per-address creation limit, a per-sandbox write budget (ops per hour and in total), smaller per-field size limits, and a database size guard that stops new sandboxes before the disk fills.
- **No incentive to post spam.** Demo pages and API responses carry `X-Robots-Tag: noindex, nofollow`, links that visitors write render with `rel="nofollow ugc noopener noreferrer"`, and content is only ever visible to the sandbox that wrote it.
- **Bot resistance.** Sandboxes are created only by a same-origin POST with a short-lived token from the sign-in page; crawlers and link previews that only GET never create one.
- The existing restricted features, no-outbound-requests rule and nightly schedule stay.

## Impact

- **Spec:** `demo-mode` (requirements modified and added).
- **Code:** `internal/demo` (sandbox lifecycle, seeding per sandbox, cleanup job, limits), `internal/httpapi/demo.go` (sandbox route, guard, headers, budgets), `internal/auth` (password-less provisioning, session-only accounts), `internal/sync` (account wipe without purge markers for deleted accounts), web sign-in, banner and expiry screen, markdown link attributes.
- **No change** when demo mode is off. No new environment variable is required; optional tuning variables are listed in the design.
- **Operator:** an instance already running demo mode deletes the old shared demo account on first start of the new version.
