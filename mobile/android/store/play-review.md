# Google Play review answers

Answers for the Play Console sections a reviewer reads, next to `data-safety.md`, so a change to the app's behaviour changes them in the same pull request (OpenSpec change `play-production`, design D6). `./gradlew :app:checkStoreMetadata` fails without this file.

## App access

The app needs an OpenTodo server, which the user runs. Reviewers use the public demo instance, which needs no credentials. Paste into **App content → App access → All or some functionality is restricted → Add instructions**:

> OpenTodo is a client for a self-hosted server. To review it without your own server:
> 1. On the first screen, enter `demo.open-todo.app` and tap Connect.
> 2. On the sign-in screen, tap "Try the demo". No account or password is needed; you get a private sandbox with sample tasks that is deleted after a few hours.
> Reminders: open a task, add a reminder a few minutes ahead, and allow notifications and alarms when asked. Widgets: long-press the home screen → Widgets → OpenTodo.

Username and password fields: leave empty (none needed).

## Exact alarms

The app declares `SCHEDULE_EXACT_ALARM`, which the user grants in the system settings, and not `USE_EXACT_ALARM`, which Play reserves for alarm clock and calendar apps. If the Console asks for the exact-alarm declaration:

> Users set reminders on their own tasks at a time they choose ("remind me at 9:00"). The app schedules the next seven days of these reminders as exact alarms so they fire on time without a push service. The user grants the permission from the app's notification settings; without it the app falls back to inexact alarms and reminders may arrive a few minutes late. No alarm is set that the user did not ask for.

## Content rating (IARC questionnaire)

- **Category:** Utility, Productivity, Communication, or Other ("All other app types").
- **Violence, sexuality, language, controlled substances, gambling:** No.
- **Does the app let users interact or exchange content?** Yes: users can share tasks and projects with people they invite on their own server. There is no public content, chat with strangers or location sharing with other users.
- **Does the app share the user's current location with other users?** No.
- **Does the app allow users to purchase digital goods?** No.
- **Is the app a web browser or search engine?** No (it opens only the server the user entered; other sites open in the browser).

Expected rating: Everyone / PEGI 3 (with "Users interact").

## Ads, target audience and news

- **Contains ads:** No.
- **Target age group:** 18 and over (a work and personal task manager; not designed for children).
- **News app:** No.
- **Government app:** No.
- **Financial features, health features:** None.

## Foreground services and other declarations

- **Foreground service:** none.
- **Background location, photos and videos, all files access, accessibility, VPN:** not used.
- **Account deletion:** the app creates no account with the developer. Accounts live on the server the user entered and are deleted there by whoever runs it (**Settings → Server → People → Users**). If the Console asks for a deletion URL anyway: `https://github.com/OpenTodoApp/OpenTodo/blob/main/docs/settings-server.md#people`.
