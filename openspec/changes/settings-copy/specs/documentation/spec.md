# Spec Delta

## MODIFIED Requirements

### Requirement: Contextual help
Every page header, the task panel menu, the share dialog, quick add (on its first three uses per device), the import screen and the Learn more link of a Settings card SHALL offer a Help action that opens the matching guide section beside the current screen (a sheet on phones) without closing it or discarding what the user entered. The guide section a Settings card's Learn more opens SHALL hold the explanation that left the card, so no sentence of the earlier card text is lost, and each such screen id SHALL be declared by exactly one guide page.

#### Scenario: Help while sharing
- **WHEN** a user has typed an email in the share dialog and selects Help
- **THEN** the sharing section opens beside the dialog, and closing it returns to the dialog with the email still there

#### Scenario: Help from the board
- **WHEN** the user activates Help in a project's page header while the board is shown
- **THEN** the sections and boards guide opens in the panel slot and the board stays as it was

#### Scenario: Learn more from a card
- **WHEN** a user activates Learn more on the Recent activity card
- **THEN** the "Check recent sign-ins" section of the account security guide opens beside Settings and says what to do about a sign-in you do not recognise, which the card no longer says in full

#### Scenario: Screen id without a page
- **WHEN** a change adds a Learn more link for screen `settings/nonsense` that no page declares
- **THEN** the docs check fails naming the file that links it

#### Scenario: Guide page stays under the limit
- **WHEN** the moved sentences are added to the Settings: App guide
- **THEN** the page stays under 600 words, as the docs check requires, with the longer explanations on the feature pages their cards link to
