# Spec Delta

## MODIFIED Requirements

### Requirement: Account screens
The client SHALL show the owner setup form on a fresh server, a sign-in form otherwise, a sign-up option only when the server allows it, and SHALL show server-side errors: translated by their code when the client knows the code (OpenSpec `localization`), else the server's message verbatim.

#### Scenario: Setup on fresh server
- **WHEN** the client loads against a server that reports setup required
- **THEN** the create-owner form is shown and no sign-in form

#### Scenario: Known error code in the user's language
- **WHEN** the language is German and sign-in fails with code `invalid_credentials`
- **THEN** the form shows the German message for that code

#### Scenario: Unknown error code
- **WHEN** the server answers with a code the client does not know
- **THEN** the form shows the server's message as received
