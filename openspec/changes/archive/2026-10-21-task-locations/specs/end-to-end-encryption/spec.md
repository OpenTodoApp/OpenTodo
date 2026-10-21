## ADDED Requirements

### Requirement: Encrypted locations and places
For an encrypted account the device SHALL encrypt a task's `location` as one whole value (the object serialised, then encrypted into one ciphertext string), and a place's `name`, `address` and coordinate pair, before they leave the device; a place's `position`, `created_at` and `deleted_at` SHALL stay plaintext. The server SHALL accept the ciphertext string wherever it accepts the object and serve it unchanged. Address search and reverse search SHALL run from the unlocked device through the server's map proxy, so only the typed search text or the picked point reaches the provider, never a stored location. In shared projects locations SHALL stay plaintext like every other field.

#### Scenario: Location is one ciphertext
- **WHEN** an encrypted account sets a task's location to "Mum's, Via Roma 1, Torino" with coordinates
- **THEN** the `location` operation carries one ciphertext string, the server stores and serves it unchanged, and another unlocked device shows the name, address and map

#### Scenario: Place position hidden
- **WHEN** an encrypted account creates a place "Home" with a pin
- **THEN** the `name`, `address` and coordinate operations carry ciphertext and the place's `position` is plaintext

#### Scenario: Locked device
- **WHEN** a device of an encrypted account is locked and shows the Locations page
- **THEN** each place reads "Encrypted" with no map pin, and no request reaches a map route for it

#### Scenario: Offline on an encrypted account
- **WHEN** an unlocked device of an encrypted account sets a saved place as a task's location while offline
- **THEN** the location is encrypted and queued, syncs when the device reconnects, and converges like any other location
