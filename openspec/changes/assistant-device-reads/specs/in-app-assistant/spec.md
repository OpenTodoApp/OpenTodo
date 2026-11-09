# Spec Delta

## ADDED Requirements

### Requirement: On-device read tools match the server's
The on-device assistant SHALL offer `list_time_entries`, `list_frames`, `list_slots`, `list_notes`, `search_notes` and `get_note` with the server's argument schemas, reading this device's decrypted rows. It SHALL leave out deleted rows and projects kept away from assistants, and mark people's text as untrusted, giving the same results as the server for the same rows. They read local data, so they work offline; they write nothing.

#### Scenario: Time on an encrypted account
- **WHEN** an encrypted account's on-device assistant calls `list_time_entries` for this week
- **THEN** it gets the week's entries from this device's rows, with the same fields and totals the server returns for the same entries

#### Scenario: Notes in a kept-away project
- **WHEN** the device's `search_notes` matches a note in a project kept away from assistants
- **THEN** that note is not in the result, as on the server
