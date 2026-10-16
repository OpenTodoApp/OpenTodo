# Spec Delta

## ADDED Requirements

### Requirement: Favourites preference
Each user SHALL have a synced, ordered list of favourites, each an entry naming a kind (project, label or saved filter) and an id, stored and synced like the promoted destinations as an additive preference; the default is empty. A client SHALL ignore entries of an unknown kind or whose item is missing, archived or deleted, and keep the stored value unchanged. A saved filter whose own pinned flag is set SHALL be treated as a favourite even when the list does not name it, after the listed entries.

#### Scenario: Pin on two devices
- **WHEN** the user pins a project on a laptop
- **THEN** the project is in Favourites there at once and on the user's phone after sync, in the same position

#### Scenario: Unknown kind from a newer device
- **WHEN** a device receives a favourites list containing an entry of a kind it does not know
- **THEN** it shows the entries it knows, keeps the stored value unchanged, and a later write from this device preserves the unknown entry

#### Scenario: Filter pinned on an older device
- **WHEN** an older device sets a saved filter's pinned flag without writing the favourites list
- **THEN** devices with this change list the filter in Favourites after the listed entries, and unpinning it on a new device clears the flag and removes it from the list

#### Scenario: Concurrent pins converge
- **WHEN** two devices pin different projects while offline and then sync
- **THEN** both devices show the same Favourites group, the later write's order winning for the list and no project duplicated
