## ADDED Requirements

### Requirement: Shells replaced by the native app
The web-view shells SHALL be retired when the native app passes its go/no-go gate (`native-app`). Their last release SHALL flush the outbox and announce the change. After the switch, the shell code, the JavaScript bridge (`web/src/lib/shell.ts` and its fixtures) and the shells' CI lanes SHALL be removed. The widget and share extension sources SHALL move to the native app. Archiving this change SHALL move the remaining shell requirements to the `native-app` capability or remove them.

#### Scenario: Last shell release
- **WHEN** the shell's last release starts
- **THEN** it sends any unsent ops and shows once that the next update is the new app

#### Scenario: After the switch
- **WHEN** the switch release has shipped on both stores
- **THEN** the repository has no web-view shell code and no CI job builds one
