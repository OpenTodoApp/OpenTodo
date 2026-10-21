# Spec Delta

## ADDED Requirements

### Requirement: Card tiers
Each Settings page SHALL have at most one primary card and any number of flat sections. The primary card is the state-first card the page is about and SHALL be drawn as the card surface: raised fill, card radius, first elevation, border in dark. Every other section SHALL be drawn flat: heading, line and rows on the page surface, separated from the next section by vertical space and one hairline, with no border and no shadow. The anatomy of a section (heading, one line, rows, Learn more) and of a row SHALL be the same in both tiers, and the settings anatomy test SHALL accept both. The primary card per page SHALL be: Account the session card (sign-out and other devices), with How you work primary in the account's first group when it is shown above it; the security rows' two-factor card; Appearance the theme card; General the start view card; Notifications the push card for this device; Capture the quick add card; About the version card; Integrations the API tokens card; Data the export card; People the users card; Server the backups card. A page with no card that has state SHALL have no primary card.

#### Scenario: Account page tiers
- **WHEN** a user opens `/settings/account` on a 1200 px wide screen in light and in dark
- **THEN** the session card is drawn as a raised card with the first elevation, the profile, password, passkeys and linked accounts sections are flat with a hairline between them, and every row keeps its label, line, badge and control as before

#### Scenario: Phone tiers
- **WHEN** the same page is opened on a 390 px wide screen
- **THEN** the primary card and the flat sections stack in the same order, controls sit under their labels, and the page has no horizontal scroll

#### Scenario: Anatomy unchanged
- **WHEN** the settings anatomy test runs over every panel
- **THEN** each section, primary or flat, has one heading, one line of at most 90 characters, rows with label and control, and at most one Learn more link

#### Scenario: Only one primary card
- **WHEN** a change marks a second card on the Server page as primary
- **THEN** the settings anatomy test fails naming the page and both cards
