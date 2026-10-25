# design-system Specification

## Purpose

Defines OpenTodo's visual language, its design tokens and the guarantees that come with them. It also defines the contributor workbench that verifies every UI building block, so every screen looks consistent, stays accessible in both themes and keeps the app's emerald and slate identity.

## Requirements

### Requirement: Semantic design tokens
The web app SHALL define named tokens for surfaces, text, borders (a container edge, a softer divider and a control edge), the accent, priorities p1–p4, status (success, warning, danger, info), a 12-hue palette with solid and soft steps, type sizes, spacing, radii, elevations and motion durations and curves. Each colour token SHALL have a light and a dark value. Every colour token SHALL be authored in the OKLCH colour space, either as a literal `oklch()` value inside the sRGB gamut or as a mix of other tokens in OKLCH; a hex, `rgb()`, `hsl()` or named colour inside a token block SHALL fail the token lint. Every screen, shared component and component style class SHALL style colour through these tokens instead of raw colour literals, raw palette classes or fixed white and black.

#### Scenario: Theme switch
- **WHEN** the system colour scheme changes from light to dark
- **THEN** every surface, text, border, accent, priority, status and palette token switches to its dark value without a reload

#### Scenario: New component uses a raw colour
- **WHEN** a component added under the shared UI folder uses a raw Tailwind colour class or hex literal instead of a token
- **THEN** the token lint in `make check` fails and names the file and line

#### Scenario: A screen uses a raw colour
- **WHEN** a contributor adds `text-slate-500`, `bg-white` or a hex literal to a screen or to a component style class
- **THEN** the token lint in `make check` fails and names the file and line

#### Scenario: Screens awaiting their redesign
- **WHEN** a screen is on the lint's named allow-list because an open change is rewriting it
- **THEN** the lint skips only that screen, and adding a new entry to the allow-list fails the lint

#### Scenario: Stored data colour
- **WHEN** a screen passes a stored project, label or view colour to a component as data
- **THEN** the lint does not report it, and the colour renders through the palette

#### Scenario: A hex value in a token block
- **WHEN** a contributor writes `--ot-muted: #526075;` in the light token block
- **THEN** the token lint in `make check` fails and names the stylesheet line, and the same value written as `oklch(0.47 0.028 262)` passes

#### Scenario: Divider and container edges
- **WHEN** a list separates two groups with a hairline and a card draws its edge
- **THEN** the hairline uses the softer divider token and the card edge the container border token, and both stay visible (at least 1.1:1) on every surface in both themes

### Requirement: OpenTodo identity is preserved
Emerald SHALL be the default accent, and the accent SHALL come from the fixed set of themes the user can choose. Neutrals SHALL remain one slate family in every theme, with low chroma so they read calm rather than blue. The light theme SHALL keep white cards on a near-white canvas, and the dark theme SHALL keep a near-black slate canvas that is lifted off pure black so that canvas, surface and raised surface are told apart by lightness alone. Primary actions, the focus ring and the current navigation item SHALL use the accent of the current theme.

#### Scenario: Primary button colour
- **WHEN** a primary button renders in the light theme with the default theme
- **THEN** its background is the emerald accent token and its label uses the on-accent text token

#### Scenario: Focus ring
- **WHEN** any interactive control receives keyboard focus
- **THEN** a visible focus ring in the accent colour appears, at least 2 px wide and offset from the control

#### Scenario: Another theme keeps the neutrals
- **WHEN** the theme is `indigo`
- **THEN** primary buttons, the focus ring and the current navigation item are indigo, while cards, canvas, text and borders use the same slate values as with emerald

#### Scenario: Dark surfaces separate by lightness
- **WHEN** a card sits on the dark canvas and a popover opens over the card
- **THEN** canvas, card and popover are three distinct lightness steps of the same hue, each at least 0.04 apart in OKLCH lightness, and the card is still readable with its border removed

### Requirement: Accessible contrast in both themes
Every text token SHALL reach a WCAG 2.2 contrast of at least 4.5:1 against every surface token it is allowed on, in both themes and for every accent theme. Non-text UI tokens (borders of inputs, focus ring, priority and palette solid steps) SHALL reach at least 3:1 against the surfaces they sit on. Text placed on a palette soft step SHALL reach 4.5:1. The contrast check SHALL measure the value the browser renders: a token written as an OKLCH literal or as a mix SHALL be resolved, and a translucent token SHALL be composited over the surface of the pair before the ratio is taken. Derived accent and palette steps SHALL be measured for every accent and every hue, not only the declared values.

#### Scenario: A token change breaks contrast
- **WHEN** a contributor changes the muted text token so that it falls to 4.2:1 on the canvas in dark mode
- **THEN** the contrast check in `make check` fails and names the token pair, theme and measured ratio

#### Scenario: Label chip readability
- **WHEN** a label chip renders with any palette hue's soft background and that hue's text step
- **THEN** the text contrast is at least 4.5:1 in light and in dark

#### Scenario: A new accent theme fails contrast
- **WHEN** a contributor adds or changes an accent theme so that its on-accent label reaches only 3.9:1 on the accent in light mode
- **THEN** the contrast check in `make check` fails and names the accent theme, mode, token pair and measured ratio

#### Scenario: A derived step is measured
- **WHEN** an accent's soft text step is derived by a mix and that mix yields 4.1:1 on the accent's soft surface in dark mode
- **THEN** the contrast check fails naming the accent, the mode, the pair and the measured ratio, even though no value was written by hand

#### Scenario: A translucent border is measured over its surface
- **WHEN** the dark divider token is a translucent white
- **THEN** the check composites it over each surface it is allowed on and measures the result, and a divider that vanishes on the raised surface fails naming that surface

### Requirement: Stored colours render through the palette
Project, label and view colours already stored as hex strings SHALL render using the palette hue nearest to the stored value, for both its solid and soft steps, on every screen that shows them. Rendering SHALL never write an op or change the stored value. A colour picked in the UI SHALL store the chosen hue's canonical solid hex.

#### Scenario: Legacy label colour
- **WHEN** a label stored with colour `#22c55e` is shown as a chip
- **THEN** it renders with the green palette hue's soft background and text step, and its stored colour is still `#22c55e`

#### Scenario: Offline and other devices
- **WHEN** a device without network renders the same label, and another device that has not updated yet renders it too
- **THEN** both show the label without any sync traffic. The updated device uses the palette steps and the older device shows the raw stored hex, with no conflict and no op written.

#### Scenario: Project colour in the calendar and the feed
- **WHEN** a task of a project stored with colour `#3b82f6` appears in the calendar grid and in the activity feed
- **THEN** both show the blue palette hue's solid step for that project, in light and in dark

### Requirement: Bundled typeface without network access
The web app SHALL ship its interface typeface inside the application and SHALL never request fonts from a third-party host. The font SHALL be available offline after the first load. If it fails to load, text SHALL render in the system sans-serif stack, with no invisible text. The bundled font SHALL keep its optical-size axis so that text at the display size uses the typeface's display cut, as long as the font file stays within 120 KB; above that the display cut SHALL ship as a second static instance for the display step only, declared under the same family name.

#### Scenario: First load
- **WHEN** a user opens the app on a fresh browser
- **THEN** the typeface is fetched from the OpenTodo server's own origin and no request goes to any other host

#### Scenario: Offline after install
- **WHEN** the installed app is opened with no network
- **THEN** text renders in the bundled typeface

#### Scenario: Font file missing
- **WHEN** the font file cannot be loaded
- **THEN** text is shown immediately in the system sans-serif font

#### Scenario: Display text uses the display cut
- **WHEN** a page title renders at the display size
- **THEN** the typeface's optical size follows the rendered size automatically, and body text keeps the text cut

### Requirement: Comfortable reading scale
List, control and navigation text rendered by shared UI components and screens SHALL be one token, the list step, 13 px at the default browser size; switching it to 14 px SHALL be a one-line change of that token. Secondary metadata SHALL be 12.5 px. Running text people read rather than scan (notes, comments being written, help articles, the day page's briefing) SHALL use the prose step, 15 px. Text smaller than 12 px SHALL be reserved for keyboard hints inside key badges, section labels and counts, all at the hint step (11.5 px, weight 500). The scale SHALL offer a 14 px header title, a 22 px page title for a task and a settings page, and one display step (28 px) for day page titles and large clocks, with tighter letter-spacing than body text; headings SHALL be weight 600, the display step weight 650, and the two largest steps SHALL carry negative letter-spacing. All text SHALL scale with the browser's font-size setting.

#### Scenario: Browser zoom setting
- **WHEN** the user sets the browser default font size to 20 px
- **THEN** list, prose and metadata text grow proportionally and no layout scrolls horizontally at 360 px wide

#### Scenario: No pixel sizes in screens
- **WHEN** a change uses an 11 px font size in a row chip
- **THEN** the token lint fails naming the file and line

#### Scenario: Display step
- **WHEN** a screen renders a title with the display type utility
- **THEN** it is 28 px at the default browser size, weight 650, with negative letter-spacing, and grows with the browser's font-size setting

#### Scenario: Clocks derive from the display step
- **WHEN** the Focus timer and a display route render their clocks
- **THEN** their size is a multiple of the display or prose step and is the same size as before this change within one pixel

#### Scenario: List text in one token
- **WHEN** the list step token is changed from 13 to 14 px
- **THEN** task rows, the sidebar, buttons and inputs all render at 14 px and nothing else in the stylesheet needs to change

### Requirement: Reduced motion
Interface transitions SHALL use one of three durations: 120 ms for interface feedback, 250 ms for emphasis, and one 400 ms *moment* reserved for the completion sequence, list reflow and overlay entrances; nothing SHALL last longer than 400 ms and no exit SHALL last longer than its entrance. Movement SHALL use an ease-out curve without overshoot (`--ease-spring`) or the calm ease; nothing SHALL bounce. When the system requests reduced motion, the app SHALL replace every movement, scale and height animation with an instant change or an opacity or colour fade of at most 120 ms, and SHALL skip view transitions. Under the no-motion attribute every transition and animation SHALL be instant, colour and opacity included.

#### Scenario: Completing a task with reduced motion
- **WHEN** reduced motion is requested and the user completes a task
- **THEN** the check mark changes state without a scale animation, the row's opacity fades within 120 ms and the rows below take their new places at once

#### Scenario: Nothing longer than a moment
- **WHEN** any sequence in the app is measured
- **THEN** no transition or animation is declared longer than 400 ms and every exit is shorter than or equal to its entrance

#### Scenario: Moment used for a hover
- **WHEN** a change applies the moment duration to a hover or a menu transition
- **THEN** the token lint fails naming the file and line

#### Scenario: Reduced motion skips view transitions
- **WHEN** reduced motion is requested and a reschedule moves three rows to another group
- **THEN** no view transition starts and the list shows its new order at once

### Requirement: Legacy component classes follow the tokens
The legacy button, input and keyboard-hint classes SHALL take their colours, radius and type from the tokens while any screen still uses them. Once no screen uses a legacy class, it SHALL be removed from the stylesheet and a test SHALL fail if it returns. Screens SHALL use the shared button, field and key-badge primitives instead.

#### Scenario: Unmigrated screen after the token change
- **WHEN** a screen still on the allow-list that uses the legacy button and input classes renders
- **THEN** its buttons and inputs use the token colours, radii and focus ring in both themes, and the automated layout check still passes

#### Scenario: Legacy class returns
- **WHEN** a change adds a `btn-primary` class to a screen after the classes were removed
- **THEN** the token lint fails naming the file and line

### Requirement: Design workbench
The repository SHALL include a design workbench that runs locally with one command. It SHALL show the foundations (colours with their resolved values and measured contrast, the tone scale, the border steps, the derived accent steps of every theme, the type scale including the display step, spacing, radii, elevation, and motion including the spring curve and the moment) and SHALL have a story for every shared UI primitive and pattern, in light and dark. It SHALL offer a switch over the shipped interface languages (OpenSpec `localization`). The workbench SHALL be a development tool only and SHALL add nothing to the shipped app or server.

#### Scenario: Contributor opens the workbench
- **WHEN** a contributor runs the workbench command in `web/`
- **THEN** a local site opens listing Foundations and every shared component, each viewable in light and dark and at phone and desktop widths

#### Scenario: Production build untouched
- **WHEN** the production web app is built
- **THEN** no workbench code or dependency is included in the output

#### Scenario: Story in German
- **WHEN** a contributor switches the workbench language to German on the settings-section story at phone width
- **THEN** the story renders with the German catalog and its layout is unchanged except for text length

#### Scenario: Colours story shows what is measured
- **WHEN** a contributor opens the Colours foundation in dark mode
- **THEN** each swatch shows its resolved colour and the measured ratio of every pair it takes part in, and a derived accent step is shown for each of the eight themes

### Requirement: Accessibility gate on stories
CI SHALL run an automated accessibility audit on every workbench story in light and dark. It SHALL fail on any serious or critical violation.

#### Scenario: Button without an accessible name
- **WHEN** a story renders an icon-only button without an accessible name
- **THEN** the UI check fails and names the story, theme and rule

### Requirement: Visual regression gate on stories
CI SHALL capture every workbench story in light and dark at 375 px and 1280 px wide and compare it with committed baselines. It SHALL fail when the difference exceeds a small threshold and report a diff image. Contributors SHALL be able to update baselines with one documented command.

#### Scenario: Unintended visual change
- **WHEN** a change alters the padding of the shared button and baselines were not updated
- **THEN** the UI check fails and attaches the before, after and diff images for each affected story

#### Scenario: Intended visual change
- **WHEN** a contributor intentionally changes a component and runs the baseline update command
- **THEN** the new baselines are written to the repository and the UI check passes

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
Text inputs, text areas, selects, checkboxes and switches SHALL share one visual style, each with a visible label, an optional description, and an error state. The description and error are announced with the field. A binary setting that takes effect immediately SHALL be presented as a switch with switch semantics; a choice that is submitted with a form SHALL be a checkbox. The switch SHALL be a 32 × 18 px track with the accent when on, with a hit area of at least 44 px on touch screens. A select SHALL draw its own chevron in the muted text colour instead of the platform's arrow.

#### Scenario: Error is announced
- **WHEN** a field fails validation
- **THEN** it shows the error text below the field in the danger colour, is marked invalid, and assistive technology reads the error together with the label

#### Scenario: Immediate setting is a switch
- **WHEN** a screen reader user focuses a preference that applies immediately
- **THEN** it is announced as a switch with its on or off state

#### Scenario: Compact switch and select
- **WHEN** the form-controls story is shown at 1280 px in light and in dark
- **THEN** the switch is 32 × 18 px, the select shows the drawn chevron at its right in the muted colour, and the accessibility gate passes

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
Settings content SHALL be built from sections and rows with a fixed anatomy. A section is a flat titled group with a one-line description and rows divided by hairlines; it has no help link of its own in its header and no action in its header. The description SHALL be one sentence of at most 90 characters in English and MAY end with an inline "Learn more" link that opens contextual help at the section's screen id; an option in a choice section SHALL have a label and at most 60 characters of description; anything longer belongs in Help. A row puts a label and its description beside the control from 640 px wide, stacks them below 640 px, shows the current state as a status dot with its word beside the label before any action, and places a primary action as the control of its last row. Keyboard hints live in tooltips, never as paragraphs.

#### Scenario: Row stacks on phones
- **WHEN** a settings row is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

#### Scenario: Two-factor section anatomy
- **WHEN** a user with two-factor off opens Account
- **THEN** the Two-factor row shows an "Off" status dot beside its label and "Set up" as its control, and the section header has no button or help link

#### Scenario: Learn more is part of the line
- **WHEN** the settings-section story is shown at 1280 px with a description and a Learn more link
- **THEN** the link sits at the end of the description line in the metadata size, is reachable with Tab after the heading and before the first control, is announced as "Learn more: <section title>", and the section header has no button

#### Scenario: Literal description in a story
- **WHEN** a story passes a literal 120-character sentence as a settings section's description instead of a copy-table entry
- **THEN** the settings copy lint in `npm test` fails naming the story file and line

### Requirement: Confirmation dialog
The client SHALL offer one shared confirmation dialog, used instead of the browser's native confirm prompt. It SHALL name the action and its consequence, start focus on the safe choice, cancel on Escape and return focus to the control that opened it. A destructive confirmation SHALL NOT close on an outside tap. The client SHALL NOT use the browser's native `confirm()`, `prompt()` or `alert()` anywhere: confirmations use this dialog, and a question that needs an answer (such as the address of a link in a note) uses a small dialog of the app that validates the answer before it is applied.

#### Scenario: Destructive confirmation by keyboard
- **WHEN** a keyboard user triggers a destructive action and the confirmation dialog opens
- **THEN** focus is on Cancel, Escape closes the dialog without acting, and focus returns to the control that opened it

#### Scenario: Outside tap does not confirm or dismiss
- **WHEN** a destructive confirmation is open and the user taps outside it
- **THEN** the dialog stays open and nothing is changed

#### Scenario: Leaving a shared project
- **WHEN** a member chooses Leave in the share dialog
- **THEN** the app's confirmation dialog names the project, and the member leaves only after confirming

#### Scenario: Link address in a note
- **WHEN** a user selects text in a note, presses Mod-k and enters `javascript:alert(1)`
- **THEN** the link dialog says the address must start with `https://`, `http://` or `mailto:` and keeps the text unlinked; a valid address links the selection, which syncs like any note edit (offline it is saved locally and uploaded later)

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

### Requirement: Accent marks interaction
Screens SHALL use the accent tokens for actions, selection, links, focus and the current navigation item, and SHALL NOT use them for completion or status.

#### Scenario: Completed task and primary action
- **WHEN** a completed task's check mark and a primary button are shown on the same screen
- **THEN** the check mark uses the success token and the button uses the accent token, even though both are emerald today

### Requirement: Status and priority colours follow meaning
Screens SHALL use success for completion and positive confirmation, danger for errors and destructive actions, warning for cautions, info for neutral notices, and p1 to p4 for task priority, choosing each by what it means rather than by its current hue.

#### Scenario: Error message
- **WHEN** a form shows a validation error
- **THEN** the message uses the danger text token in light and in dark

### Requirement: Migration keeps the look
While the accent is emerald, moving a screen onto tokens SHALL keep its light and dark look, apart from shade differences to the nearest token: layout, borders, states and emphasis SHALL stay the same.

#### Scenario: No visible regression
- **WHEN** a screen is compared before and after the migration in light and in dark
- **THEN** layout, borders, states and emphasis are unchanged, and any difference is limited to a shade moving to its token value

### Requirement: Page template primitives
The client SHALL offer a page header primitive (title in the page title size, optional meta, up to two actions, an overflow menu, a Help action) and a page body primitive with the three content widths named in `app-shell`. Every view SHALL use them; an automated check SHALL fail when a view under the app folder renders a level-one heading outside the page header primitive.

#### Scenario: Heading outside the template
- **WHEN** a change adds a view with its own `h1`
- **THEN** the design-system check fails naming the file

### Requirement: Tooltip primitive
The client SHALL offer one tooltip that opens on hover after 400 ms and on focus at once, shows a label and an optional shortcut, closes on Escape and blur, is announced as the control's description, and does not open on touch (the accessible name still applies). Icon-only buttons SHALL use it by default. The native `title` attribute SHALL not be used in screens; a lint SHALL fail on it.

#### Scenario: Keyboard user sees the hint
- **WHEN** a keyboard user focuses the notifications button
- **THEN** a tooltip reading "Notifications" appears at once and leaves on blur

#### Scenario: Native title in a screen
- **WHEN** a change adds `title=` to a button under the app folder
- **THEN** the lint fails naming the file and line

### Requirement: Skeleton primitive
The client SHALL offer a skeleton block in the row, line and card shapes, with a subtle shimmer that is still under reduced motion, used wherever local data is awaited.

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and a list is loading
- **THEN** the skeleton rows are static

### Requirement: Three surfaces
Screens SHALL use five surface styles only: row (row radius, no shadow, the hover token as its hover tint), card (card radius, no shadow, a border), overlay (popover radius, the popover surface, the strong edge, the third elevation), column (card radius, sunken fill, no shadow, no border in light, border in dark; for a board column and any other container of cards), and flat section (no fill, no radius, no shadow, separated from its neighbours by vertical space and one hairline; for the secondary sections of a settings page and the panels of a dashboard). Lists and cards SHALL be flat: only overlays carry a shadow. Each style SHALL be one component class in the stylesheet. Raw radius and shadow utilities SHALL not appear in screens; the token lint SHALL fail on them.

#### Scenario: Raw shadow in a screen
- **WHEN** a change uses a raw shadow utility in a screen
- **THEN** the token lint fails naming the file and line

#### Scenario: Column surface by its class
- **WHEN** a screen draws a container of cards with the column class
- **THEN** it has the sunken fill, the card radius and no shadow in light, a border in dark, and the token lint passes

#### Scenario: Hand-made flat section
- **WHEN** a screen separates two sections with a raw border utility instead of the flat section class
- **THEN** the token lint fails naming the file and line

#### Scenario: Overlay on the popover surface
- **WHEN** a menu, popover, tooltip or sheet opens over a list in dark mode
- **THEN** it is drawn on the popover surface with the strong edge and a shadow, while the cards and rows under it have no shadow

### Requirement: Token lint covers the screens
The token lint SHALL cover the app folder as well as the shared UI folder, with a per-file allow-list that may only shrink and reaches zero when this change is complete. Raw palette colours, hex literals, literal colour functions (`rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` with numeric values), raw text sizes, pixel font sizes, raw radii, raw shadows and the legacy component classes SHALL each fail it. A colour mixed from tokens (`color-mix()` over `var(--ot-…)`) passes.

#### Scenario: New raw size
- **WHEN** a change adds `text-xs` to a screen that is not on the allow-list
- **THEN** the token lint fails naming the file and line

#### Scenario: Allow-list only shrinks
- **WHEN** a change adds a file to the allow-list
- **THEN** the lint's self-test fails

#### Scenario: Literal colour function
- **WHEN** a change styles a screen with `rgb(148 163 184 / 0.35)`
- **THEN** the token lint fails naming the file, the line and the value

### Requirement: Core screens in the workbench
The workbench SHALL have stories with fixture data for every core screen of the screen inventory (OpenSpec `web-app` "Interface audit tour"): at least the sidebar, the shell with a list and the panel open, the task row in every state, a task list with groups, the board, the Day, Week, Month and Plan calendars, the timeline, quick add with chips, the page header, the settings page, the Inbox triage, the Labels, Filter, Filters overview, Updates, Completed, Trash, Next, Waiting, Someday and Anytime views, the Ask screen, the task panel with each of its tabs, each in light and dark at 375 and 1280 px, under the same accessibility and visual-regression gates as the primitives. A script SHALL compare the inventory's core screens with the stories and SHALL fail naming every core screen without one; a screen SHALL be marked core in the inventory by its frequency of use (daily or weekly), not by whether a story exists. The stories of the calendars, the timeline, the settings page and the statistics SHALL show the surfaces: a Week with task blocks, an event block, a free event, an unestimated block, a dimmed past day and the now line; a Month with filled rows and a dimmed past week; a Plan row of columns with an event row, a projected row and an over-capacity header; a timeline with a bar across today and a past deadline; a settings page with its primary card and two flat sections; the statistics tiles with a positive, a negative and a "–" comparison above a flat panel.

#### Scenario: Row state missing
- **WHEN** a change adds a new chip to the task row without a story state showing it
- **THEN** the review checklist of the change names the missing state and the visual baseline does not cover it

#### Scenario: Shell baseline
- **WHEN** a change moves the panel by 8 px
- **THEN** the shell story's visual check fails with a diff image

#### Scenario: Core screen without a story
- **WHEN** a change adds a route that the inventory marks as used weekly and adds no story for it
- **THEN** the story-coverage check fails naming the route and the story title it expects

#### Scenario: Rare screen without a story
- **WHEN** the inventory marks the password reset screen as rarely used and it has no story
- **THEN** the story-coverage check reports it as uncovered without failing

#### Scenario: Event style regression
- **WHEN** a change gives event blocks a hue fill
- **THEN** the Week story's visual check fails with a diff image and the review names the "Filled blocks and bars" requirement

### Requirement: Interface budget
Every change that touches a screen SHALL state in its design how it stays within the interface budget: at most two rows of chrome above the first item of a list, at most seven properties with a value shown by default on an empty task, the task page's facts in at most four named groups of at most six rows (unset facts read as quiet actions, never as empty fields), at most six primary sidebar destinations, at most three vertical scroll regions per screen, and every new shortcut registered without conflict. The measurable limits SHALL be enforced by tests.

#### Scenario: A feature adds a banner
- **WHEN** a change renders a banner between the page header and the first task
- **THEN** the budget test fails naming the view

#### Scenario: The facts column grows
- **WHEN** a change adds a seventh row to one of the task page's fact groups
- **THEN** the budget test fails naming the group

### Requirement: Secondary text is one size
Secondary text in screens SHALL be the metadata size only. Every time, count, duration and other number shown in the interface SHALL use tabular figures in the interface face, never a monospace face, so that digits line up and do not shift as they change; prose in notes and comments keeps proportional figures. Two icon sizes SHALL be used in content (16 px in rows, 20 px in headers) and one in chips (12 px).

#### Scenario: Estimate chip
- **WHEN** a row shows "1 h 30"
- **THEN** it is set in the interface face at the metadata size with tabular figures

#### Scenario: Numbers do not shift
- **WHEN** the Focus clock counts from 10:00 to 09:59, and a sidebar count changes from 9 to 10
- **THEN** the digits keep their width and the text around them does not move

#### Scenario: Prose keeps proportional figures
- **WHEN** a comment contains "meet at 3 for 2 hours"
- **THEN** its digits render with proportional spacing like the rest of the sentence

### Requirement: One focus style
Every interactive control in screens SHALL show the token focus ring on keyboard focus and nothing else; a control SHALL not draw its own border or colour change for focus. The accessibility gate SHALL include a focus-visibility check on the core-screen stories.

#### Scenario: Priority chip focus
- **WHEN** a keyboard user focuses a priority option
- **THEN** the token focus ring is shown and the option's border does not change

### Requirement: High-contrast and no-motion presentation
The tokens SHALL offer a high-contrast override (`data-contrast="high"` on the document root) in which surfaces are pure white or pure black, text reaches at least 7:1 on every surface it is allowed on, soft tints are replaced by outlines, and non-text UI reaches at least 3:1; and a no-motion attribute (`data-motion="none"`) that sets every transition and animation duration to zero. Both SHALL combine with any theme mode and accent and SHALL be covered by the contrast check.

#### Scenario: Override in both modes
- **WHEN** the root carries `data-contrast="high"` in light mode and then in dark mode
- **THEN** the canvas is pure white with black text, then pure black with white text, and every allowed text and surface pair measures at least 7:1

#### Scenario: Override pair fails the check
- **WHEN** a contributor changes a high-contrast text token so a pair falls to 6:1
- **THEN** the contrast check in `make check` fails and names the pair, the override and the measured ratio

#### Scenario: No motion
- **WHEN** the root carries `data-motion="none"` and a task is completed
- **THEN** the row changes state with no transition or animation, as under the system's reduced-motion setting

### Requirement: Hooks lint gate
The web app's checks SHALL lint its source for the Rules of Hooks and for effect, memo and callback dependencies, and SHALL fail on any finding. A suppression of either rule SHALL state its reason, and a suppression that no longer suppresses anything SHALL fail the check. The gate is a development check only and adds nothing to the shipped app.

#### Scenario: Missing effect dependency fails the check
- **WHEN** a change adds an effect that reads a prop not listed in its dependencies
- **THEN** the hooks lint fails and names the file, the line and the missing dependency

#### Scenario: Stale suppression fails the check
- **WHEN** a dependency suppression remains on an effect whose dependencies are now complete
- **THEN** the hooks lint fails on the unused suppression

#### Scenario: Justified suppression passes
- **WHEN** a mount-only effect carries a dependency suppression followed by its reason
- **THEN** the hooks lint passes

### Requirement: Hermetic web tests
The web test suite SHALL NOT reach the network: a request a test did not mock SHALL fail that test and name the request. Interaction tests SHALL wait for the condition they assert, with a deadline, rather than for a fixed time, so that a busy machine running tests in parallel only makes them slower, never failing.

#### Scenario: Unmocked request
- **WHEN** a test renders a screen that asks the server for data and the test mocks no request
- **THEN** the test fails with a message naming the method and path of the request

#### Scenario: Busy machine
- **WHEN** the full web suite runs with more parallel workers than processor cores
- **THEN** every test passes as it does on an idle machine

### Requirement: The design system stands alone

The shared building blocks in `web/src/ui`, overlays (dialogs, menus, popovers, toasts) included, SHALL NOT depend on any screen in `web/src/app`, so every primitive can be built, tested and shown in the workbench without the screens. Screens SHALL import shared UI, overlays included, through the `web/src/ui` barrel. The lint run of `make check` SHALL fail when a file under `web/src/ui` imports from `web/src/app`. This is a code-structure rule: it changes nothing a user sees, works the same offline, and has no effect on sync.

#### Scenario: A primitive imports a screen module

- **WHEN** a file under `web/src/ui` imports anything from `web/src/app`
- **THEN** the lint run fails and names the import

#### Scenario: Primitives use overlays from the design system

- **WHEN** the Combobox, ConfirmDialog, AskComposer or PageHeader opens a popover, dialog or menu
- **THEN** it uses the overlay module in `web/src/ui/overlay` and behaves as before on every screen size

### Requirement: Component size limit
The web app's checks SHALL fail when a function in the app's source (a component, hook or helper; tests, stories and test kits excepted) is longer than 250 lines. A function that was already longer when the limit came in SHALL be listed by file with a ceiling and the reason it is long; a listed ceiling SHALL NOT be raised, and the entry SHALL be removed once the function fits the limit. Splitting a screen to meet the limit SHALL NOT change what it shows, what its keys do or what it writes.

#### Scenario: New long component fails the check
- **WHEN** a change adds a component whose function is longer than 250 lines
- **THEN** the web lint fails and names the file, the line and the function's length

#### Scenario: Allow-listed function grows
- **WHEN** a change makes an allow-listed function longer than its listed ceiling
- **THEN** the web lint fails for that function

#### Scenario: Split task list behaves as before
- **WHEN** the task list is split into hooks, pure grouping functions and bodies
- **THEN** its groups, keyboard shortcuts with their read-only checks, drag and drop, tree semantics for assistive technology and per-row re-rendering behave as before, as shown by the existing list tests

### Requirement: Recent picks in a project tree
A picker that shows a tree (projects with their sub-projects) SHALL keep the tree's shape. When the tree has at least 12 entries and the device has recent picks for that picker, it SHALL offer up to five of them first under a "Recent" heading and head the tree below "All". A shorter tree SHALL show each entry once, in tree order, with no "Recent" group.

#### Scenario: Short project list has no duplicates
- **WHEN** a user with four projects, three of them picked before as the import target, opens "Tasks without a project go to"
- **THEN** each project is listed once, in tree order, and there is no "Recent" heading

#### Scenario: Long project list offers recent picks
- **WHEN** a user with fifteen projects, one of them picked before, opens the same picker
- **THEN** that project is listed first under "Recent", and the full tree follows under "All"

### Requirement: Names are announced

Text that stands for a longer phrase (a count read as "3 comments", an icon read as "Has notes", a deadline read with its date, a warning read in place of a title) SHALL reach assistive technology as visually hidden text inside the element, with the abbreviated visible text hidden from it, and SHALL NOT be an `aria-label` or `aria-labelledby` on an element without a role. An element whose name describes a container SHALL have the role the name belongs to. The web lint SHALL refuse `aria-label` and `aria-labelledby` on a `span` or `div` without a role. The hidden text SHALL NOT change layout or widen a scroller. This is presentation only: no data is stored, and it behaves the same offline.

#### Scenario: A count chip

- **WHEN** a row shows a comment chip with "3"
- **THEN** a screen reader reads "3 comments" and the chip carries no `aria-label`

#### Scenario: An icon-only chip

- **WHEN** a task has notes
- **THEN** its row's notes chip is read as "Has notes"

#### Scenario: A name on a span

- **WHEN** a component puts `aria-label` on a `span` without a role
- **THEN** `npm run lint` fails and names the file and line

### Requirement: Icon catalogue
The icons a person can choose for their own things (projects and sections) SHALL come from one catalogue, a curated subset of the app's icon set of at least 300 icons. Each entry SHALL have a stable name (lowercase letters, digits and hyphens), one category, and search keywords. A name, once in a released catalogue, SHALL never be removed or given a different picture; a picture that changes meaning gets a new name. The catalogue SHALL be defined once in the repository; the server SHALL hold an identical list of names, and a test SHALL fail when the two differ.

The icons of the interface itself SHALL be available without loading the catalogue. The rest of the catalogue SHALL load only when a picker opens or when something stored names an icon outside the interface icons, and SHALL work offline once loaded. Until it has loaded, and for any name the device does not know (written by a newer client), the place of the icon SHALL show the fallback of what carries it (a project's colour dot, nothing before a section title), and SHALL never show an error, a broken image or an empty box.

The picker SHALL search as the person types, matching the name, the keywords and the category, with category names in the interface language. It SHALL list results grouped by category, offer "No icon" first, show the current choice as selected, and be fully usable from the keyboard (type to filter, arrows to move, Enter to pick, Esc to close without a change).

#### Scenario: Find an icon by a keyword
- **WHEN** the user opens the icon picker of a project and types "dog"
- **THEN** the results include the paw and dog icons under their category, and Enter on the first result sets it as the project's icon

#### Scenario: Category names in the interface language
- **WHEN** the interface is in Italian and the user types "cibo" in the picker
- **THEN** the icons of the Food category are listed

#### Scenario: Icon from a newer client
- **WHEN** a project carries an icon name that is not in this device's catalogue
- **THEN** the sidebar and the page header show the project's colour dot, and the stored name is kept unchanged

#### Scenario: Catalogue offline
- **WHEN** the catalogue has been loaded once and the device goes offline, then the user opens the icon picker
- **THEN** the picker lists and searches the whole catalogue without a network request

#### Scenario: Server list drifts from the catalogue
- **WHEN** a contributor adds an icon to the catalogue without regenerating the server's list
- **THEN** the test suite fails and names the icon missing on the server side

### Requirement: Illustrations
The client SHALL draw illustrations for empty and finished states in one calm style: inline SVG line drawings built only from the design tokens, with round line caps and joins and no gradients, shadows, text, raster images or external files.
- **Stroke weights:** two, a main line for the object and a fine detail line, with strokes in the muted text colour.
- **Fills:** the surface as the object fill and the sunken surface for ground shapes. At most one accent shape, filled with the theme's accent at low opacity and outlined in the accent text colour.
- **Motif:** every illustration SHALL sit inside the brand mark's open loop, drawn in the fine line with its opening at the upper right, and its accent shape SHALL sit in or leave through that opening.

Each illustration SHALL render correctly in light and dark themes and every colour theme by following the tokens, SHALL be decorative (hidden from assistive technology, the message is in the text beside it), SHALL fit a 160 by 120 px box, SHALL weigh at most 4 KB of markup, SHALL not animate when the user prefers reduced motion, and SHALL be shown as a story in the workbench in both themes. The empty-state pattern SHALL accept an illustration in place of its icon. The first illustration SHALL be Inbox zero: an empty tray with a paper plane leaving through the loop's opening.

#### Scenario: Follows the theme
- **WHEN** the user switches from the light theme to the dark theme and to another colour theme while the Inbox zero state is shown
- **THEN** the illustration's strokes and fill change with the tokens, and no colour stays from the previous theme

#### Scenario: Not read by a screen reader
- **WHEN** a screen reader reaches the Inbox zero state
- **THEN** it reads the heading "Inbox zero: every task has a place." and the action, and nothing for the illustration

#### Scenario: Style gate
- **WHEN** a contributor adds an illustration that uses a hard-coded hex colour or a raster image
- **THEN** the UI lint fails and names the file

#### Scenario: Weights and fills gate
- **WHEN** a contributor draws a line with a third stroke width, fills a shape with the canvas colour, or fills two shapes with the accent
- **THEN** the UI lint fails naming the file and the line

#### Scenario: Objects stand out in the dark theme
- **WHEN** an empty state is shown in the dark theme
- **THEN** the drawing's object is lighter than the canvas behind it, and the accent shape's outline is the bright accent

### Requirement: Tone scale
The four text tokens (strong, default, muted, faint) SHALL be the tone scale: the one way to make text or an icon quieter is to step down one tone. An icon SHALL take the tone of the text it accompanies. Screens and shared components SHALL NOT quiet text or icons with opacity utilities, alpha suffixes on text or border tokens, or a palette grey; the style lint SHALL refuse these, allowing a marked exception only for a dragged ghost, a disabled control and the overlay scrim. Dividers SHALL use the softer border token, container edges the border token and control edges the input border token.

#### Scenario: Quieting a metadata line
- **WHEN** a change wants a row's metadata quieter than its title
- **THEN** it uses the muted or faint tone and the lint passes

#### Scenario: Opacity on text
- **WHEN** a change sets `opacity-60` on a label or `text-default/70` on a count
- **THEN** the style lint in `make check` fails naming the file and line

#### Scenario: Disabled control
- **WHEN** a disabled button lowers its opacity with the documented allow marker
- **THEN** the lint passes and the control is still identifiable as disabled by assistive technology

### Requirement: Derived accent and palette steps
An accent theme SHALL declare only its accent, its bright dark-mode text colour and its on-accent colour; its hover, soft, soft text, focus and chart base steps SHALL be derived from those by fixed mix ratios declared once in the stylesheet. A palette hue SHALL declare one solid value per mode; its soft and text steps SHALL be derived the same way. A derived step MAY be overridden by an explicit value only next to a comment naming the pair it failed, and the number of such overrides SHALL be counted by a test so it cannot grow unnoticed. Neutrals SHALL NOT be derived from the accent.

#### Scenario: Adding a theme
- **WHEN** a contributor adds a `plum` theme by declaring its three values
- **THEN** every accent step exists in both modes, the contrast check measures them all, and no other stylesheet line is needed

#### Scenario: Changing a mix ratio
- **WHEN** the soft-step ratio is changed from 10 to 8 percent
- **THEN** every theme's soft surface changes together and the contrast check measures every theme against the new value

#### Scenario: Override is counted
- **WHEN** a hue's light text step misses 4.5:1 and is replaced by an explicit value with its comment
- **THEN** the test that counts overrides passes with the recorded number, and a second unexplained override fails it

#### Scenario: Neutrals do not follow the accent
- **WHEN** the user switches from the emerald to the violet theme in dark mode
- **THEN** the canvas, surfaces, text tones and borders keep exactly the same values

### Requirement: Moment motion tokens
The tokens SHALL include a spring easing curve (an ease-out that settles without overshoot, defined as a cubic bezier with no animation library) and a moment duration of 400 ms. The moment SHALL be zero under the no-motion attribute and SHALL fall under the reduced-motion rule. The motion foundation SHALL demonstrate both.

#### Scenario: No motion zeroes the moment
- **WHEN** the root carries `data-motion="none"` and an element transitions with the moment duration
- **THEN** it changes instantly

#### Scenario: Spring on a sheet
- **WHEN** a phone sheet opens with the spring curve at the emphasis duration
- **THEN** the sheet reaches its resting place within 250 ms without passing it, and under reduced motion it fades in without moving

### Requirement: Brand mark
OpenTodo SHALL have one brand mark and one wordmark, kept as a single SVG source in the shared UI folder, from which every other brand asset is generated. The mark SHALL be an open loop that closes into a tick, drawn as one continuous stroke on a 24-unit grid with a 2-unit stroke, never a tick inside a square and never a generic checkbox. It SHALL exist in two variants: mono, which draws the whole mark in `currentColor` with the loop's closing segment in the accent colour, for use in the interface; and colour, which draws the mark on a filled rounded square in the brand's dark slate with the stroke in the accent, for icons on other people's surfaces (home screens, browser toolbars, store listings). The wordmark SHALL be the name "OpenTodo" set in the bundled interface typeface and SHALL never appear inside the mark. The mark SHALL stay legible at 16 px and SHALL be rendered by the app at 16, 20, 24 and 32 px only from the SVG; raster files SHALL exist only where a platform requires them (web app manifest, Apple touch icon, extension icons) and SHALL be generated by a script, never edited by hand. The mono mark SHALL meet 3:1 against every surface it is placed on in both themes and the high-contrast override; the colour mark's stroke SHALL meet 3:1 against its own square. The source SVG SHALL be under 2 KB and carry the project's licence note.

#### Scenario: One source, every asset
- **WHEN** the brand script runs after the source SVG changes
- **THEN** the favicon, the 192 and 512 px manifest icons, the maskable icon, the Apple touch icon and the three extension icons are regenerated from it, a test compares each raster against the source and fails when one is stale, and no other brand file exists in the repository

#### Scenario: Legible at 16 px
- **WHEN** the workbench renders the mono mark at 16 px in light and dark
- **THEN** the loop and the tick are both distinguishable in the baseline image, and the accessibility gate reports no contrast failure for the mark against the sidebar, canvas and surface tokens

#### Scenario: Mono follows the text
- **WHEN** the mark is placed in a row whose text tone changes on hover
- **THEN** the mark's stroke changes with the text and only the closing segment stays in the accent

#### Scenario: Colour variant on a home screen
- **WHEN** the app is installed on a phone with a maskable icon
- **THEN** the icon shows the mark on the slate square with the whole loop inside the safe zone, and no part of the stroke is cut by a circular or squircle mask

#### Scenario: Not a checkbox
- **WHEN** the mark is reviewed in the workbench's Brand story beside the row checkbox at the same size
- **THEN** the two are different shapes: the checkbox is a closed ring or a square, the mark is an open loop whose end becomes a tick

### Requirement: Illustration set
The client SHALL provide, in the illustration style, these named illustrations, each inside the open loop with its accent in the opening:

| Name | Object | Accent |
| --- | --- | --- |
| `inbox-zero` | an empty tray | a paper plane |
| `today-clear` | a mug with steam | the sun |
| `week-clear` | a desk calendar with seven open days | a kite |
| `project-new` | an open box with a sprout | the sprout's leaf |
| `day-done` | a closed notebook lying flat with its ribbon | a crescent moon |
| `trash-empty` | a bin with its lid on | a drifting leaf |

The empty Today, the empty Upcoming, a project with no open task, Done for today and the empty Trash SHALL show the matching one above their sentence. Each SHALL follow every rule of "Illustrations": tokens only, two stroke weights, one accent shape, 160 by 120 px, at most 4 KB, decorative, light and dark, every colour theme, and no animation under reduced motion. Each SHALL have a story in the workbench in both themes. A view SHALL name an illustration from this set only; naming an unknown one SHALL fail the type check.

#### Scenario: Empty Today
- **WHEN** Today has no task on any device
- **THEN** the `today-clear` drawing is shown above "Nothing due today." in the muted text colour, with the sun in the theme's accent at low opacity, and a screen reader reads only the sentence and the action

#### Scenario: Every theme
- **WHEN** the user switches to the dark theme and then to the violet colour theme while the empty Trash is shown
- **THEN** the bin's strokes follow the muted text colour and the leaf follows the new accent, with no colour left from before

#### Scenario: Style gate on the set
- **WHEN** a contributor adds a sixth drawing with a gradient or over 4 KB of markup
- **THEN** `make ui-lint` fails naming the file

### Requirement: Toast primitive
The client SHALL show at most one toast at a time, in the toast region (bottom centre on phones, bottom right from 640 px up, clear of the home indicator and the on-screen keyboard); a new toast SHALL replace the previous one. A toast SHALL hold one sentence naming what happened, written as the result ("3 tasks rescheduled", "Moved to Home"), at most two controls, Undo first when the action can be undone, and a close button that dismisses it. It SHALL stay five seconds after one task's action and ten after a batch; after Undo it SHALL show the result ("Undone.") for five seconds and then leave; the timer SHALL pause while the pointer is over the toast or focus is inside it and restart when both leave, and a control that disappears while it has focus SHALL not keep the toast paused. Tab SHALL reach its controls; focus SHALL never move into a toast on its own; `Ctrl`/`⌘`+`Z` outside a text field SHALL activate Undo while the toast shows; Escape with focus inside the toast SHALL dismiss it and return focus to where it was before. The toast SHALL be announced politely to assistive technology. A toast SHALL never cover the element that has focus: while a toast is shown, the content column SHALL keep the focused element above the toast's height, and from 640 px up, when the region would overlap the focused element, the toast SHALL move to the opposite corner. Under reduced motion a toast SHALL only fade. Toasts are device interface state and write nothing.

#### Scenario: Pause on hover
- **WHEN** a batch toast has shown for eight seconds and the user moves the pointer onto it and reads for ten seconds
- **THEN** the toast stays, and leaves two seconds after the pointer leaves

#### Scenario: Focused row stays visible
- **WHEN** the user completes the last row of a long list on a phone and a toast appears
- **THEN** the next row, now focused, is fully visible above the toast, and the list scrolls only as far as that needs

#### Scenario: Replacement
- **WHEN** the user completes one task and two seconds later deletes another
- **THEN** one toast reads "Deleted · Undo", the completion's offer is gone, and `Ctrl+Z` undoes the deletion

#### Scenario: Keyboard
- **WHEN** a toast with Undo and Open is shown and the user presses Tab
- **THEN** focus moves to Undo, Tab again moves to Open, Enter activates the focused control, and the toast did not take focus by itself

#### Scenario: Reduced motion
- **WHEN** the system prefers reduced motion and a toast appears and leaves
- **THEN** it only fades in and out, with no movement

#### Scenario: The result of Undo leaves
- **WHEN** the user completes a task, clicks Undo in the toast and moves the pointer away
- **THEN** the toast reads "Undone." and leaves five seconds later

#### Scenario: Dismiss
- **WHEN** a toast is shown and the user activates its close button, or tabs into it and presses Escape
- **THEN** the toast leaves at once, and after Escape focus is back on the element that had it before

### Requirement: Motion sequences in the workbench
The workbench SHALL have a Foundations motion story set showing the completion sequence on a row and on a card, the repeating-task completion, a list reflow and each overlay entrance, each playable with a control, in both themes. An automated check in the interface check SHALL open these stories with reduced motion emulated and fail if any running animation changes `transform`, `height`, `width` or `translate`, and SHALL open them with the no-motion attribute and fail if any animation runs at all.

#### Scenario: A movement sneaks past reduced motion
- **WHEN** a contributor adds a 200 ms slide to a toast without a reduced-motion rule and runs the interface check
- **THEN** the check fails naming the story and the animated property

#### Scenario: Stories render in both themes
- **WHEN** the motion stories are opened in light and in dark
- **THEN** every sequence plays and the accessibility gate passes on each story

### Requirement: Screen inventory
The repository SHALL keep one machine-readable inventory of the web app's screens: every route of the router, every settings section, the overlays reachable from each screen (dialogs, sheets, popovers, the task panel and its tabs), the display routes, the signed-out screens, the capture screen, the start guide, the command palette and the sequence spotlight. Each entry SHALL name the seed state it needs, its frequency of daily use (daily, weekly or rare), whether it is a core screen, and the name it has in the automated layout check or the reason it is not in it. A test SHALL fail when a router view is missing from the inventory, when an entry names a layout-check screen that does not exist, or when a core entry has no frequency.

#### Scenario: New route without an inventory entry
- **WHEN** a change adds a `view` to the router and no inventory entry names it
- **THEN** the inventory test fails naming the view

#### Scenario: Entry outside the layout check
- **WHEN** an inventory entry is not in the layout check's list and gives a reason
- **THEN** the inventory test passes and the audit tour still opens the entry

#### Scenario: Stale layout-check name
- **WHEN** an inventory entry names a layout-check screen that was renamed
- **THEN** the inventory test fails naming the entry and the missing screen

### Requirement: Audited interface rules
Every screen of the web app SHALL satisfy, at 360, 768 and 1280 px wide, in light and dark, in every shipped interface language: no horizontal scrolling outside designated regions; every interactive control at least 24 × 24 CSS px with a fine pointer (inline links in running text and controls whose spacing to every neighbour is at least 24 px excepted) and at least 44 × 44 px on a touch screen; the token focus ring visible on every focusable element when it receives keyboard focus; truncated text carrying its full text in an accessible name, a tooltip or a nearby element; no two visible interactive controls overlapping by more than 4 px; a cumulative layout shift of at most 0.1 from navigation to idle; and, when reduced motion is requested, no running animation or transition that moves or scales an element. The audit tour SHALL measure each rule and report every violation with the screen, width, theme, language and element.

#### Scenario: German label overflows
- **WHEN** a settings row's German label makes the row wider than a 360 px viewport while the English one fits
- **THEN** the audit reports a horizontal-overflow violation naming the screen, the language and the element

#### Scenario: Small control with a fine pointer
- **WHEN** a screen at 1280 px has a 20 × 20 px button with another control 8 px beside it
- **THEN** the audit reports a target-size violation for that button

#### Scenario: Focus without a ring
- **WHEN** a focusable element on a screen shows no visible change when it receives keyboard focus
- **THEN** the audit reports a focus-visibility violation naming the element

#### Scenario: Truncated title without its full text
- **WHEN** a project name is cut with an ellipsis and neither its accessible name, a tooltip nor a nearby element carries the full name
- **THEN** the audit reports a truncation violation

#### Scenario: Movement under reduced motion
- **WHEN** reduced motion is requested and completing a task still slides the row
- **THEN** the audit reports a reduced-motion violation naming the screen and the animated element

### Requirement: Focus visibility in the accessibility gate
The accessibility gate on stories SHALL, for every core-screen story, move keyboard focus through every focusable element and SHALL fail when an element receives focus without the token focus ring becoming visible, naming the story, the theme and the element.

#### Scenario: Control with its own focus style
- **WHEN** a core-screen story contains a control that removes the outline on focus and draws nothing else
- **THEN** the UI check fails naming the story, the theme and the control

#### Scenario: Every control shows the ring
- **WHEN** every focusable element of the core-screen stories shows the token focus ring on keyboard focus
- **THEN** the focus-visibility pass reports no failure

### Requirement: Filled blocks and bars
A calendar block, a month or plan row and a timeline bar that stand for a task SHALL be drawn with the soft step of the task's project hue as fill, the solid step as a 3 px edge on the leading side, and the strong text tone; the edge SHALL meet 3:1 against the grid or page it sits on and the text SHALL meet 4.5:1 against the fill in both themes, checked by the token contrast test for every palette hue. Blocks that stand for something the user cannot act on in the view (a subscribed event, a projected occurrence) SHALL NOT use a hue fill; a projected occurrence keeps its dashed outline and an event uses the sunken fill with a hatched edge. A filled block on a day before today SHALL be dimmed to the faint tone with its fill mixed toward the surface, so the past is quieter than the present.

#### Scenario: Every hue passes
- **WHEN** the token contrast test runs
- **THEN** for each of the twelve palette hues the solid step measures at least 3:1 against the canvas and the surface, and the strong text at least 4.5:1 against the soft step, in light and in dark

#### Scenario: Dimmed past keeps contrast
- **WHEN** a block is dimmed as past
- **THEN** its title still measures at least 4.5:1 against its lightened fill, checked by the same test with the faint tone

### Requirement: Pointer on clickable elements
With a mouse or trackpad, every element that does something when clicked SHALL show the pointing-hand cursor: enabled buttons, elements with the button, menu item, tab or option role, disclosure summaries, labels of controls, links and task rows. The rule SHALL be one base style at zero specificity, so a component can still choose another cursor that means something (grab for a draggable block, text for an editable field, not-allowed for a disabled control, progress while busy). A disabled control SHALL NOT show the hand. The interface lint SHALL fail on a component that sets the default or auto cursor without a written reason on that line or the line above.

#### Scenario: A button shows the hand
- **WHEN** the pointer rests on an enabled button, a menu item, a sidebar entry or a tab
- **THEN** the cursor is the pointing hand

#### Scenario: A task row shows the hand
- **WHEN** the pointer rests on the empty area of a task row in a list
- **THEN** the cursor is the pointing hand, and a click there opens the task

#### Scenario: Disabled and draggable keep their own cursor
- **WHEN** the pointer rests on a disabled button, or on a calendar block that can be dragged
- **THEN** the cursor is not-allowed on the button and the grab hand on the block

#### Scenario: Default cursor without a reason
- **WHEN** a change adds `cursor-default` to a button in `web/src` without a reason on that line
- **THEN** the interface lint fails naming the file and line

### Requirement: Precision surface tokens
The tokens SHALL include, in light, dark and high contrast, a popover surface (menus, popovers, tooltips, sheets, the palette), a hover tint (rows, navigation and buttons), a selected surface (the selected navigation item, an active tab or tool), a selected-row surface, and a strong hairline (popover and selected-card edges). Every text tone SHALL meet 4.5:1 on the popover, hover and selected-row surfaces; on the selected surface the strong, default and muted tones SHALL meet 4.5:1 and the faint tone SHALL NOT be used. The neutrals SHALL be a flat cool slate, darker in dark mode than the content surface they hold, and SHALL NOT be derived from the accent. Control edges SHALL keep the input border token, which meets 3:1.

#### Scenario: Pairs are measured
- **WHEN** the token contrast test runs
- **THEN** it measures every text tone on the popover, hover and selected-row surfaces and the strong, default and muted tones on the selected surface, in light, dark and high contrast, and fails naming the pair when one is under its minimum

#### Scenario: Faint text on the selected item
- **WHEN** a change shows a count in the faint tone on the selected navigation item
- **THEN** the change is out of the design system: the active item's count uses the muted tone

#### Scenario: Neutrals ignore the accent
- **WHEN** the user switches the accent theme from emerald to violet in dark mode
- **THEN** the canvas, the content surface, the popover, hover, selected and selected-row surfaces and the strong hairline keep exactly the same values

### Requirement: Status dot
The design system SHALL offer a status dot: a small round dot in one of five tones (ok, warning, danger, busy, off) followed by a word that states the status, so the meaning never rests on colour alone. The dot SHALL be hidden from assistive technology and the word SHALL be read. A busy dot MAY pulse, and SHALL NOT move when reduced motion is requested. State such as on or off, working or failing, configured or not SHALL use a status dot; a category such as a role or a token scope SHALL keep a badge.

#### Scenario: Read as a word
- **WHEN** a screen reader reaches a webhook whose last delivery failed
- **THEN** it reads "Failing" and nothing for the dot

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and a backup is running
- **THEN** the busy dot is shown without the pulse

#### Scenario: Story in both themes
- **WHEN** the status-dot story is shown in light and in dark
- **THEN** each of the five tones shows its dot and word, and every word meets the text contrast minimum

### Requirement: Grey selection, accent for state
A row or item the user is on (the keyboard cursor, the selected row, the current item of a list such as the workspace list, a time list or the sidebar's footer buttons) SHALL use the selected-row surface for rows and the selected surface with the strong text tone for items, never the accent tint; the selection bar above a list SHALL use the selected surface. The accent tint SHALL be kept for state: a bulk tick, a bordered choice card showing the value the user picked, a highlighted linked comment, done and now. A page header that introduces a step (as in the weekly review) SHALL NOT be tinted. A heading that receives focus from code so a screen reader announces it, and that is not a Tab stop, SHALL NOT draw a focus ring.

#### Scenario: Selected row in the Trash
- **WHEN** the user moves the cursor to an item in the Trash, in light or dark
- **THEN** the row uses the selected-row surface, the same as a selected task row, and no green tint

#### Scenario: Selection bar
- **WHEN** three tasks are ticked
- **THEN** "3 selected · Actions · Clear" sits on the grey selected surface with no accent border, and the ticked rows keep their accent tint

#### Scenario: Weekly review step
- **WHEN** the weekly review moves to a new step
- **THEN** its header has no tint, its icon sits on the raised surface in the muted tone, the step title receives focus for a screen reader, and no focus ring is drawn around it

### Requirement: Breakpoints follow the text size
Every layout decision a script makes from the viewport width (phone or desktop header, drawer or sidebar, the task split, two-column settings, toast and overlay placement) SHALL use the same rem breakpoints as the stylesheet (40, 48 and 64 rem), so a browser text size other than the default moves script and stylesheet breakpoints together. The stylesheet's own media queries and the breakpoints written into class names SHALL be in rem as well. At a browser text size of 20 and 24 px, at 360 and 1280 px wide, the screens SHALL show no content running off the screen, no control squeezed below a readable width and no overlapping controls caused by the text size: where a row cannot hold its parts, the parts SHALL wrap (a field to its own line, a badge under a name, a mode switch to a second line) rather than shrink. This holds for the screens of `precision-polish` and for Settings in every section, Statistics, Focus, the Loop home, the task page, the command palette and quick add, the dialogs and menus, sign-in and display mode. At the default text size of 16 px the layout SHALL be unchanged. A control whose label would push a page title off a phone at a large text size MAY keep only its icon below 21 rem of viewport, keeping its accessible name; this includes the phone header's Process with its count.

#### Scenario: Large text between 768 and 960 px
- **WHEN** the browser's text size is 20 px and the window is 900 px wide
- **THEN** the app uses the phone layout with the drawer, as the stylesheet does, and the sidebar is reachable from the menu button

#### Scenario: Large text on a 1100 px window
- **WHEN** the browser's text size is 20 px and the Inbox is opened in a 1100 px window
- **THEN** selecting a task opens its page instead of docking it beside the list, because the detail pane is not shown below 64 rem

#### Scenario: Process on a phone with large text
- **WHEN** the Inbox is opened at 360 px with the browser's text size at 24 px
- **THEN** the Process button shows its icon only, its accessible name is still "Process", and the page title "Inbox" is readable beside it

#### Scenario: Date picker on a phone with large text
- **WHEN** the When popover is opened at 360 px with the browser's text size at 24 px
- **THEN** all seven weekday columns of the month grid are on screen, each day still a 44 px touch target

#### Scenario: Share dialog with large text
- **WHEN** the Share dialog is opened at 360 px with the browser's text size at 24 px
- **THEN** the email field takes its own line and the role and Share sit under it

#### Scenario: Statistics with large text
- **WHEN** Statistics is opened at 360 px with the browser's text size at 20 px
- **THEN** the tiles are one column, and at the default text size they stay two columns
