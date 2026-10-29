## ADDED Requirements

### Requirement: Energy tokens
While the Energy levels switch (OpenSpec `task-energy`) is on, the quick-add line SHALL recognise `~deep`, `~medium` and `~low`, and the prefixes `~d`, `~m` and `~l`, ignoring case, in every interface language, as the task's energy. A recognised token SHALL be removed from the title and shown as a dismissable chip; the last energy token on the line SHALL win. `~` followed by anything else SHALL stay in the title. Typing `~` SHALL suggest the three values. While the switch is off the token SHALL not be parsed or suggested. Parsing SHALL be deterministic and offline, and the web and server parsers SHALL agree through the shared vectors.

#### Scenario: Token in a full line
- **WHEN** the switch is on and the user enters `Draft the strategy #Work ~deep +2h`
- **THEN** the task is titled `Draft the strategy`, in "Work", with a 120-minute estimate and energy Deep, and the preview shows a "Deep energy" chip

#### Scenario: Prefix and language
- **WHEN** German is active, the switch is on and the user enters `Rechnungen ablegen ~L`
- **THEN** the task is titled `Rechnungen ablegen` with energy Low

#### Scenario: Not a token
- **WHEN** the switch is on and the user enters `Dinner for ~6 people`
- **THEN** the title is `Dinner for ~6 people` and no energy is set

#### Scenario: Switch off
- **WHEN** the switch is off and the user enters `Call ~low`
- **THEN** the title is `Call ~low` and no chip is shown

#### Scenario: Same in the CLI
- **WHEN** the line `Sort receipts ~low` is parsed by the CLI's quick add
- **THEN** the result equals the web parser's, as pinned by the shared vectors
