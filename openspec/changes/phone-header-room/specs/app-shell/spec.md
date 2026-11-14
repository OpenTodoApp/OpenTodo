# Spec Delta

## ADDED Requirements

### Requirement: Help in the phone bar's menu
Below 768 px, on a page whose bar has a menu (the overflow menu or the page's own menu), the page's Help action SHALL be the last item of that menu, after a separator, and the bar SHALL show no Help button, so the title has that room. The item SHALL be named "Help", SHALL open the same guide section for the screen as the header's Help action does, SHALL be reachable with the menu's keyboard model (arrow keys, End, type-ahead), and focus SHALL return to the menu's button when the guide closes. A step that takes the menu's place (a picker inside the project menu) SHALL NOT show the item, and the bar SHALL NOT grow a Help button while that step is open. On a page whose bar has no menu that can hold the item, the bar SHALL keep the Help button. From 768 px the page header SHALL keep its Help button and its menus SHALL NOT repeat Help. This is presentation only: it reads and writes no data and behaves the same offline.

#### Scenario: Inbox on a small phone
- **WHEN** the Inbox is open on a 360 px screen
- **THEN** the bar shows the menu button, the title with its lead line, Process, Display options and the Inbox menu, and no Help button

#### Scenario: Help from the menu
- **WHEN** the user opens the "…" menu of a project on a 360 px screen and chooses Help, its last item
- **THEN** the guide's section for projects opens over the page, and closing it puts focus on the menu's button

#### Scenario: Help by keyboard
- **WHEN** the user focuses the bar's menu button on Today at 390 px, presses Enter, then End, then Enter
- **THEN** focus is on Help after End, and the guide's section for Today opens

#### Scenario: A page without a menu
- **WHEN** Settings is open on a 360 px screen
- **THEN** the bar shows the menu button, the title and the Help button

#### Scenario: A picker step
- **WHEN** the user opens a project's menu on a 360 px screen and chooses Move to…
- **THEN** the picker shows no Help item, and the bar behind it still has no Help button

#### Scenario: Wider screens
- **WHEN** the Inbox is open on a 1280 px screen
- **THEN** the header ends with the Help button, and the Inbox menu has no Help item
