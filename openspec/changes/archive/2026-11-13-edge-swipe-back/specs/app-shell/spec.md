## RENAMED Requirements

- FROM: `### Requirement: Edge swipe opens the phone menu`
- TO: `### Requirement: Edge swipe goes back or opens the phone menu`

## MODIFIED Requirements

### Requirement: Edge swipe goes back or opens the phone menu
On a phone, a touch that starts within 20 pixels of the left edge and moves right past the reveal distance of the row swipes (64 pixels), or flicks right, SHALL go back exactly as the bar's Back does when the page has one (a task, a note, a nested page), and SHALL otherwise open the closed menu drawer, unless a dialog is open. A swipe that turns into a scroll or moves left SHALL do nothing, a mouse SHALL never start it, and a task or note row SHALL never take a press that starts in that strip. The iOS shell SHALL not offer the web view's history back gesture. The installed web app on an iPhone or iPad (Safari's standalone mode) SHALL not watch the edge, so the system's own back swipe is the only edge gesture there. The gesture changes nothing stored, works offline and has nothing to converge.

#### Scenario: Swipe from the edge
- **WHEN** a person on a phone swipes right from the left edge of Today
- **THEN** the menu opens, as when they tap the menu button

#### Scenario: Back from a task
- **WHEN** a person on a phone has opened a task from Today and swipes right from the left edge
- **THEN** Today is shown again, as when they tap Back, and the menu stays closed

#### Scenario: Installed web app on an iPhone
- **WHEN** a person uses the installed web app on an iPhone and swipes right from the left edge of a project they opened from Today
- **THEN** only the system's back swipe runs, and the menu stays closed

#### Scenario: Row swipes keep their place
- **WHEN** a person swipes a task row right starting in the middle of the row
- **THEN** the row's own swipe action runs and the menu stays closed
