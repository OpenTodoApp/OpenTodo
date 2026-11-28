## MODIFIED Requirements

### Requirement: Phone navigation
Below 768 px the shell SHALL show a bottom tab bar with Inbox, Today and Upcoming in the user's primary destination order (`appearance-preferences` "Primary destination order"), then Search. With no stored order that is Inbox, Today, Upcoming and Search. Search is not a destination and SHALL stay last, and the bar SHALL NOT gain further destinations. The phone drawer opens from the shell bar's menu button (see "Phone drawer"). The bar SHALL float as a rounded capsule inset from the sides and above the bottom safe area, with the content scrolling on under it. The bar SHALL mark the current tab in the strong text tone on a pill rather than in the accent, and a round add button beside the bar's end, at its height, SHALL open quick add as a bottom sheet with the keyboard up; where the button is not offered the bar SHALL take its place. The bar and the button SHALL hide while a sheet is open and on the task page, which has its own bar with Back and the task's menu; the next and previous task are items of that menu. Tabs SHALL be at least 48 px tall and SHALL respect the bottom safe area. Every list SHALL reserve the bar's and the button's footprint under its last row, so neither covers a row or its metadata at the end of the list. While the content scrolls down by more than 24 px the bar SHALL minimise to its icons and the button SHALL slide out below it; on any scroll up, at the end of the content, or 600 ms after scrolling stops, both SHALL return. When the system requests reduced motion the bar and the button SHALL stay in place at all times. The Inbox and Today tabs SHALL show their open counts, the numbers the drawer shows, on the tab's icon, hidden at zero and on the current tab, whose screen already shows its tasks, and the count SHALL be part of the tab's accessible name while it shows. The content scrolling under the bar SHALL fade into the page's background behind it, so a row's text does not show through the bar. A hold on the Today tab SHALL open the first open task due today at a time still ahead (Today itself when there is none), and a hold on the Inbox tab SHALL open the Inbox with quick add open; a tap keeps its meaning. This is presentation only; every action behind the bar and the button is the same local operation offline.

#### Scenario: Two taps to any primary view
- **WHEN** the user is in a project on a phone and taps Today in the bar
- **THEN** Today opens without the drawer

#### Scenario: Four tabs
- **WHEN** the Inbox is open on a 390 px phone and the user has never reordered destinations
- **THEN** the tab bar shows Inbox, Today, Upcoming and Search in that order, Inbox is marked current in the strong text tone, and no tab is in the accent colour

#### Scenario: Tab order follows the sidebar
- **WHEN** the user moved Today above Inbox in Settings → Appearance and opens the app on a 390 px phone
- **THEN** the tab bar shows Today, Inbox, Upcoming and Search, Search is last, and no tab is in the accent colour

#### Scenario: Add from anywhere
- **WHEN** the user taps the add button beside the tab bar in Upcoming
- **THEN** quick add opens as a bottom sheet with its field focused and the Upcoming default date applied, and the list stays visible above the keyboard

#### Scenario: The last row is readable
- **WHEN** a list of twenty tasks is scrolled to its end on a 390×844 phone
- **THEN** the last row's title and metadata are fully visible above the tab bar and the add button, and nothing is under either

#### Scenario: The bar minimises while reading
- **WHEN** the user scrolls a long list down by 100 px on a phone without reduced motion
- **THEN** the tab bar shows only its icons at a smaller height and the add button is off screen, and a scroll up of any distance brings both back at full size

#### Scenario: Reduced motion keeps the bar
- **WHEN** reduced motion is requested and the user scrolls a long list down
- **THEN** the tab bar and the add button do not move

#### Scenario: The bar floats over the list
- **WHEN** a long list is open on a 390×844 phone and the user scrolls it
- **THEN** the rows pass under the tab bar, which keeps 8 px between itself and the bottom safe area and 12 px from each side, and the add button sits at the bar's end on the same baseline

#### Scenario: Counts on the tabs
- **WHEN** the Inbox has 5 open tasks and Today 3 on a phone
- **THEN** the Inbox tab shows 5 and the Today tab 3 on their icons, and their accessible names include the counts

#### Scenario: Hold Today
- **WHEN** the person holds the Today tab for half a second at 10:00 while "Send the invoice" is the first open task due today at a time after 10:00
- **THEN** the page of "Send the invoice" opens

#### Scenario: The current tab has no count
- **WHEN** Today is open on a phone with five open tasks in the Inbox and three for today
- **THEN** the Inbox tab shows 5 and the Today tab shows no count
