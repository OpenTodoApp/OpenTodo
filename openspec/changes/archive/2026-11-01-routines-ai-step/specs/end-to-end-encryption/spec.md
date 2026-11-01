## ADDED Requirements

### Requirement: Routines with content on encrypted accounts
For an encrypted account the server SHALL never decrypt, read or produce a routine's text: a routine whose steps read or write user-written text, or call AI, SHALL run on one of the user's opted-in devices (`routines` "Routines run on devices for encrypted accounts"), whose writes reach the server as ciphertext operations through the operation log and converge like any device's edits; a proposal's body SHALL be a ciphertext envelope; run records SHALL hold ids, counts and statuses only. Steps that would need plaintext on the server (email, a webhook with text) SHALL be unavailable. Routines without such steps SHALL run on the server reading only ids, dates, numbers and enumerations.

#### Scenario: Proposal on an encrypted account
- **WHEN** an encrypted account's AI routine ends in a proposal on the laptop
- **THEN** the server stores one ciphertext envelope for it, and the phone decrypts and shows the proposal for review

#### Scenario: Offline device
- **WHEN** the device that ran a routine goes offline before its commit reached the server
- **THEN** nothing of the run is written, and the run is recorded missed after 24 hours if no device completes it
