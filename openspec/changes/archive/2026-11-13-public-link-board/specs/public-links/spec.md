## ADDED Requirements

### Requirement: Public link layout
Creating a public link SHALL take an optional `layout`, `list` (the default) or `board`, kept with the link and returned by the link list and by the public read. A `board` link's page SHALL show a column per section, in section order, with the tasks without a section first and empty columns left out; each column SHALL hold the same rows, subtasks and tick boxes as the list. Links made before this change, and a read from an older server without `layout`, SHALL show as a list.

#### Scenario: A board link
- **WHEN** an owner creates a view link with `layout: "board"` for a project with sections This week and Before winter
- **THEN** the page shows a column for the tasks without a section, then This week, then Before winter, side by side and scrolling sideways on a phone

#### Scenario: Unknown layout
- **WHEN** a create request carries `layout: "grid"`
- **THEN** it is refused with `400 invalid_input` naming `layout` and no link is made

### Requirement: Readable public link address
The address returned when a link is created SHALL carry the link's name before the secret: the name in lower case, every run of characters other than letters and digits as one hyphen, at most 40 characters, then a hyphen and the secret (`/public/party-groceries-otl_…`), or the secret alone when the name has no letters or digits. The public read and tick SHALL accept the secret with or without a name before it; the name SHALL never be needed to open a link and never be enough.

#### Scenario: Named link
- **WHEN** a link named "Party groceries" is created
- **THEN** its address is `/public/party-groceries-<secret>`, and both that address and `/public/<secret>` open the list

#### Scenario: Name without the secret
- **WHEN** someone opens `/public/party-groceries`
- **THEN** the page says the link no longer works, as for any wrong secret
