# Spec Delta

## ADDED Requirements

### Requirement: Origin terms
`origin` SHALL match tasks that have an origin, `no origin` tasks that have none, and `origin: value` (quotes allowed) tasks whose origin `provider` equals the value ignoring case, or, for an origin without a provider, whose `kind` does. All three SHALL be keywords in the published grammar, accepted by the server's validation of saved views and evaluated on the device from local data with the same open-only default as every other term; `origin` SHALL be a reserved word.

#### Scenario: Everything from one tracker
- **WHEN** the user enters `origin: github & open`
- **THEN** the open tasks whose origin provider is `github` are listed, and a task captured from a page without a recognised provider is not

#### Scenario: Captured pages and mails
- **WHEN** the user enters `origin: url | origin: email`
- **THEN** tasks captured from pages without a recognised provider and tasks created from email are listed

#### Scenario: Nothing imported
- **WHEN** the user enters `no origin & #Work`
- **THEN** the open tasks of "Work" without an origin are listed, and saving the query as a view is accepted by the server

#### Scenario: Offline and encrypted
- **WHEN** the device is offline, the account is end-to-end encrypted and unlocked, and the user enters `origin`
- **THEN** every open task with an origin is listed from the decrypted local copy, with no request

#### Scenario: Reserved word
- **WHEN** a project defines a custom field named "origin" and the user enters `origin`
- **THEN** the term is the origin keyword, and the field is reachable only through its quoted name
