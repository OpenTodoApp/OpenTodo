# Spec Delta

## MODIFIED Requirements

### Requirement: About section
Settings SHALL have an About section, visible to every account, that shows the server's version while online and a link to the in-app Help, the documentation on the website, the website, the issue tracker on GitHub, the OpenTodo Discord server and the source code, and a Buy Me a Coffee button. External links SHALL open in a new tab and load nothing into the app; they SHALL be shown offline too, since they are part of the client. The Discord row SHALL be found by the settings search under "discord", "community" and "chat". For the owner it SHALL also offer to show the welcome note again.

#### Scenario: Member opens About
- **WHEN** a member opens `/settings/about` while online
- **THEN** the page shows "OpenTodo <version>", Open Help, the documentation, website, issue, Discord and GitHub links and the coffee button, and no welcome note row

#### Scenario: Searching for the community
- **WHEN** anyone types "discord" or "community" in the settings search
- **THEN** the About section's Community row is offered and opening it lands on that row

#### Scenario: Owner reopens the welcome note
- **WHEN** the owner chooses Show it again in Settings → About
- **THEN** the welcome note opens, and closing it leaves Settings as it was
