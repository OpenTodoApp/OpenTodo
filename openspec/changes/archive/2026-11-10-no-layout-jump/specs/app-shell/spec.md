## ADDED Requirements

### Requirement: Nothing appears above a list after it is shown
Once a list is on screen, nothing SHALL appear or grow above its rows unless the user asked for it there: a notice that arrives later (a removed start view, a change the server refused, a new version ready, an update the app refused) SHALL be a toast in the bottom corner, and a part of a page that loads after the list SHALL sit below its rows. The toasts SHALL keep their text and controls: the update prompt keeps "Reload to update" until reloaded, the refused update keeps its help link and Dismiss. This is presentation only and behaves the same offline.

#### Scenario: A new version while reading the Inbox
- **WHEN** a new release takes over the tab while the user reads the Inbox
- **THEN** "A new version of OpenTodo is ready." with "Reload to update" shows as a toast in the bottom corner, and no row of the Inbox moves

#### Scenario: Refused change
- **WHEN** the server refuses a change after a role change while Today is on screen
- **THEN** a toast explains it, and the list does not move

### Requirement: No floating add button in the rituals
Below 768 px the shell SHALL hide the floating add button in Focus and in Close the day, which keep nothing else on screen. The tab bar SHALL stay, the rest of the review SHALL keep the button, and the button SHALL return on the next view that offers quick add. Close the day SHALL draw one divider under the shell's bar on a phone, also while it offers Reopen the day.

#### Scenario: Focus on a phone
- **WHEN** the user opens Focus on a 390 px phone
- **THEN** the tab bar stays, the floating add button is gone, and it returns when the user opens Today

#### Scenario: Close the day after closing
- **WHEN** the user reopens Close the day on a 390 px phone after closing the day
- **THEN** Reopen the day shows in the page under the shell's bar, with one divider under the bar and no floating add button
