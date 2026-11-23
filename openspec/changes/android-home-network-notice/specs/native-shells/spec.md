# Spec Delta

## ADDED Requirements

### Requirement: The Android first-run screen says when an address only works at home
While the address typed on the Android app's first-run screen, or the saved address it shows, is this device, a private IPv4 address (`10/8`, `172.16/12`, `192.168/16`), a link-local or unique-local address, or a `.local` name, the screen SHALL show "This address only works on your home network." with a link that opens the guide "Reach OpenTodo from outside your home" in the browser. The notice SHALL NOT block or delay connecting. Addresses in `100.64.0.0/10` (Tailscale, CGNAT), names without a dot and public hosts SHALL get no notice. The notice touches no task data, so it has no offline or convergence behaviour of its own.

#### Scenario: A Home Assistant address
- **WHEN** the user types `http://192.168.1.10:8080`
- **THEN** the notice and its link show under the field, and Connect works as before

#### Scenario: A Tailscale address
- **WHEN** the user types `http://100.101.102.103:8080` or `https://homeassistant.tail1234.ts.net`
- **THEN** no notice shows
