# Spec Delta

## MODIFIED Requirements

### Requirement: Welcome note for the owner
The first time the owner opens a server whose owner account was created in the last seven days and has no task yet, the app SHALL show a dialog thanking them for installing OpenTodo, with a link to open an issue on GitHub, a link to join the OpenTodo Discord server, a link to star the repository, a Buy Me a Coffee button and one primary button that closes it. Every link SHALL open in a new tab and SHALL load nothing from the linked site into the app. Closing the dialog in any way SHALL record the preference `welcome` as `seen` through the op log, and the dialog SHALL never show again on any device of that account. It SHALL NOT show to members, on a demo instance, or for an account that already had tasks when the app opened or is older than seven days. The same links SHALL be available in Help and in Settings → About, where the owner can open the note again.

#### Scenario: New server
- **WHEN** the owner creates the owner account on a new server and the app opens
- **THEN** the dialog "Thanks for installing OpenTodo" is shown with the issue, Discord, star and coffee links, and after "Start using OpenTodo" it is gone, also after a reload and on the owner's phone after sync

#### Scenario: Discord link in the note
- **WHEN** the owner activates the Discord row of the welcome note
- **THEN** the Discord invite opens in a new tab, the note stays open, and the app has made no request to Discord before or after the activation

#### Scenario: Invited member
- **WHEN** a member invited by the owner signs in for the first time
- **THEN** no welcome dialog is shown

#### Scenario: Upgraded server
- **WHEN** the owner of a server that already has tasks upgrades to a version with the welcome note
- **THEN** no welcome dialog is shown
