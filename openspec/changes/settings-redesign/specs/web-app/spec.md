## MODIFIED Requirements

### Requirement: Settings
A settings view SHALL show the signed-in account, let the user download the JSON export, create, list and revoke API tokens, and sign out. Signing out SHALL clear the local copy of the data on that device. The settings are grouped into sections with their own pages, as described by `settings-navigation`.

#### Scenario: Token shown once
- **WHEN** the user creates a token
- **THEN** the secret is displayed with a notice that it will not be shown again and the token appears in the list

#### Scenario: Sign out from the Account section
- **WHEN** the user opens Settings → Account, selects Sign out and confirms in the dialog
- **THEN** unsynced changes are uploaded when online, the local copy is cleared and the sign-in screen is shown

#### Scenario: Sign out cancelled
- **WHEN** the user selects Sign out and then chooses Cancel in the dialog
- **THEN** nothing is cleared and the Account section stays open with focus on the Sign out button
