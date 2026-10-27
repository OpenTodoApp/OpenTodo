# Spec Delta

## ADDED Requirements

### Requirement: Built-in plugin manifest
Each built-in plugin SHALL be a source folder under `web/src/plugins/` whose exported manifest carries a kebab-case `id`, a translated name, a one-line translated description, an optional icon from the shared icon catalogue and optional commands (a kebab-case id, a translated label, an optional icon, optional extra search words and a `run` action). Plugins SHALL be registered by static import in one registry module; the app SHALL NOT load plugin code at runtime from the network or from storage. An automated check SHALL fail when a plugin folder's manifest is missing or invalid, when two plugins share an id, when a manifest carries an unknown field, or when two commands of one plugin share an id.

#### Scenario: A plugin folder without a manifest
- **WHEN** a folder under `web/src/plugins` exports no manifest that the registry lists
- **THEN** the test suite fails naming the folder

#### Scenario: Duplicate or invalid ids
- **WHEN** two plugin manifests use the same id, or a manifest id is not kebab-case
- **THEN** the test suite fails naming the id

#### Scenario: Nothing is loaded at runtime
- **WHEN** the app runs
- **THEN** every plugin's code came from the compiled bundle and no request fetches plugin code

### Requirement: The Plugins settings section
Settings SHALL have a Plugins section at `/settings/plugins`, in the App group between Capture and About, listing every registered plugin with its name, its one-line description and an enable switch, and a note that built-in plugins are part of the app. The section SHALL be visible to every signed-in role, SHALL require no server round trip to open, and SHALL show each switch from the account's stored state.

#### Scenario: Opening the section
- **WHEN** a signed-in user opens `/settings/plugins` directly or reloads it
- **THEN** every registered plugin is listed with a switch, on except the ones this account has turned off

#### Scenario: Turning a plugin off
- **WHEN** the user turns a plugin's switch off
- **THEN** the account's disabled-plugin list is written through the operation log, the switch shows off, and the plugin's commands leave the command palette

#### Scenario: Offline
- **WHEN** the section is opened without a network connection
- **THEN** it opens with the stored switches, and a toggle made offline is applied on the next sync like every other preference

### Requirement: Enable and disable state
Each user SHALL have an additive `disabled_plugins` field on their `user_prefs` row: a comma-separated list of the plugin ids this account has turned off. An empty or absent field means every plugin is enabled. An id this build does not ship SHALL be ignored on read without rewriting the stored value, and SHALL survive a toggle made on the same device, so the list converges by last-writer-wins like every other synced preference and a plugin from a newer build stays harmless.

#### Scenario: The default
- **WHEN** the field is empty or absent
- **THEN** every registered plugin is enabled and no plugin state is written

#### Scenario: An id from a newer build
- **WHEN** the stored list contains an id this build does not ship
- **THEN** the app shows only its own plugins, no error appears, and the unknown id stays in the stored list after another plugin is toggled

#### Scenario: Two devices
- **WHEN** one device turns a plugin off and another device syncs
- **THEN** the second device shows the plugin as off and its commands are gone from its palette

### Requirement: Commands from enabled plugins
The command palette SHALL list the commands of every enabled plugin among its own commands, with the same entry shape, matching and keyboard behaviour, and SHALL NOT list the commands of a plugin the account has turned off. Disabling or enabling SHALL take effect on the next render without a reload.

#### Scenario: A disabled plugin's command
- **WHEN** a user who turned a plugin off searches for its command's label
- **THEN** the command is not offered and every other command still is

#### Scenario: Turning the plugin back on
- **WHEN** the user turns the plugin on again
- **THEN** its commands are listed again without a reload
