# Spec Delta

## ADDED Requirements

### Requirement: Part of the day terms
`morning` SHALL match tasks whose stored part is Morning and `afternoon` tasks whose stored part is Afternoon (OpenSpec `day-parts`), whatever their date; a part placed only by the due time in Today SHALL not match. `evening` SHALL keep matching the evening flag. The Go filter parser SHALL accept both keywords when it validates a saved view.

#### Scenario: Morning tasks at home
- **WHEN** the user enters `#Home & morning`
- **THEN** open tasks of "Home" set to Morning are listed, and a Home task due at 09:00 without a part is not

#### Scenario: Saved through the API
- **WHEN** a client saves a view with the query `today & afternoon`
- **THEN** the server accepts it as valid
