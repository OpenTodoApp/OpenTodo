# Spec Delta

## ADDED Requirements

### Requirement: Task page controls on touch do not overlap
On a coarse pointer the controls at the top of a task's page (Back and the menu in the phone bar, the completion circle, the title) and its conversation tabs (Comments, Activity, History, Time) SHALL each take taps in an area of at least 44 by 44 CSS pixels, and no two of these areas SHALL overlap by more than 4 CSS pixels on both axes. A tap SHALL act on the control whose area it is in. The completion circle's area SHALL begin where the page begins under the bar, at the top of the title's first line, and reach down beside the title; the circle itself SHALL stay centred on the title's first line, and neither it nor the title SHALL move. The comment field pinned to the bottom of the page MAY lie under the tab row while its own place is further down the page; scrolling to the end of the page SHALL bring it to its place under the conversation, with the tabs clear of it. With a fine pointer nothing SHALL change. This is presentation only: completing, going back and switching tabs write what they wrote before, so it is the same offline.

#### Scenario: Circle under the bar
- **WHEN** a task's page is shown at 360 px on a touch screen, scrolled to its top, and the user taps the bottom edge of Back, then the top edge of the completion circle's area
- **THEN** the first tap returns to the list and completes nothing, and the second completes the task and the page stays

#### Scenario: Circle on the first line
- **WHEN** a task whose title takes two lines is shown at 360 px on a touch screen
- **THEN** the circle is centred on the title's first line, and its area is 44 px tall from the top of that line

#### Scenario: Tabs near the bottom
- **WHEN** a task with no comments is shown at 360 px on a touch screen and the tabs sit just above the pinned comment field
- **THEN** a tap on each of Comments, Activity, History and Time selects that tab, and after scrolling to the end of the page the comment field is below the tabs with none of it under them

#### Scenario: A mouse is unchanged
- **WHEN** the same page is shown at 1280 px with a mouse
- **THEN** the completion control is 24 px, centred on the title's first line, as before
