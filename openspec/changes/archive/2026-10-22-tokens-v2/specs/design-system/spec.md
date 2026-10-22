## MODIFIED Requirements

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
Body text rendered by shared UI components and screens SHALL be 15 px, and their secondary metadata SHALL be 13 px. Text smaller than 12 px SHALL be reserved for keyboard hints inside key badges. The scale SHALL offer one display step above the first heading (28 px) for page titles and large clocks, with tighter letter-spacing than body text; headings and the display step SHALL be weight 600 and the two largest headings SHALL carry negative letter-spacing. All text SHALL scale with the browser's font-size setting.

#### Scenario: Browser zoom setting
- **WHEN** the user sets the browser default font size to 20 px
- **THEN** body and metadata text grow proportionally and no layout scrolls horizontally at 360 px wide

#### Scenario: No pixel sizes in screens
- **WHEN** a change uses an 11 px font size in a row chip
- **THEN** the token lint fails naming the file and line

#### Scenario: Display step
- **WHEN** a screen renders a title with the display type utility
- **THEN** it is 28 px at the default browser size, weight 600, with negative letter-spacing, and grows with the browser's font-size setting

#### Scenario: Clocks derive from the display step
- **WHEN** the Focus timer and a display route render their clocks
- **THEN** their size is a multiple of the display step and is the same size as before this change within one pixel

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

### Requirement: Reduced motion
Ordinary interface transitions SHALL last no more than 250 ms. One longer duration, the moment token of 400 ms, SHALL be reserved for the completion sequence and SHALL never be used for navigation, hover, focus or layout transitions. When the system requests reduced motion, the app SHALL replace movement and scaling animations, including the moment, with instant changes or opacity fades of at most 250 ms.

#### Scenario: Completing a task with reduced motion
- **WHEN** reduced motion is requested and the user completes a task
- **THEN** the task changes state without a movement or scale animation

#### Scenario: Moment used for a hover
- **WHEN** a change applies the moment duration to a hover or a menu transition
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

## ADDED Requirements

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
The tokens SHALL include a spring easing curve (an ease-out with a light overshoot that settles, defined as a cubic bezier with no animation library) and a moment duration of 400 ms. The moment SHALL be zero under the no-motion attribute and SHALL fall under the reduced-motion rule. The motion foundation SHALL demonstrate both.

#### Scenario: No motion zeroes the moment
- **WHEN** the root carries `data-motion="none"` and an element transitions with the moment duration
- **THEN** it changes instantly

#### Scenario: Spring on a sheet
- **WHEN** a later change opens a sheet with the spring curve at the emphasis duration
- **THEN** the sheet overshoots its resting place by a few pixels and settles within 250 ms, and under reduced motion it fades in without moving
