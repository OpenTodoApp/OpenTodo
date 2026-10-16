---
title: Translating OpenTodo
summary: For contributors: how the app's text is written for translation, the catalog format, the checks, how to add a language, and the product glossary.
audience: developer
section: Internals
specs: []
screens: []
order: 32
---
# Translating OpenTodo

The web app ships in English, German, French, Spanish, Italian and Portuguese. People pick the language in **Settings → General → Language** (see [The app in your language](language.md)); the choice syncs to every device of the account. This page is for contributors who write text in the app or translate it. The documentation and the in-app Help guide stay in English.

## How text is written

The English source text is the message id. Every string people read or hear goes through the message layer in `web/src/lib/i18n`:

```tsx
import { t, msg } from '../lib/i18n'

t('Snooze 10 min')                                        // plain
t('Delete {name}?', { name: project.name })              // placeholder
t('{n, plural, one {# task} other {# tasks}}', { n })    // plural, # is the number
t('{when, select, before {before} other {after}}', { when })
t('on', { context: 'comment' })                          // same English, different meaning
t.rich('Read the <a>guide</a>', { a: (s) => <a href="/help">{s}</a> })
const LABEL = msg('Inbox')                               // module level; translate where shown: t(LABEL)
```

- Write whole sentences. Never glue translated pieces or add an English ending (`{n} item` + `s`): use a plural message.
- Placeholders are named for what they hold (`{name}`, `{date}`), never numbered. `{n}` prints a number as given; `{n, number}` groups digits in the reader's language.
- Dates, times, numbers and lists come from `lib/dates.ts`, `formatNumber()` and `formatList()`, which follow the interface language.
- Text that is data stays out of the catalogs: task titles, project and label names, filter keywords and repeat rules (their syntax is English everywhere), API field names and codes.
- Components re-render on a language change through `useT()`, `useLanguageVersion()` or `<T>`; module-level tables use `translatedMap()` or `translatedList()`.

Server errors keep their English JSON envelope. The client shows a translated message per error code (`lib/i18n/errors.ts`), and the server's own message for a code it does not know yet.

## Catalogs

`web/src/locales/messages.json` lists every source message and the files that use it; it is generated, never edited by hand. Each language is one file, `web/src/locales/<code>.json`, mapping the source text to its translation:

```json
{
  "Delete {name}?": "{name} löschen?",
  "{n, plural, one {# task} other {# tasks}}": "{n, plural, one {# Aufgabe} other {# Aufgaben}}",
  "on|comment": "zu"
}
```

A key ending in `|context` translates the message used with that `context`. Keep every placeholder, tag and plural argument of the source; use the plural categories of your language (`one`/`other` for the six shipped ones). Use the typographic apostrophe `’` in translations: a straight `'` starts quoted text in the message syntax. A missing entry falls back to English.

Each catalog becomes its own chunk of the build, loaded only when someone picks the language and precached for offline use. The browser extension has its own small catalogs in `extension/_locales/`, and the service worker keeps the few notification texts in a table in `web/public/push-sw.js`; both are pinned to the app's catalogs by tests.

## The checks

- `node scripts/i18n/extract.mjs --write` refreshes `messages.json` after you add or change a message.
- `make i18n-check` (part of `make check`) fails on a missing or unused entry, a message that does not parse, a placeholder, tag or plural mismatch, and a "Settings → …" path that does not use the translated section names.
- `make ui-lint` fails on English text in JSX or in readable props that does not go through `t()`. Permanent exceptions (proper nouns, key names, samples) are listed in `scripts/i18n/allow.txt`.

Details are in [scripts/README.md](../scripts/README.md#i18n-checkmjs-and-i18n).

## Adding a language

1. Copy `messages.json`'s keys into `web/src/locales/<code>.json` and translate them. Until the file is listed, the check only prints how far it is ("pl: 412 of 3550").
2. Add `{ code, name }` to `SHIPPED` in `web/src/locales/index.ts`, with the name in the language itself.
3. Add the language's texts to the table in `web/public/push-sw.js` and a folder to `extension/_locales/`.
4. Quick add understands dates in a language only with a vocabulary in `web/src/lib/nlp/vocab/`; that is a separate contribution.
5. Name a maintainer for the language in the pull request. A speaker of the language reviews every catalog change; machine translation is not accepted.

## Glossary

Use these terms consistently; they match the quick-add vocabulary and the server's email templates. German uses *du*, French *vous*, Spanish *tú*, Italian *tu* and Portuguese (Brazil) *você*.

| English | Deutsch | Français | Español | Italiano | Português |
| --- | --- | --- | --- | --- | --- |
| Task | Aufgabe | tâche | tarea | attività | tarefa |
| Subtask | Unteraufgabe | sous-tâche | subtarea | sottoattività | subtarefa |
| Project | Projekt | projet | proyecto | progetto | projeto |
| Section | Abschnitt | section | sección | sezione | seção |
| Label | Label | étiquette | etiqueta | etichetta | etiqueta |
| Inbox | Eingang | Boîte de réception | Bandeja de entrada | In arrivo | Caixa de entrada |
| Today | Heute | Aujourd’hui | Hoy | Oggi | Hoje |
| Upcoming | Demnächst | À venir | Próximo | In programma | Em breve |
| Anytime | Jederzeit | N’importe quand | En cualquier momento | In qualsiasi momento | A qualquer hora |
| Someday | Irgendwann | Un jour | Algún día | Un giorno | Algum dia |
| This Evening | Heute Abend | Ce soir | Esta noche | Stasera | Hoje à noite |
| Completed | Erledigt | Terminées | Completadas | Completate | Concluídas |
| Trash | Papierkorb | Corbeille | Papelera | Cestino | Lixeira |
| Due date | Fälligkeitsdatum | date d’échéance | fecha de vencimiento | data di scadenza | data de vencimento |
| Deadline | Frist | date limite | fecha límite | termine | prazo |
| Reminder | Erinnerung | rappel | recordatorio | promemoria | lembrete |
| Quick add | Schnelleingabe | Ajout rapide | Añadido rápido | Aggiunta rapida | Adição rápida |
| Settings | Einstellungen | Réglages | Ajustes | Impostazioni | Configurações |
| Owner, admin, editor, viewer | Eigentümer, Admin, Bearbeiter, Betrachter | propriétaire, admin, éditeur, lecteur | propietario, admin, editor, lector | proprietario, admin, editor, visualizzatore | proprietário, admin, editor, leitor |
| Passkey | Passkey | clé d’accès | llave de acceso | passkey | chave de acesso |
| Two-factor authentication | Zwei-Faktor-Authentifizierung | authentification à deux facteurs | autenticación en dos pasos | autenticazione a due fattori | autenticação de dois fatores |
| Weekly review | Wochenrückblick | revue hebdomadaire | revisión semanal | revisione settimanale | revisão semanal |
