## ADDED Requirements

### Requirement: API tokens in Settings
Settings → Integrations SHALL list the user's API tokens as rows: the name, a scope badge (Full access, Read only, Assistant, Admin), "Created" and "Last used" dates in the user's date format (coarse, as recorded), and a Revoke action that asks for confirmation. Creating a token SHALL use one dialog with the name, the scope as described choices (one line each saying what the scope allows) and the expiry, and SHALL show the new token once in a monospace box with Copy and a line saying it will not be shown again. The list SHALL have an empty state naming what a token is for. Revoking or creating SHALL need a connection; offline the list shows its last loaded state with actions disabled.

#### Scenario: Token rows
- **WHEN** a user has a read-only token "Claude" created on 3 October and last used today
- **THEN** its row reads "Claude", the "Read only" badge, "Created 3 Oct · Last used today", and a Revoke action

#### Scenario: Shown once
- **WHEN** the user creates a token
- **THEN** the token is shown in a monospace box with Copy, the dialog says it will not be shown again, and after closing it the list shows the new row without the secret
