# Spec Delta

## ADDED Requirements

### Requirement: The web app follows the system text size
A shell SHALL let the web app follow the system text size and SHALL NOT scale the page's text a second time. The Android shell SHALL give the page the system font scale as `opentodoShell.textScale` and SHALL keep its web view's own text zoom on each page until that page calls `textScaleApplied`, then set it to 100 %, so a web app that predates this keeps the system text size; a change of the font scale SHALL reach the page when the app is next shown. The iOS shell SHALL leave Dynamic Type to WebKit, whose system body font follows it, and the page SHALL read it from there. An older shell without `textScale` SHALL leave the page at the browser's text size.

#### Scenario: Android at a large font scale
- **WHEN** the Android system font scale is 150 % and the app's text size is Default
- **THEN** the page receives `textScale` 1.5 and lays out at 150 % with its rows reflowed, and text is not enlarged a second time by the web view

#### Scenario: A browser tab
- **WHEN** the web app runs outside a shell
- **THEN** there is no system scale and Default is the browser's own text size
