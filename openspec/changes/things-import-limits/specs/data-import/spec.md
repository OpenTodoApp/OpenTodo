## MODIFIED Requirements

### Requirement: Things database
The server SHALL accept the `main.sqlite` file of a Things 3 database, alone or inside a ZIP of the `Things Database.thingsdatabase` folder, and `docs/import.md` SHALL explain how to copy it with Things closed. The file SHALL be opened read-only, only Things' known tables SHALL be read, it SHALL be deleted after the preview or import, and a file that is not a Things database of a supported schema version SHALL be refused with a 400 error naming the reason. Because the file is untrusted input, the server SHALL NOT run expressions stored in it: a file whose Things tables are virtual tables or have generated columns SHALL be refused with a 400 error before any row is read, a value longer than 1 MB SHALL end the read with a 400 error, and reading SHALL stop after 30 seconds. In every refusal nothing is written.

#### Scenario: Copy of the database
- **WHEN** the user uploads `main.sqlite` copied from Things with the app closed
- **THEN** the preview reports `things-db` and lists the areas, projects, headings and to-dos

#### Scenario: Some other SQLite file
- **WHEN** the user uploads a SQLite file without Things' tables
- **THEN** the preview is refused with a 400 error stating it is not a Things database, and nothing is written

#### Scenario: A table that computes its values
- **WHEN** the user uploads a SQLite file with Things' tables in which `TMTag` has a generated column
- **THEN** the preview is refused with a 400 error stating it is not a Things database because `TMTag` has generated columns, the column's expression never runs, and nothing is written

#### Scenario: An oversized value
- **WHEN** the user uploads a Things database in which one to-do's notes are longer than 1 MB
- **THEN** the preview is refused with a 400 error, and nothing is written
