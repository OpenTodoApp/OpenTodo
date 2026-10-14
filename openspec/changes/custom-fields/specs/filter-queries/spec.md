# Spec Delta

## MODIFIED Requirements

### Requirement: Query grammar
A query SHALL be a boolean expression over terms combined with `&` (and), `|` (or), `!` (not) and parentheses, where `!` binds tightest, then `&`, then `|`. Whitespace between tokens SHALL be ignored. Names containing spaces or operator characters SHALL be written in double quotes. Matching of names and keywords SHALL ignore case. Terms SHALL include a custom field term `name cmp value` and `no name`, where `name` is a field name that is not a reserved word (OpenSpec `custom-fields`). The grammar SHALL be published in the documentation and the client SHALL accept exactly that grammar.

#### Scenario: Precedence
- **WHEN** the user enters `@errand | @call & p1`
- **THEN** it is evaluated as `@errand | (@call & p1)`

#### Scenario: Grouping and negation
- **WHEN** the user enters `(@errand | @call) & !#Work`
- **THEN** tasks carrying either label and not in project "Work" are listed

#### Scenario: Quoted names
- **WHEN** the user enters `#"Client A" & @"follow up"`
- **THEN** the project named "Client A" and the label named "follow up" are matched, ignoring case

#### Scenario: Field term with a quoted name
- **WHEN** the user enters `"Order date" <= friday & cost > 100`
- **THEN** both terms are parsed as field terms and combined with `&`

#### Scenario: Reserved words stay reserved
- **WHEN** a project defines a field named "due" and the user enters `due <= tomorrow`
- **THEN** the term is the due-date term, and the field is reachable only through its quoted name
