# Spec Delta

## ADDED Requirements

### Requirement: Overlays fit every screen
Every menu, popover, picker, dialog and toast SHALL be fully inside the viewport from 360 px wide up, with its close control visible and usable. Below 640 px menus, popovers and pickers SHALL open as bottom sheets across the screen width; from 640 px up they SHALL open next to their trigger, shifted or flipped to stay inside the viewport. A dialog taller than the screen SHALL become a full-screen sheet with a pinned header and close button.

#### Scenario: Notifications on a phone
- **WHEN** a user on a 390 px wide screen taps the bell
- **THEN** the notifications open as a bottom sheet across the screen, every entry is fully visible and the sheet closes with its close button or a tap outside

#### Scenario: Menu near the edge on a tablet
- **WHEN** a menu's trigger sits near the left edge of a 768 px screen
- **THEN** the menu opens shifted so that it is entirely on screen

#### Scenario: Long dialog
- **WHEN** a dialog's content is taller than the screen
- **THEN** it opens full screen, its content scrolls and its close button stays visible at the top

### Requirement: Consistent overlay behaviour
All overlays SHALL close with Escape and, except destructive confirmations, with a tap outside; move focus into themselves when opened and back to their trigger when closed; keep the page behind from scrolling while open; respect device safe areas; and expose their role and label to assistive technology.

#### Scenario: Escape and focus
- **WHEN** a keyboard user opens a menu and presses Escape
- **THEN** the menu closes and focus returns to the button that opened it

#### Scenario: Background stays put
- **WHEN** a user scrolls inside an open bottom sheet
- **THEN** only the sheet scrolls and the page behind it does not move

### Requirement: Phone layout rules
From 360 px wide up no screen SHALL scroll horizontally, except designated regions (board columns, week grid, wide tables) that scroll inside themselves. On touch screens interactive controls SHALL be at least 44×44 px and controls shown on hover SHALL always be visible. Long words and URLs SHALL wrap, layouts SHALL follow the visible viewport height and safe areas, and the on-screen keyboard SHALL not hide the focused field.

#### Scenario: Narrow phone
- **WHEN** any screen is shown 360 px wide
- **THEN** the page has no horizontal scrollbar and nothing is cut off at the edges

#### Scenario: Row menu on a touch screen
- **WHEN** a touch-screen user looks at the sidebar views or labels
- **THEN** their menu buttons are visible without hovering and at least 44 px in both directions

#### Scenario: Long URL in a comment
- **WHEN** a comment contains a 120-character URL
- **THEN** it wraps inside the comment and the page does not scroll sideways

### Requirement: Automated layout check
CI SHALL open every screen and every overlay at 360, 390 and 768 px wide, in light and dark themes, in Chromium and in WebKit, and SHALL fail when a page scrolls horizontally outside designated regions, an overlay or its close control is outside the viewport or not clickable, an overlay does not close with Escape and its close button, or a touch target is smaller than 44×44 px.

#### Scenario: A new popover overflows
- **WHEN** a change adds a popover that opens past the screen edge at 390 px
- **THEN** the layout job fails and names the screen, overlay, viewport and engine, with a screenshot

#### Scenario: Safari-only bug
- **WHEN** an overlay works in Chromium but cannot be closed in WebKit
- **THEN** the layout job fails for WebKit
