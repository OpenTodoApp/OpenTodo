# Design

## D1. A task field, not a label or a custom field

Energy is one more task property, `task.energy`, a string that is `""` (none), `deep`, `medium` or `low`.

Alternatives considered:
- **A reserved label** (`@deep`): works today, but labels are free text, translated by people, and a task can carry several, so "Deep and Low" would be possible. Features such as filters, Bento or Statistics could not rely on it.
- **A built-in Choice custom field**: custom fields are per project (inherited down a tree) and their names are user text, encrypted on encrypted accounts; a cross-project property would need a special case in every field path.
- **A number 1–3**: no more expressive, and the words read better in CalDAV, the vault and the API.

Data model impact: one additive field in `internal/sync/ops.go` `Schema` with a new kind `kEnergy` that accepts exactly the four values (like `kPriority` and `kReminderKind` for their enums); `web/src/lib/types.ts`; the task default `""` in `web/src/lib/ops.ts`. Materialized rows hold fields generically, so no migration. It converges per field by last-writer-wins, so device A setting the energy and device B setting the estimate both survive. A client that reads a value it does not know (a later version could add one) treats it as none and never rewrites it. Older clients pass the field through unchanged, as they do for every unknown field. No dependency: no effect on image size or memory.

## D2. Not content

The value is chosen from three fixed words, never typed by a person, so it is not added to `e2ee.ContentFields` or `CONTENT_FIELDS`. On an encrypted account the server validates it like priority, the REST and MCP shapes carry it in clear, and filters evaluate it from the local copy. It reveals as much as priority does, which is already in clear.

## D3. Behind "How you work", values always honoured

Progressive disclosure: **Settings › Account › How you work** gains a row **Energy levels** with a switch, stored as a synced, additive `user_prefs.energy` (`on`, or empty/unknown for off, never rewritten). It is off by default for every mode, Lists only included; turning on "Full Open Loops method" does not turn it on. With it off:
- the task page, the docked panel and the row menu do not offer Energy in their Add menus;
- quick add does not show suggestions for `~` and does not parse the token (the text stays in the title, as an unknown project token does);
- a task that already has an energy still shows it where set (the fact row, the row word), with Clear, because hiding a value someone set would be data loss in the interface;
- the filter terms keep working, since a filter is typed on purpose.

Simple-list users therefore see nothing new. Alternative considered: always offer it. Rejected: it adds a property to every task's Add menu for a method most people do not use.

## D4. Quick-add token `~deep`, `~medium`, `~low`

`~` is unused by `web/src/lib/nlp` and `internal/quickadd` (checked), is easy to type on a phone keyboard's symbol page, and reads as "about this much". The token is one of `~deep`, `~medium`, `~low`, or the unique prefixes `~d`, `~m`, `~l`, case-insensitive, recognised anywhere in the line, removed from the title, shown as a dismissable chip "Deep energy". The words are not translated: a sigil token is language-neutral like `p1` and `+30m`, and three words in six languages would add 15 vocabulary entries for little gain. The chip's label is translated. `~` followed by anything else stays literal (`~5 people` stays in the title). Both parsers share `quickadd.vectors.json`, so the CLI and the importer parse identically. A second energy token wins over the first, as a second priority token does.

Alternatives: `!deep` (`!` reads as urgency, and filters use `!` for "not"); a bare word `deep` (would steal ordinary words from titles).

## D5. Filter terms modelled on `origin`

`energy` matches tasks with any energy, `no energy` tasks without, and `energy: <value>` tasks with that value (quotes allowed, case ignored). An unknown value (`energy: high`) is an error with the three valid values in the message, so typos never silently match nothing. `energy` becomes a reserved word: a custom field named "Energy" is reachable only by its quoted name, as for `origin`. The Go `internal/filter` parser accepts the same grammar so saved views validate on the server; evaluation stays on the device.

## D6. Where it shows

- **Task page and docked panel:** an **Energy** row in the Details group, after Estimate: a segmented choice Deep / Medium / Low with Clear, keyboard reachable. Only when set, or offered in the Add menu while the switch is on (interface rule 3: show what is set, offer what is not).
- **Row:** one muted word ("Deep", "Medium", "Low") in the row's metadata, only when set, after the estimate. It is a row property that a saved view can hide like the others. The budget's seven properties count only properties with a value, and an empty task gains none, so the budget is unchanged. On a phone the row's single end cell is unchanged (energy is on the task page only).
- **Row menu:** an **Energy** submenu (Deep, Medium, Low, None) while the switch is on, after Priority.
- **Planning list:** no new source; a saved view with `energy: deep` is already a source.

Interface budget (docs/interface-guide.md): no chrome row, no sidebar destination, no scroll region; the empty task gains no visible property; no new shortcut (the row menu and Add menu reach it; a dedicated key is left for later to avoid a registry conflict).

## D7. Everywhere a task travels

- **REST:** `energy` in the task shape; `POST` and `PATCH` accept `"deep"`, `"medium"`, `"low"` or `null`/`""` to clear, and refuse anything else with `400 invalid_energy`. Viewers of a shared project are refused like any task write (403). `docs/api.md`.
- **CLI:** `ot add --energy deep`, `ot edit <id> --energy none`, an `Energy` column in `ot list --wide` and the field in `--json`.
- **Agent tools and MCP:** `energy` joins the planning properties of the create and update tools (`write_planning.go`) and the task read shape; writes go through `ApplyStrict` as today.
- **Export and import:** the JSON export carries the field; CSV export gets an `energy` column, and CSV import maps a column named `energy` (values matched ignoring case; anything else ignored and reported). Other apps' importers leave it empty.
- **CalDAV:** `X-OPENTODO-ENERGY:DEEP|MEDIUM|LOW`, omitted when unset, read back like `X-OPENTODO-EVENING`; an invalid value is kept in `ical_extra`.
- **Vault:** `[energy:: deep]` after `[evening:: true]`; an invalid value is reported for the line.

## D8. Shared projects, viewers, offline

Energy is a task field, so on a shared project every member sees the same value, and editors set it as they set priority; a viewer sees it and cannot change it (the row menu and the facts are read-only). It is not personal: two people's different energy for the same task is out of scope. Offline, every write is an op queued like any edit; two devices setting different values converge on the one with the greater timestamp.
