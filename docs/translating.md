---
title: Translating OpenTodo
summary: How interface text is written for translation, the catalog format, adding a language, the checks, and the glossary of product terms.
audience: developer
section: Internals
specs: []
screens: []
order: 40
---
# Translating OpenTodo

The interface is written in English and translated through one catalog per language. This page is for contributors: people who write interface text in code and people who translate it. The user guides stay in English.

## How interface text is written

The English text is the message id. There are no keys to invent: you write the sentence, wrapped in `t()`, and the extractor collects it.

```tsx
import { t, T, msg, useT } from '../lib/i18n'

t('Snooze 10 min')                                   // plain text
t('Moved to {project}', { project: name })           // a value
t('{n, plural, one {# task} other {# tasks}}', { n }) // a plural
t('{kind, select, task {Task} project {Project} other {Item}} deleted', { kind })
t('Open', { context: 'verb' })                       // a homonym, keyed "Open|verb"
t.rich('Press <b>Save</b> to keep it', { b: (c) => <strong>{c}</strong> })
<T b={(c) => <b>{c}</b>} values={{ n }}>Press <b>Save</b></T>

const LABELS = { done: msg('Done') }                 // a module-level table, translated later with t(LABELS.done)
```

Components call `useT()` once so they re-render when the language changes; helpers in `web/src/lib` call `t()` directly.

Rules for source text:

- **One sentence is one message.** Never build a sentence out of fragments (`t('Moved to') + ' ' + name`): word order differs between languages. Use a placeholder, or tags with `t.rich` for links and emphasis.
- **Plurals go through `plural`**, never `n === 1 ? … : …`. Languages have different plural categories (`one`, `few`, `many`, `other`); the browser's `Intl.PluralRules` picks the right one, and `#` prints the number.
- **Placeholders have names that say what they hold** (`{project}`, `{date}`, `{n}`), so a translator can place them.
- **Add a context only for a real homonym**, such as "Open" as a verb and as an adjective.
- **Dates, times and numbers are never text in a message.** Format them with `lib/dates.ts` and `formatNumber` and pass the result as a value; they follow the user's locale.
- Product names (OpenTodo, CalDAV, Markdown) stay as they are.

The message syntax is a small subset of ICU MessageFormat: `{name}`, `{n, plural, =0 {…} one {…} other {…}}` with `#`, `{x, select, … other {…}}`, tags such as `<b>…</b>`, and `'{'` and `''` for a literal brace or apostrophe. `web/src/lib/i18n/format.ts` is the whole implementation.

## Catalogs

`web/src/locales/<lang>.json` maps each source message to its translation:

```json
{
  "Snooze 10 min": "10 Min. später",
  "Open|verb": "Öffnen",
  "{n, plural, one {# task} other {# tasks}}": "{n, plural, one {# Aufgabe} other {# Aufgaben}}"
}
```

A missing entry shows the English text, so a catalog can be completed over time. Each catalog becomes its own small file in the build, loaded only by people who choose that language, and the service worker keeps it for offline use. `web/src/locales/messages.json` lists every source message with the places it is used; it is generated, never edited by hand:

```bash
node scripts/i18n/extract.mjs --write   # refresh messages.json after changing interface text
```

Translations of a placeholder message keep every placeholder and the same plural or select argument; the translated plural uses the categories of its own language (German has `one` and `other`, Polish adds `few` and `many`).

## Adding a language

1. Copy the keys of `messages.json` into `web/src/locales/<lang>.json` (a two-letter code) and translate them by hand. Machine translation is not accepted: it gets product terms and tone wrong, and nobody reviews it.
2. Add terms for the language to the glossary below.
3. Open a pull request. While the language is not listed in `web/src/locales/index.ts`, the catalog is work in progress: `make i18n-check` reports how complete it is and the app never offers it.
4. When the catalog is complete and a second speaker of the language has reviewed it, add the code to `SHIPPED_LANGUAGES` in `web/src/locales/index.ts` and its own name to `LANGUAGE_NAMES`. The language then appears in **Settings → Preferences → Language**. The person who added it is asked to keep it up to date when new text arrives; a language that falls far behind is moved back to work in progress.

Notification texts sent while the app is closed live in a small table in `web/public/push-sw.js` (the worker cannot load catalogs); add the new language there too. A test pins each entry to the catalog.

## The checks

- **`make i18n-check`** (part of `make check`): for every shipped catalog, fails on missing or unused keys, messages that do not parse, and translations whose placeholders or plural and select arguments differ from the source. Work-in-progress catalogs get a summary line instead of a failure.
- **The untranslated-text check in `make ui-lint`**: fails on English words in JSX text or in visible string props in `web/src/app` and `web/src/ui` that are not wrapped in `t()`, with the file and line. Words that are never translated (OpenTodo, CalDAV) are listed in `scripts/i18n/allow.txt`.

## Glossary

Use these terms for the product's concepts so the app reads the same everywhere. The last row is the form of address.

| English | Deutsch | Français | Español | Italiano | Português |
| --- | --- | --- | --- | --- | --- |
| Inbox | Eingang | Boîte de réception | Bandeja de entrada | Posta in arrivo | Caixa de entrada |
| Today | Heute | Aujourd'hui | Hoy | Oggi | Hoje |
| Upcoming | Demnächst | À venir | Próximas | Prossimi | Próximas |
| Anytime | Jederzeit | À tout moment | En cualquier momento | In qualsiasi momento | A qualquer momento |
| Someday | Irgendwann | Un jour | Algún día | Un giorno | Algum dia |
| This Evening | Heute Abend | Ce soir | Esta noche | Stasera | Esta noite |
| Project | Projekt | Projet | Proyecto | Progetto | Projeto |
| Section | Abschnitt | Section | Sección | Sezione | Seção |
| Label | Label | Étiquette | Etiqueta | Etichetta | Etiqueta |
| Saved view | Gespeicherte Ansicht | Vue enregistrée | Vista guardada | Vista salvata | Visualização salva |
| Board | Board | Tableau | Tablero | Bacheca | Quadro |
| Due date | Fälligkeitsdatum | Échéance | Fecha de vencimiento | Scadenza | Data de vencimento |
| Deadline | Frist | Date limite | Fecha límite | Termine ultimo | Prazo |
| Reminder | Erinnerung | Rappel | Recordatorio | Promemoria | Lembrete |
| Snooze | Später erinnern | Reporter | Posponer | Posticipa | Adiar |
| Dismiss | Verwerfen | Ignorer | Descartar | Ignora | Dispensar |
| Complete (a task) | Erledigen | Terminer | Completar | Completare | Concluir |
| Trash | Papierkorb | Corbeille | Papelera | Cestino | Lixeira |
| Address the user as | du | vous | tú | tu | você |
