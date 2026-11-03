## ADDED Requirements

### Requirement: The phone drawer is inert when closed and owns the page when open
Below 768 px the drawer SHALL be out of the tab order and out of the accessibility tree while it is closed: it SHALL carry inert and be hidden from assistive technology, and nothing inside it (the find field, the destinations, the account footer) SHALL be focusable or read. While it is open it SHALL behave as an overlay: it SHALL take focus when it opens, Tab and Shift+Tab SHALL stay inside it, the page behind it SHALL be inert and SHALL not scroll, Escape and the system Back SHALL close it, and focus SHALL return to the menu button that opened it. From 768 px the sidebar SHALL be a column: never inert, never hidden from assistive technology, and never marking the page as inert. The scrim SHALL belong to the open drawer, and a swipe on it SHALL not scroll the page behind.

#### Scenario: A closed drawer is skipped
- **WHEN** the Inbox is open on a 390 px phone and the user presses Tab from the menu button
- **THEN** focus leaves the bar for the page content, never entering the off-screen drawer, and a screen reader does not list the drawer's destinations

#### Scenario: The open drawer holds focus
- **WHEN** the user opens the drawer with the menu button
- **THEN** focus moves into the drawer, Tab and Shift+Tab cycle inside it, the page behind is inert and does not scroll, and the tab bar and add button leave the page

#### Scenario: Escape closes it and gives focus back
- **WHEN** the open drawer has focus and the user presses Escape
- **THEN** the drawer closes, becomes inert again, the page behind is interactive, and focus is back on the menu button

#### Scenario: The column is never inert
- **WHEN** the same account is open at 1280 px
- **THEN** the sidebar is not inert and not hidden from assistive technology, and the page behind it is not inert
