# Spec Delta

## Purpose

Defines the shared visual and interaction building blocks of the web client (tokens, icons, controls, menus, pickers, surfaces and patterns) and the accessibility and quality bar every one of them must meet, so screens look and behave consistently.

## ADDED Requirements

### Requirement: One icon set
Every pictogram in the client SHALL come from one line-icon set with a consistent grid and stroke. Emoji and Unicode symbols SHALL NOT be used as icons. User-written content and emoji typed by users are unaffected. Icons SHALL follow the current text colour, so they adapt to light and dark themes.

#### Scenario: Sidebar views use icons
- **WHEN** the sidebar renders Inbox, Today, Upcoming and the other built-in views
- **THEN** each entry shows an icon from the set and no emoji

#### Scenario: Theme follows text colour
- **WHEN** the user switches the system theme between light and dark
- **THEN** every icon changes colour with its surrounding text, without a separate dark asset

### Requirement: Icons are accessible
Decorative icons SHALL be hidden from assistive technology. A control whose only visible content is an icon SHALL have an accessible name that describes its action, and SHALL show that name as a tooltip on hover or focus with a fine pointer.

#### Scenario: Icon-only button announces its action
- **WHEN** a screen reader user focuses the menu button showing the "more" icon on a label row
- **THEN** it is announced with a name such as "Label actions", not as an unlabelled button or a symbol

### Requirement: Buttons
The client SHALL offer buttons in four emphasis levels (primary, secondary, ghost, danger), in three sizes, and as icon-only buttons. Every button SHALL show visible hover, focus-visible, pressed and disabled states. A button performing a pending action SHALL show a busy state, announce it, and ignore repeated activation until the action settles.

#### Scenario: Busy button ignores double activation
- **WHEN** a user presses "Save" twice quickly while the save is in progress
- **THEN** the action runs once, and the button shows a busy indicator with `aria-busy` until it finishes

#### Scenario: Focus is visible
- **WHEN** a keyboard user tabs onto any button
- **THEN** a focus ring in the accent colour is visible, with at least 3:1 contrast against the surface

### Requirement: Form controls
Text inputs, text areas, selects, checkboxes and switches SHALL share one visual style, each with a visible label, an optional description, and an error state. The description and error are announced with the field. A binary setting that takes effect immediately SHALL be presented as a switch with switch semantics; a choice that is submitted with a form SHALL be a checkbox.

#### Scenario: Error is announced
- **WHEN** a field fails validation
- **THEN** it shows the error text below the field in the danger colour, is marked invalid, and assistive technology reads the error together with the label

#### Scenario: Immediate setting is a switch
- **WHEN** a screen reader user focuses a preference that applies immediately
- **THEN** it is announced as a switch with its on or off state

### Requirement: Menus are keyboard navigable
Action menus SHALL expose menu semantics. When a menu opens, focus SHALL move to its first enabled item. Arrow keys SHALL move between items, Home and End SHALL jump to the first and last item, typing a letter SHALL move to the next item starting with it, and Enter or Space SHALL activate. Activating an item SHALL close the menu and return focus to the trigger, as specified for all overlays.

#### Scenario: Arrow keys move through items
- **WHEN** a keyboard user opens a view's "more" menu and presses Down twice, then Enter
- **THEN** the third enabled item runs and focus returns to the menu button

#### Scenario: Type-ahead
- **WHEN** a menu is open and the user types "d"
- **THEN** focus moves to the next item whose label starts with "d", such as "Delete view"

### Requirement: Menu item anatomy
Each menu item SHALL show a label and MAY show a leading icon and a trailing keyboard shortcut hint. Related items SHALL be grouped and visually separated. Destructive items SHALL use the danger colour and be placed last. Unavailable items SHALL be shown disabled with the reason available as a description, rather than hidden, when their absence would confuse.

#### Scenario: Destructive item is distinct
- **WHEN** a user opens a label's menu
- **THEN** "Delete label" appears last, separated from the other items, in the danger colour

#### Scenario: Shortcut hint
- **WHEN** a menu item has a keyboard shortcut
- **THEN** the shortcut is shown right-aligned in the item, and is also included in its accessible description

### Requirement: Smart picker
Choosing one or more items from a collection (people, labels, projects, tasks) SHALL use a picker that combines a text field with a list of options and follows the ARIA combobox pattern. Focus stays in the field while arrow keys move the active option. Enter picks, Escape closes, and the number of results is announced as it changes.

#### Scenario: Keyboard picking
- **WHEN** a user opens a picker, types "wo", presses Down, then Enter
- **THEN** the second matching option is picked and the picker closes or clears, depending on whether it allows multiple picks

#### Scenario: Results are announced
- **WHEN** typing narrows the list to three options
- **THEN** assistive technology announces that three results are available

### Requirement: Picker ranking
With an empty query, a picker SHALL list the most probable options first: the options picked most recently in that picker context on this device, then the most frequently picked, then the rest in the source's natural order. The current selection SHALL be marked. Pick history SHALL stay on the device: it is not synced, exported or sent to the server, and it is cleared on sign-out.

#### Scenario: Recent pick comes first
- **WHEN** a user assigned the label "errands" a moment ago and then opens the label picker on another task
- **THEN** "errands" appears at the top of the list before alphabetical labels

#### Scenario: Works offline
- **WHEN** the device is offline and the user opens any picker
- **THEN** the ranking is computed from local data only and the picker works as online

#### Scenario: History is not shared
- **WHEN** the same user opens the label picker on a second device
- **THEN** the order reflects only the picks made on that second device

### Requirement: Picker matching
Typing SHALL filter options case- and accent-insensitively. An option matches when every typed word is a prefix of a word in its label or secondary text, or when the typed letters appear in order in the label (fuzzy). Prefix matches SHALL rank above fuzzy matches, and the matching characters SHALL be highlighted.

#### Scenario: Word prefix
- **WHEN** the user types "gro sh" in a project picker
- **THEN** "Grocery shopping" is listed above any fuzzy-only match

#### Scenario: Accent-insensitive
- **WHEN** the user types "cafe"
- **THEN** a label named "Café" matches

### Requirement: Grouped, hierarchical and creatable pickers
A picker SHALL support named groups of options and indented hierarchy, such as a project tree that shows each match's parent path. When the source allows creation and no option equals the query, the picker SHALL offer a "Create “query”" option, placed last.

#### Scenario: Nested project match shows its path
- **WHEN** the user types "q3" and a sub-project "Q3 plan" lives under "Work"
- **THEN** the option reads "Q3 plan" with "Work" shown as its path

#### Scenario: Create row
- **WHEN** the user types "urgent" in the label picker and no label has that name
- **THEN** the last option is "Create “urgent”", and picking it creates the label and assigns it

### Requirement: Large and asynchronous sources
A picker SHALL handle collections of at least 10,000 options without visible input lag, rendering only the visible rows. A source that loads results asynchronously SHALL show a loading state, ignore results that arrive for an outdated query, and show an empty state with guidance when nothing matches.

#### Scenario: Stale results ignored
- **WHEN** the user types "ab" then quickly "abc", and the results for "ab" arrive after those for "abc"
- **THEN** the list shows only the results for "abc"

#### Scenario: Empty state
- **WHEN** no option matches the query and creation is not allowed
- **THEN** the list shows a "No matches" message instead of an empty box

### Requirement: Picker presentation
A picker SHALL open inline, anchored to its field, from 640 px wide, and as a bottom sheet with its field at the top below 640 px, following the overlay rules for viewport fit, Escape and focus return.

#### Scenario: Phone sheet
- **WHEN** a user on a 375 px wide phone opens the assignee picker
- **THEN** it opens as a bottom sheet with the search field focused and the on-screen keyboard not covering the options

### Requirement: Surfaces and data display
The client SHALL offer shared cards, badges or chips (solid and soft variants in the palette colours), avatars, tabs, timelines and empty states. An avatar without a picture SHALL show the person's initials on a palette colour derived deterministically from their account id, so the same person always has the same colour on every device. Tabs SHALL use roving focus, with arrow keys moving between tabs.

#### Scenario: Same colour everywhere
- **WHEN** a member appears in the assignee chip, a comment and the members list, on two devices
- **THEN** their avatar has the same initials and colour in every place

#### Scenario: Tabs by keyboard
- **WHEN** a keyboard user focuses a tab list and presses Right
- **THEN** focus and selection move to the next tab and its panel is shown

### Requirement: Settings section and row patterns
Settings content SHALL be built from sections and rows. A section is a titled card with an optional description and help link. A row puts a label and its description beside the control from 640 px wide, and stacks them below 640 px. Each row shows the current state before any action that changes it.

#### Scenario: Row stacks on phones
- **WHEN** a settings row is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

### Requirement: Confirmation dialog
The client SHALL offer one shared confirmation dialog, used instead of the browser's native confirm prompt. It SHALL name the action and its consequence, start focus on the safe choice, cancel on Escape and return focus to the control that opened it. A destructive confirmation SHALL NOT close on an outside tap.

#### Scenario: Destructive confirmation by keyboard
- **WHEN** a keyboard user triggers a destructive action and the confirmation dialog opens
- **THEN** focus is on Cancel, Escape closes the dialog without acting, and focus returns to the control that opened it

#### Scenario: Outside tap does not confirm or dismiss
- **WHEN** a destructive confirmation is open and the user taps outside it
- **THEN** the dialog stays open and nothing is changed

### Requirement: List row
The client SHALL offer one shared list row with an optional leading icon or avatar, a primary label, secondary details, optional badges and an optional trailing menu, reachable and operable by keyboard.

#### Scenario: List row on a phone
- **WHEN** a list row with a long label, several badges and a trailing menu is shown 320 px wide
- **THEN** the label wraps or truncates, the menu stays reachable, and nothing scrolls horizontally

### Requirement: Primitive quality bar
Every shared building block SHALL be documented in the component workbench, with stories covering its states in light and dark themes at phone and desktop widths. It SHALL pass automated accessibility checks with no violations, and SHALL have a visual-regression baseline and unit tests for its behaviour. A building block that misses any of these SHALL NOT be used by screens.

#### Scenario: Missing story fails CI
- **WHEN** a new primitive is added under the shared UI folder without a stories file
- **THEN** the design-system check in CI fails and names the primitive

#### Scenario: Accessibility regression fails CI
- **WHEN** a change removes the accessible name from an icon-only button story
- **THEN** the accessibility gate fails on that story
