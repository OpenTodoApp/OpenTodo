# Spec Delta

## MODIFIED Requirements

### Requirement: Metadata language
Row metadata SHALL use three styles only: tone text for the date and the deadline (the deadline with its icon), label chips, and neutral chips for estimate (reading `tracked / estimate` once time was tracked, or `tracked` alone without an estimate), subtask progress, comment count, attachment count, project and origin. The origin chip SHALL show an icon for the kind from the app's icon set (a link for `url` and `issue`, an at sign for `email`, a download arrow for `import`) and the external id, else the URL's host; when the origin has a URL the chip SHALL be a link that opens it in a new tab without passing the referrer, and activating it SHALL not open the task. Repeat and evening SHALL be a suffix of the date text, not separate glyphs. The project SHALL not be shown in the Inbox or inside that project's view. Counts SHALL use tabular figures, not a monospace face.

#### Scenario: Recurring evening task
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its metadata reads "Today · evening · repeats" in the date tone, with no separate icons

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" chip

#### Scenario: Tracked time stays one chip
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its row carries one neutral chip reading `35m / 1h`, no second chip and no new glyph, so the number of visible properties is unchanged

#### Scenario: Issue chip opens the issue
- **WHEN** a task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` and the user clicks its chip
- **THEN** the issue opens in a new tab, the task panel does not open, and the chip's accessible name says it opens the source "o/r#7"

#### Scenario: Captured page on a card
- **WHEN** a task captured from `https://example.org/post` with title "Interesting article" is shown on the board
- **THEN** the card's metadata carries a link chip reading "example.org", and a task without an origin carries no origin chip

#### Scenario: Email origin without a link
- **WHEN** a task's origin is `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** its chip shows the at sign and reads "Email", is not a link, and the Message-ID is not shown

