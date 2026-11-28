# Spec Delta

## MODIFIED Requirements

### Requirement: News ships with the version
Each released version from the first entry on SHALL have one entry compiled into the web app: a version, a date, and a body of at most four sentences of plain text. The newest released version SHALL always have one, so the series cannot stay empty once a version is released; the repository's checks SHALL fail while it has none. An entry SHALL name a version the changelog has released, and the checks SHALL refuse one that does not. The app SHALL NOT fetch entries, and SHALL NOT contact GitHub, the website, or any other host to learn them or to learn whether a newer version exists. Entries SHALL be available offline, because they are part of the client. Versions older than the first entry SHALL have none, and the page SHALL say so by simply not listing them.

#### Scenario: No request for news
- **WHEN** a signed-in user opens What's new, online or offline, with the network inspected
- **THEN** every request goes to the server's own origin, and the entries shown are the ones compiled into this client

#### Scenario: Nothing published yet
- **WHEN** this client was built with no entries
- **THEN** the page shows one line that there is nothing new in this version yet, and no dot is shown

#### Scenario: A release without its entry
- **WHEN** the changelog's newest released section is 1.11.0 and there is no entry for 1.11.0
- **THEN** `make news-check` fails and names `news/1.11.0.md`, whether or not earlier entries exist

#### Scenario: An entry ahead of the release
- **WHEN** `news/1.12.0.md` exists and the changelog has no released section for 1.12.0
- **THEN** `make news-check` fails and names `news/1.12.0.md`
