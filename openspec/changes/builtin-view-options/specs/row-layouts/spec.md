## MODIFIED Requirements

### Requirement: Where the row layout is chosen
The account SHALL have one row layout, set in Settings › Appearance as "Task rows" (One line or Detailed), stored in the user's synced preferences and used by every list without its own choice: Today, Upcoming, the Inbox, search results and the other built-in lists, and every view, project or label that has not chosen. A saved view, the New view page, a project's list, a label's page, Today, Upcoming and the Inbox SHALL offer One line and Detailed in their display panel, showing the layout in use; a choice SHALL be stored on the view, in the user's personal preferences of the project, on the label, or in the user's preferences for that built-in view, apply at once and win over the account's. Every choice SHALL be an operation written locally first, working offline and converging per field by last writer wins. An empty or unknown stored value SHALL read as the account's layout (for the account itself, One line) and SHALL not be rewritten.

#### Scenario: Account choice
- **WHEN** the user picks Detailed under Settings › Appearance › Task rows on the laptop
- **THEN** Today and the Inbox show detailed rows on the laptop at once and on the phone after sync, and a project without its own choice does too

#### Scenario: A project's own choice
- **WHEN** the account uses Detailed and the user picks One line in the display options of the project "Home"
- **THEN** "Home" shows one-line rows and the other lists stay detailed

#### Scenario: Today's own choice
- **WHEN** the account uses One line and the user picks Detailed in Today's display options
- **THEN** Today shows detailed rows and Upcoming and the Inbox keep one-line rows

#### Scenario: Unknown value
- **WHEN** a newer client stores a row layout this version does not know on a view
- **THEN** this version shows the view in the account's layout and leaves the stored value unchanged
