# Spec Delta

## MODIFIED Requirements

### Requirement: Three surfaces
Screens SHALL use five surface styles only: row (control radius, no shadow, hover tint), card (card radius, first elevation, border in dark), overlay (card radius, third elevation, border in dark), column (card radius, sunken fill, no shadow, no border in light, border in dark; for a board column and any other container of cards), and flat section (no fill, no radius, no shadow, separated from its neighbours by vertical space and one hairline; for the secondary sections of a settings page and the panels of a dashboard). Each style SHALL be one component class in the stylesheet. Raw radius and shadow utilities SHALL not appear in screens; the token lint SHALL fail on them.

#### Scenario: Raw shadow in a screen
- **WHEN** a change uses a raw shadow utility in a screen
- **THEN** the token lint fails naming the file and line

#### Scenario: Column surface by its class
- **WHEN** a screen draws a container of cards with the column class
- **THEN** it has the sunken fill, the card radius and no shadow in light, a border in dark, and the token lint passes

#### Scenario: Hand-made flat section
- **WHEN** a screen separates two sections with a raw border utility instead of the flat section class
- **THEN** the token lint fails naming the file and line

## ADDED Requirements

### Requirement: Filled blocks and bars
A calendar block, a month or plan row and a timeline bar that stand for a task SHALL be drawn with the soft step of the task's project hue as fill, the solid step as a 3 px edge on the leading side, and the strong text tone; the edge SHALL meet 3:1 against the grid or page it sits on and the text SHALL meet 4.5:1 against the fill in both themes, checked by the token contrast test for every palette hue. Blocks that stand for something the user cannot act on in the view (a subscribed event, a projected occurrence) SHALL NOT use a hue fill; a projected occurrence keeps its dashed outline and an event uses the sunken fill with a hatched edge. A filled block on a day before today SHALL be dimmed to the faint tone with its fill mixed toward the surface, so the past is quieter than the present.

#### Scenario: Every hue passes
- **WHEN** the token contrast test runs
- **THEN** for each of the twelve palette hues the solid step measures at least 3:1 against the canvas and the surface, and the strong text at least 4.5:1 against the soft step, in light and in dark

#### Scenario: Dimmed past keeps contrast
- **WHEN** a block is dimmed as past
- **THEN** its title still measures at least 4.5:1 against its lightened fill, checked by the same test with the faint tone

### Requirement: Surface stories in the workbench
Beside the core screens, the workbench SHALL have stories, in light and dark at 375 and 1280 px under the accessibility and visual-regression gates, that show: a Week with task blocks, an event block, a free event, an unestimated block, a dimmed past day and the now line; a Month with filled rows and a dimmed past week; a Plan row of columns with an event row, a projected row and an over-capacity header; a timeline with a bar across today and a past deadline; a settings page with its primary card and two flat sections; the statistics tiles with a positive, a negative and a "–" comparison above a flat panel.

#### Scenario: Event style regression
- **WHEN** a change gives event blocks a hue fill
- **THEN** the Week story's visual check fails with a diff image and the review names the "Filled blocks and bars" requirement
