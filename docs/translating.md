---
title: Translating OpenTodo
summary: For contributors: how the app's text is written for translation, the catalog format, the checks, how to add a language, and the product glossary.
audience: developer
section: Internals
specs: [localization]
screens: []
order: 32
---
# Translating OpenTodo

The web app ships in English, German, French, Spanish, Italian, Portuguese, Simplified Chinese and Dutch. People pick the language in **Settings → Language and region → Language** (see [The app in your language](language.md)); the choice syncs to every device of the account. This page is for contributors who write text in the app or translate it. The documentation and the in-app Help guide stay in English.

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

## Adding a language, step by step

Open a [Translation issue](https://github.com/OpenTodoApp/OpenTodo/issues/new?template=translation.yml) first, naming the language and who reviews it. Then:

1. Scaffold every file the language needs:

   ```sh
   node scripts/i18n/new-language.mjs sv "Svenska"
   ```

   It writes an empty catalog `web/src/locales/sv.json`, an empty entry in the service worker's table, `extension/_locales/sv/` (English copies marked `TODO translate`), `values-sv/strings.xml` for the Android app, English copies of the email templates whose first line is `# TODO translate`, an empty quick-add vocabulary and a commented row in the [maintainer table](#maintainers). It refuses a code that is not two or three lowercase letters or that already exists, and it never lists the language: Settings does not offer it and `make check` still passes.
2. Translate. `make i18n-status` prints how far each language is on each surface (web app, notifications, extension, Android, iOS, emails, channel messages, vocabulary, Obsidian) and the first missing keys. Until the language is listed, `make i18n-check` only prints a line for it ("sv: 412 of 3550").
3. Add the language's row to the channel messages in `internal/channels/messages.go`, and, for the iPhone app, its strings in `mobile/ios/Shared/Localizable.xcstrings`.
4. List it: `{ code: 'sv', name: 'Svenska' }` in `SHIPPED`, `web/src/locales/index.ts`, with the name in the language itself.
   - A **maintained** language is complete on every surface, and also goes into `mail.Languages` (`internal/mail/message.go`) with its plural units and role names. The checks fail while a surface is missing.
   - A **community** language adds `community: true`; see [Community languages](#community-languages).
5. Uncomment the language's row in the maintainer table and name the reviewer in the pull request. A speaker of the language reviews every catalog change; machine translation is not accepted.

[Add a language](contributing/add-a-language.md) lists every file the language touches.

## Community languages

A catalog can ship before it is complete, as a community language:

- At least **90 %** of the web catalog is translated, and the language has a maintainer in the [table below](#maintainers).
- Settings lists it after the maintained languages; once picked, a caption says "Community translation, some text in English", in the language itself.
- A message the catalog does not have yet is shown in English. So are the emails, the weekly digest, channel messages, the native apps and the extension while they are not translated, and quick add keeps English without a vocabulary.
- `make i18n-check` fails when a community catalog drops below 90 %, for example after a change adds messages, and lists its missing messages otherwise. Every other check (placeholders, plurals, Settings paths) applies as for a maintained language.

A community language becomes maintained when every surface is complete: drop `community: true` and add it to `mail.Languages`.

## Maintainers

Every listed language has a reviewer who reads each catalog change. A language without one goes back to work in progress.

| Language | Code | Tier | Reviewer |
| --- | --- | --- | --- |
| Deutsch, Français, Español, Italiano, Português | `de`, `fr`, `es`, `it`, `pt` | maintained | the project maintainers |
| 简体中文 | `zh` | maintained | peilf |
| Nederlands | `nl` | maintained, catalog in review in [#1077](https://github.com/OpenTodoApp/OpenTodo/pull/1077) | jschreuder |

## Writing a quick-add vocabulary

Quick add understands dates, times, repeats and reminders in a language only with a vocabulary; without one it keeps English, which is always active.

1. Fill `web/src/lib/nlp/vocab/<code>.ts` (the scaffold writes it empty, shaped like `en.ts`): lower-case words and phrases, the weekdays from Monday, the months from January, `dayMonthOrder` for a numeric date such as 3/4. Leave a list empty when the language has no such word.
2. Add it to `VOCABULARIES` in `web/src/lib/nlp/vocab/index.ts`, run `npm run nlp:vocab` in `web/` to write the Go parser's copy (`internal/quickadd/vocab.json`), and add the code to `quickadd.Bundled` (`internal/quickadd/vocab.go`).
3. Add cases to `web/src/lib/nlp/quickadd.vectors.json` with the language in `ctx.languages`: at least one per kind of phrase (a day word, a weekday, a month, a time, a repeat, a reminder, a deadline), and a title that contains one of the words and must stay a title. Both parsers run every case, so `npm test -- nlp` and `go test ./internal/quickadd/` must agree.
4. Word a phrase as people type it and keep it short: a word that is also common in English is parsed only while the language is active.

## Glossary

Use these terms consistently; they match the quick-add vocabulary and the server's email templates. German and Dutch use *du*/*je*, French *vous*, Spanish *tú*, Italian *tu*, Portuguese (Brazil) *você* and Simplified Chinese 你. peilf reviews the Simplified Chinese catalog.

| English | Deutsch | Français | Español | Italiano | Português | 简体中文 | Nederlands |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Task | Aufgabe | tâche | tarea | attività | tarefa | 任务 | Taak |
| Subtask | Unteraufgabe | sous-tâche | subtarea | sottoattività | subtarefa | 子任务 | Subtaak |
| Project | Projekt | projet | proyecto | progetto | projeto | 项目 | Project |
| Section | Abschnitt | section | sección | sezione | seção | 分组 | Sectie |
| Label | Label | étiquette | etiqueta | etichetta | etiqueta | 标签 | Label |
| Inbox | Eingang | Boîte de réception | Bandeja de entrada | In arrivo | Caixa de entrada | 收件箱 | Inbox |
| Today | Heute | Aujourd’hui | Hoy | Oggi | Hoje | 今天 | Vandaag |
| Upcoming | Demnächst | À venir | Próximo | In programma | Em breve | 即将到来 | Binnenkort |
| Anytime | Jederzeit | N’importe quand | En cualquier momento | In qualsiasi momento | A qualquer hora | 随时 | Altijd |
| Someday | Irgendwann | Un jour | Algún día | Un giorno | Algum dia | 将来某天 | Ooit |
| This Evening | Heute Abend | Ce soir | Esta noche | Stasera | Hoje à noite | 今晚 | Vanavond |
| Completed | Erledigt | Terminées | Completadas | Completate | Concluídas | 已完成 | Voltooid |
| Trash | Papierkorb | Corbeille | Papelera | Cestino | Lixeira | 废纸篓 | Prullenbak |
| Due date | Fälligkeitsdatum | date d’échéance | fecha de vencimiento | data di scadenza | data de vencimento | 截止日期 | vervaldatum |
| Deadline | Frist | date limite | fecha límite | termine | prazo | 最后期限 | Deadline |
| Reminder | Erinnerung | rappel | recordatorio | promemoria | lembrete | 提醒 | Herinnering |
| Quick add | Schnelleingabe | Ajout rapide | Añadido rápido | Aggiunta rapida | Adição rápida | 快速添加 | Snel toevoegen |
| Settings | Einstellungen | Réglages | Ajustes | Impostazioni | Configurações | 设置 | Instellingen |
| Owner, admin, editor, viewer | Eigentümer, Admin, Bearbeiter, Betrachter | propriétaire, admin, éditeur, lecteur | propietario, admin, editor, lector | proprietario, admin, editor, visualizzatore | proprietário, admin, editor, leitor | 所有者、管理员、编辑者、查看者 | Eigenaar, beheerder, bewerker, lezer |
| Passkey | Passkey | clé d’accès | llave de acceso | passkey | chave de acesso | 通行密钥 | Passkey |
| Two-factor authentication | Zwei-Faktor-Authentifizierung | authentification à deux facteurs | autenticación en dos pasos | autenticazione a due fattori | autenticação de dois fatores | 双重验证 | Tweestapsverificatie |
| Weekly review | Wochenrückblick | revue hebdomadaire | revisión semanal | revisione settimanale | revisão semanal | 每周回顾 | Wekelijkse terugblik |
