## ADDED Requirements

### Requirement: Task title weight
A theme document MAY carry a top-level `titleWeight` of 400, 500, 600 or 700: how heavy the title of a task is in every task row, on every card and in Today. Without the key, or with 400, titles SHALL keep the weight of list text. The app and the server SHALL refuse a document whose `titleWeight` is anything else, with the same code, and the shared example documents SHALL cover an accepted and a refused value. The weight SHALL be applied with the theme, before the first paint from the device's cache like the theme's other type values, SHALL stay applied under high contrast, and SHALL be written into the page only as one of those numbers. The key SHALL be in the format's JSON Schema and in a theme template, commented out with 400 while the theme does not set it. The format version SHALL stay 1: an app or server from before this key keeps and ignores it like any unknown top-level key. A theme's weight is part of its document, so it works offline and converges as the theme does.

#### Scenario: Semibold titles
- **WHEN** the chosen theme carries `"titleWeight": 600`
- **THEN** every task title in lists, on cards and in Today is semibold, and dates, projects and labels keep their weight

#### Scenario: No key
- **WHEN** the chosen theme has no `titleWeight`
- **THEN** titles look as they did before

#### Scenario: A value outside the list
- **WHEN** a document carries `"titleWeight": 650` or `"titleWeight": "bold"`
- **THEN** the app and the server refuse it as invalid and nothing is applied

#### Scenario: An older app
- **WHEN** an app from before this key receives a theme with `"titleWeight": 600`
- **THEN** it applies the theme with regular titles, and the key is still in the document when it exports or syncs it

#### Scenario: Offline and first paint
- **WHEN** the device is offline and the app is opened with a semibold theme chosen
- **THEN** titles are semibold in the first frame, and nothing is requested
