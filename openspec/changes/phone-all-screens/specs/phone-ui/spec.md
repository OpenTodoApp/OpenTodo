# Spec Delta

## ADDED Requirements

### Requirement: Every screen has the phone header
Below 768 px, every screen inside the app's shell that has a page header SHALL show it as the phone header: a bar with the button that opens the drawer, or Back on a page that has a way back, then the page's own controls and its menu; under the bar the page's title large with its lead line; and the title in the bar once the large one has scrolled away. The shell's own phone bar SHALL NOT be shown on such a screen. Every action of the page's header and menu SHALL be offered, Help included. A header inside a page (a section's own) SHALL stay as it is.

This widens the first requirement of this capability: below 768 px a screen other than a task list or the task page is no longer unchanged. Its content, and everything it does, SHALL stay the page's own. Nothing here writes data.

#### Scenario: A screen that is not a list
- **WHEN** at 390 px a person opens Labels
- **THEN** the bar has the menu button and the page's controls, the title "Labels" is large under it, and the shell's own bar is not shown

#### Scenario: The same actions
- **WHEN** the person opens the menu of the calendar's week in the phone header
- **THEN** it offers every item of the week's menu, Help included

#### Scenario: A nested page
- **WHEN** the person opens Settings, then Appearance
- **THEN** the bar starts with Back, and Back returns to Settings

#### Scenario: The title follows the scroll
- **WHEN** the person scrolls Statistics until its large title is out of sight
- **THEN** the bar shows "Statistics"

#### Scenario: A wide window
- **WHEN** the window is 768 px or wider
- **THEN** every screen has the header it has without this capability

### Requirement: Every task row is the phone row
Below 768 px, every screen that lists tasks with the app's task row SHALL draw each as the phone task row of this capability: the check, the title on up to two lines, one line of facts. A tap SHALL open the task page; the check SHALL complete or reopen the task through the same write as the screen's row from 768 px; and where the screen's rows take a swipe, a hold menu or a tick, the phone row SHALL take the same. A task the person may not edit SHALL have its check off.

Every change made from such a row SHALL be written as the same operations as from 768 px, SHALL work offline, and SHALL converge with changes from other devices as that action does.

#### Scenario: A saved view
- **WHEN** at 390 px a person opens a saved view with three tasks
- **THEN** the three tasks are phone rows, in the view's order, and a tap on one opens its task page

#### Scenario: Completing in Next
- **WHEN** the person taps the check of a task in Next
- **THEN** the task is completed, Undo is offered, and another device shows it completed after sync

#### Scenario: Offline
- **WHEN** the phone is offline and the person completes a task in a filter's results
- **THEN** the row shows it completed at once, and the completion reaches the server when the phone is back online

### Requirement: One canvas for every screen
Below 768 px, every screen inside the shell SHALL sit on the phone UI's background with the same gutter at its sides as the task lists, and a list's group headings SHALL be drawn without their filled bar. No screen SHALL scroll sideways, and every control SHALL keep a target of at least 44 px.

#### Scenario: Moving between screens
- **WHEN** the person goes from Today to Labels to the calendar's week
- **THEN** the bar, the title's place and size, the background and the side gutter are the same on all three

#### Scenario: Nothing sideways
- **WHEN** each screen of the app is opened at 360 px
- **THEN** none scrolls sideways and none has a control smaller than 44 px
