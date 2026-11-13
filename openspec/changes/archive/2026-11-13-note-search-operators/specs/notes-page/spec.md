## ADDED Requirements

### Requirement: Search operators
The words of the Notes page search SHALL accept two operators beside words and quoted phrases: `OR` in capitals, standing alone outside quotes, between two words or phrases, which keeps a note that contains either of them; and the prefixes `title:` and `text:` directly before a word or phrase, which limit it to the note's title or to its text. Words separated only by spaces SHALL all have to match, as without operators, so `lisbon ferry OR train` keeps notes containing "lisbon" and either "ferry" or "train". `or` in lower case, `OR` inside quotes, and a prefix without a value SHALL be ordinary words; an `OR` at the start or end, or two in a row, SHALL be ignored. A query without operators SHALL match and rank exactly as before. Ranking SHALL count a word as a title match only when it matched in the title. Snippets SHALL highlight the words that matched in the text. The key suggestion SHALL offer `title:` and `text:` like the token keys, without turning them into chips. Matching SHALL run on the device over the decrypted text, offline included, and SHALL send nothing to the server; there is nothing to converge.

#### Scenario: Either word
- **WHEN** the note "Trip" contains "ferry", the note "Commute" contains "train", the note "Garden" contains neither, and the user types `ferry OR train`
- **THEN** "Trip" and "Commute" are listed and "Garden" is not

#### Scenario: OR with other words
- **WHEN** "Trip" contains "lisbon" and "ferry", "Commute" contains "train" but not "lisbon", and the user types `lisbon ferry OR train`
- **THEN** only "Trip" is listed

#### Scenario: Lower-case or is a word
- **WHEN** the user types `ferry or train`
- **THEN** only notes containing all three words "ferry", "or" and "train" are listed

#### Scenario: Title only
- **WHEN** the note "Wi-Fi" has the password in its text and the notes "Router" and "Guests" mention "wifi" in their text, and the user types `title:wifi`
- **THEN** only "Wi-Fi" is listed

#### Scenario: Text only with a phrase
- **WHEN** the note "Oat milk brands" has no "oat milk" in its text and the note "Groceries" has "oat milk" in its text, and the user types `text:"oat milk"`
- **THEN** only "Groceries" is listed, with "oat milk" highlighted in its snippet

#### Scenario: Prefix without a value
- **WHEN** the user types `title: ferry`
- **THEN** notes containing the words "title:" and "ferry" are searched, as two ordinary words

#### Scenario: Offline and encrypted
- **WHEN** an encrypted account is unlocked on an offline device and the user types `title:passport OR title:visa`
- **THEN** the notes with either word in their decrypted titles are listed and no request is made

### Requirement: Changed within a date range
The `changed:` token SHALL also accept a range `YYYY-MM-DD..YYYY-MM-DD`, keeping the notes whose last change falls on a day from the first date to the second, both included, in the viewer's time zone; a range written backwards SHALL be read in date order, and a range with one end left out SHALL keep the notes changed on or after, or on or before, the given day. A complete range SHALL become a chip like the other `changed:` forms, and the date suggestions SHALL offer "This month" and "Last month" as ranges. The chip SHALL be remembered on the device like the other chips. The range SHALL be matched on the device over local data, offline included, and SHALL send nothing to the server.

#### Scenario: October
- **WHEN** the note "Trip" changed on 2026-10-14, "Taxes" on 2026-11-02 and "Ideas" on 2026-09-30, and the user types `changed:2026-10-01..2026-10-31 `
- **THEN** a chip "changed: 1 Oct – 31 Oct 2026" is in the field and only "Trip" is listed

#### Scenario: Both ends included
- **WHEN** a note changed at 23:30 on 2026-10-31 in the viewer's time zone and the field holds `changed:2026-10-01..2026-10-31`
- **THEN** the note is listed

#### Scenario: Backwards and open
- **WHEN** the user types `changed:2026-10-31..2026-10-01`, and later `changed:2026-10-01..`
- **THEN** the first keeps the same notes as the October range, and the second keeps every note changed on 1 October 2026 or later

#### Scenario: Last month from the suggestions
- **WHEN** on 2026-11-12 the user types `changed:` and picks "Last month"
- **THEN** the chip covers 1 to 31 October 2026
