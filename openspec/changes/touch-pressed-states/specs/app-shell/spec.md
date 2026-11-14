# Spec Delta

## ADDED Requirements

### Requirement: Tab height on a touch screen
The tab bar's tabs SHALL be 56 px tall with a touch screen as the main pointer, as with a mouse, so the bar fills the 56 px the shell reserves for it under the content and the add button keeps its distance from it. The rule that gives every button on a touch screen a 44 px minimum SHALL NOT make a tab shorter than that. While the bar is minimised a tab SHALL be at least 44 px tall on a touch screen. The cold-start skeleton's tab bar SHALL have the same height as the real one. The layout check SHALL fail on any screen whose tab bar, not minimised, has a tab under 48 px tall. This is presentation only and the same offline.

#### Scenario: The tab bar on a phone
- **WHEN** the Inbox is open at 360 px on a touch screen
- **THEN** each of the four tabs is 56 px tall and the bar's top edge is where the content's reserved room ends

#### Scenario: The skeleton does not move
- **WHEN** the app starts cold on a phone that was signed in
- **THEN** the skeleton's tab bar is as tall as the tab bar that replaces it

#### Scenario: A short tab fails the check
- **WHEN** a tab of the tab bar is 44 px tall on a screen of the layout check
- **THEN** the check fails naming the screen and the tab
