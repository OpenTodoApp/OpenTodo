## ADDED Requirements

### Requirement: Assistant card structure
The Assistant card in Settings SHALL read top to bottom: a status line ("On for everyone", "On, using your own key", "Off: the owner has not turned it on"), then for the owner a "For everyone on this server" group (providers and models allowed, the server's key status, the monthly allowance per person, whether members may use their own keys) with one Configure action, then for every user a "For you" group (consent, their own provider and key when allowed, auto-apply of small changes) and the usage meter for this month as a bar with the numbers. Each group SHALL be rows of label, value and action like other Settings cards, and SHALL hide rows that do not apply to the user's role. The owner's configuration form SHALL group fields into "Provider" (provider, model, key with Test) and "Limits" (allowance, own keys allowed).

#### Scenario: Member's view
- **WHEN** a member opens the card while the owner has turned the assistant on and allowed own keys
- **THEN** the card shows the status line, the "For you" group with consent and "Use your own key", and the usage meter, and no owner group

#### Scenario: Owner's view while off
- **WHEN** the owner opens the card while the assistant is off
- **THEN** the status line says it is off and nobody sees the assistant, and the "For everyone on this server" group offers Configure
