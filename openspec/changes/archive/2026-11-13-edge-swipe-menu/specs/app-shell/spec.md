## ADDED Requirements

### Requirement: Edge swipe opens the phone menu
On a phone, a touch that starts within 20 pixels of the left edge and moves right past the reveal distance of the row swipes (64 pixels), or flicks right, SHALL open the closed menu drawer, unless a dialog is open. A swipe that turns into a scroll or moves left SHALL leave it closed, a mouse SHALL never start it, and a task or note row SHALL never take a press that starts in that strip. The iOS shell SHALL not offer the web view's history back gesture.

#### Scenario: Swipe from the edge
- **WHEN** a person on a phone swipes right from the left edge of Today
- **THEN** the menu opens, as when they tap the menu button

#### Scenario: Row swipes keep their place
- **WHEN** a person swipes a task row right starting in the middle of the row
- **THEN** the row's own swipe action runs and the menu stays closed
