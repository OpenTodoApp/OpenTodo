## ADDED Requirements

### Requirement: Feed pages read what they need
The feed route SHALL read the histories of the most recently changed entities first, stop once the page and whether another follows are certain, and never read encoded document fields. Every page, cursor and `more` flag SHALL equal what the whole history gives, with every filter. The route only reads; late ops from an offline device appear where their time places them, as before.

#### Scenario: First page of a long history
- **WHEN** a member opens the feed of a project with thousands of tasks and a long history
- **THEN** the first page is served from the histories of the recently changed tasks only, and holds the same events as before

#### Scenario: Paging with filters
- **WHEN** a client pages through the feed with any page size and any combination of project, actor and kind filters
- **THEN** every page and cursor equals the one computed from the whole history

#### Scenario: Bad cursor
- **WHEN** the cursor is not one this route returned
- **THEN** the response is 400 `invalid_input`, as before
