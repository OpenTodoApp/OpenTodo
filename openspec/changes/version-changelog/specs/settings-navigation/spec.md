## MODIFIED Requirements

### Requirement: About section
Settings SHALL have an About section, visible to every account, that shows the server's version while online and a link to the in-app Help, the documentation on the website, the website, the issue tracker on GitHub, the OpenTodo Discord server, the OpenTodo account on X and the source code, and a Buy Me a Coffee button. It SHALL also show a Version row whose value is the server's version while online and this client build's version otherwise; that value SHALL be a link that opens the published changelog on the website in a new tab, at the release it shows — the site anchors every release — and a value without an anchor, such as a development build or a release candidate, SHALL open the page's newest release. External links SHALL open in a new tab and load nothing into the app; they SHALL be shown offline too, since they are part of the client. The Discord row SHALL be found by the settings search under "discord", "community" and "chat", the X row under "x", "twitter" and "news", and the Version row under "version", "changelog", "release notes" and "what is new". For the owner it SHALL also offer to show the welcome note again.

#### Scenario: Member opens About
- **WHEN** a member opens `/settings/about` while online
- **THEN** the page shows "OpenTodo <version>", the Version row, Open Help, the documentation, website, issue, Discord, X and GitHub links and the coffee button, and no welcome note row

#### Scenario: Reading the changelog
- **WHEN** anyone activates the version number in the Version row of Settings → About
- **THEN** the published changelog opens in a new tab at that release's anchor, with every earlier release listed below it

#### Scenario: A build the site has no anchor for
- **WHEN** the version row shows a development build or a release candidate and its value is activated
- **THEN** the published changelog opens at its newest release, without an anchor

#### Scenario: Searching for the community
- **WHEN** anyone types "discord" or "community" in the settings search
- **THEN** the About section's Community row is offered and opening it lands on that row

#### Scenario: Searching for the news
- **WHEN** anyone types "twitter" or "news" in the settings search
- **THEN** the About section's News and updates row is offered and opening it lands on that row

#### Scenario: Following on X
- **WHEN** anyone activates Follow on X in Settings → About, online or offline
- **THEN** the X account opens in a new tab, and the app has made no request to X before or after the activation

#### Scenario: Owner reopens the welcome note
- **WHEN** the owner chooses Show it again in Settings → About
- **THEN** the welcome note opens, and closing it leaves Settings as it was

#### Scenario: Searching for the version
- **WHEN** anyone types "version", "changelog", "release notes" or "what is new" in the settings search
- **THEN** the About section's Version row is offered and opening it lands on that row
