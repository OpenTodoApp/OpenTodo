## ADDED Requirements

### Requirement: Field and nesting limits

Within the file size and row limits, the server SHALL refuse a CSV file in which any record, the header included, has a field over 1 MiB, more than 4 MiB in total or more than 1,000 fields, and a JSON file, uploaded or inside a ZIP, whose objects and arrays are nested more than 256 levels deep. Brackets inside JSON strings SHALL NOT count. A refused file SHALL answer `413 too_large` with a message naming the limit, and for CSV the line; no job SHALL be created and nothing SHALL be written. These limits apply to every CSV profile. Imports run on the server; a refused file writes no ops, so offline behaviour and convergence are unaffected.

#### Scenario: CSV field over the limit

- **WHEN** someone previews or imports a CSV file whose third line has a field of more than 1 MiB
- **THEN** the response is `413 too_large` naming the field limit and line 3, and no job exists afterwards

#### Scenario: CSV record with too many fields

- **WHEN** a CSV file has a record with more than 1,000 fields
- **THEN** the response is `413 too_large` naming the field count limit

#### Scenario: JSON nested too deep

- **WHEN** someone uploads a JSON file, or a ZIP holding one, with arrays nested 257 levels deep
- **THEN** the response is `413 too_large` saying the file is nested more than 256 levels, and nothing is imported

#### Scenario: Real exports are unaffected

- **WHEN** an export from a supported app within the size and row limits is imported
- **THEN** it imports as before
