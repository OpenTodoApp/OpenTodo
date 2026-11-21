# Spec Delta

## MODIFIED Requirements

### Requirement: Phone header actions
Below 768 px a list SHALL show its actions in the shell's bar and its overflow menu, never as a row of controls between the bar and the quick add, so the rule "Nothing between the header and the list" holds at every width. The bar SHALL show at most two visible actions: Process the Inbox in the Inbox, the Ask action in Today when the assistant is available, and the page's display options; Display mode, "Select tasks", the duration filter, Upcoming's "Filter…" and the rest SHALL be in the overflow, so the bar has no Filter button and the title has that room. The duration filter's choices SHALL be a group of the menu named "Filter by duration", each a checkable item reached with the menu's keyboard model, with the active one checked; choosing one SHALL close the menu and return focus to its button. The Inbox SHALL have no subtitle: its planned tasks without a project are the last group of its list (OpenSpec `web-app`, "Standard views"). An active duration filter SHALL show as one chip in the bar, not above the list: the filter icon and a clear mark in the accent-soft tone, at most 48 px wide and at least 44 px high to the touch, named "Clear filter" and preceded by the filter's name for assistive technology; activating it SHALL clear the filter. From 768 px the header SHALL keep its Filter action and the chip with the filter's name. The filter is a per-device choice applied to local data, so this is presentation only: it writes nothing, behaves the same offline and needs no convergence.

#### Scenario: Today on a phone
- **WHEN** Today with ten tasks opens on a 390×844 phone
- **THEN** the only chrome above the first task is the bar, Today's head (the title, the date line and the briefing) and the quick add, Display mode is in the bar's overflow, and at least four tasks are visible without scrolling

#### Scenario: Inbox on a phone
- **WHEN** the Inbox with eight tasks and three planned tasks without a project opens on a phone
- **THEN** the bar shows "Process 8" as a visible action, no subtitle, and no row of controls under it; the three planned tasks are the folded group at the end of the list

#### Scenario: A project on a small phone
- **WHEN** a project opens on a 360 px screen with no filter on
- **THEN** the bar shows the menu button, the project's name, Display options and the project menu, and no Filter button

#### Scenario: Filter chip in the bar
- **WHEN** the user opens the menu in the bar of a project on a phone and picks "Quick wins" under "Filter by duration"
- **THEN** the list is filtered, focus is on the menu's button, one chip with the filter icon and a clear mark appears in the bar, and the first task keeps its place under the quick add

#### Scenario: Filter by keyboard
- **WHEN** the user focuses the project menu's button on a 360 px screen, presses Enter, types "quick" and presses Enter
- **THEN** focus is on "Quick wins" after typing, and the list is filtered after Enter

#### Scenario: Clear from the bar
- **WHEN** "Quick wins" is on in a project on a phone and the user taps the chip in the bar
- **THEN** the filter is cleared, the chip is gone and the menu shows no choice checked

#### Scenario: Upcoming's query filter
- **WHEN** the user opens the bar's menu on Upcoming on a phone and chooses "Filter…"
- **THEN** the filter dialog opens, and closing it puts focus on the menu's button

#### Scenario: Wider screens
- **WHEN** a project is open on a 1280 px screen and "Quick wins" is on
- **THEN** the header shows the Filter action and a "Quick wins" chip with a clear control, and the project menu has no "Filter by duration" group
