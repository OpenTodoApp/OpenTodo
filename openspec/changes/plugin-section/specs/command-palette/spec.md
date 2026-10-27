# Spec Delta

## ADDED Requirements

### Requirement: Commands from plugins
The commands contributed by a built-in plugin (capability `plugins`) SHALL be listed with the registry's own commands while the plugin is enabled for the account, with the same entry shape, matching and keyboard behaviour, and SHALL be absent once the plugin is turned off, on every device after the change syncs. Plugin commands SHALL carry no default keyboard shortcut.

#### Scenario: Commands of an enabled plugin
- **WHEN** the palette is opened on an account with the plugin enabled
- **THEN** the plugin's commands appear in the command list, findable by their labels

#### Scenario: Command of a disabled plugin
- **WHEN** the plugin has been turned off in Settings → Plugins and the change has synced
- **THEN** its commands are missing from the palette while every other command is unchanged
