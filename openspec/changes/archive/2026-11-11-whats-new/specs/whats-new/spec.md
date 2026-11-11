## ADDED Requirements

### Requirement: News ships with the version
Each released version that has news SHALL have one entry compiled into the web app: a version, a date, and a body of at most four sentences of plain text. The app SHALL NOT fetch entries, and SHALL NOT contact GitHub, the website, or any other host to learn them or to learn whether a newer version exists. Entries SHALL be available offline, because they are part of the client. Versions older than the first entry SHALL have none, and the page SHALL say so by simply not listing them.

#### Scenario: No request for news
- **WHEN** a signed-in user opens What's new, online or offline, with the network inspected
- **THEN** every request goes to the server's own origin, and the entries shown are the ones compiled into this client

#### Scenario: Nothing published yet
- **WHEN** this client was built with no entries
- **THEN** the page shows one line that there is nothing new in this version yet, and no dot is shown

### Requirement: What's new on About
Settings → About SHALL show a What's new card. The card SHALL lead with a switch, "Version notices", on unless this device has turned it off. Under it the newest entry SHALL be shown in full, then a closed disclosure "Earlier versions" listing older entries one line each (version and date). Opening an entry's changelog link SHALL open that version's GitHub release in a new tab and SHALL load nothing into the app. The card SHALL be reachable from the settings search under "news", "changelog" and "what's new". With the disclosure closed, About SHALL stay within the settings page-length limit.

#### Scenario: Reading the newest entry
- **WHEN** a user opens Settings → About on a client whose newest entry is 0.22.0
- **THEN** the card shows the 0.22.0 entry in full, earlier entries are behind "Earlier versions", and the switch is first

#### Scenario: Changelog link
- **WHEN** the user activates the changelog link on the 0.22.0 entry
- **THEN** that version's release page opens in a new tab, and the app has made no request to GitHub before or after the activation

#### Scenario: Offline
- **WHEN** the user opens What's new with no network connection
- **THEN** the compiled entries and the switch are shown, and the changelog link is still offered

### Requirement: The new-version dot
While version notices are on, a dot SHALL be shown on the What's new card and on About in the settings list when the server's reported version equals an entry the person has not opened on this device. Opening the card SHALL record that version on this device, so the dots leave and stay gone on this device. The record SHALL be device-local: it SHALL NOT be an op, SHALL NOT sync, and SHALL NOT be sent to the server. While version notices are off, no dot SHALL be shown, and opening the card SHALL still record the version. The dot SHALL NOT appear on the main sidebar, on Today, or as a dialog. When the server version is not known, no dot SHALL be shown.

#### Scenario: First open of a new version
- **WHEN** the server reports 0.22.0, that version has an entry, and this device has not opened What's new for 0.22.0
- **THEN** About in the settings list and the What's new card each show a dot whose accessible name says there are new notes

#### Scenario: Opening clears it
- **WHEN** the user opens the What's new card
- **THEN** the device records 0.22.0 and both dots are gone

#### Scenario: Notices off
- **WHEN** the user turns Version notices off and a later version with an entry is running
- **THEN** no dot is shown, the card still lists the entries, and turning notices on shows a dot until the card is opened

#### Scenario: Another device
- **WHEN** the user opens What's new on their laptop
- **THEN** their phone still shows the dot until What's new is opened there

#### Scenario: Offline and the version is unknown
- **WHEN** the app has not yet learned the server version
- **THEN** no dot is shown, and the entries compiled into the client are still listed
