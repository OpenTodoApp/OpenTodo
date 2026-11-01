## ADDED Requirements

### Requirement: Themes on the Branding card
Settings → Server → Branding SHALL let the owner choose the instance's default light and dark theme with a preview, and manage the instance themes (add from a theme file, offer a copy of one of the owner's custom themes, remove), see `themes` "Instance default theme" and "Instance themes". The card SHALL show the contrast warnings of a theme as the theme editor does and SHALL ask the owner to confirm before making a theme with warnings the default. Like the rest of Branding, it is server state, unavailable offline, showing the last values read-only.

#### Scenario: Default with warnings
- **WHEN** the owner chooses an instance theme with three failing contrast pairs as the default light theme
- **THEN** the card lists the three pairs and asks for confirmation, and only on confirming is the default set

#### Scenario: Offline owner
- **WHEN** the owner opens Branding while offline
- **THEN** the default theme and the instance themes are shown read-only with the last values read
