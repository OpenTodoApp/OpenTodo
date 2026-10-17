# OpenTodo

A to-do app that runs on your own server. Plan your day, keep projects in order, set reminders and share lists with your family or your team. Works on your phone and your computer, even offline, and your tasks stay with you.

## First start

Open OpenTodo after installing it. The first person to open it creates the owner account; there is no default password. After that, sign-up is closed and the owner invites people (turn on **Open sign-up** in the app settings to let anyone create an account).

## Settings

All settings are optional.

- **Base URL**: the https address people open, for example `https://todo.example.com`. Set it when you expose OpenTodo with a domain. Leave it empty when you open OpenTodo by the server's address.
- **Setup token**: at least 16 characters. When set, creating the owner account asks for it, so a stranger cannot claim a server reachable from the internet.
- **Open sign-up**: lets anyone who can reach the server create an account.
- **Trusted proxies**: reverse proxies whose `X-Forwarded-For` is trusted, such as `cloudflare`.

## https

On a plain http address tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there: expose OpenTodo with a domain and set **Base URL** to that address.

## Your data

Everything OpenTodo stores (the database, attachments and its own backups) is in the app's `data` folder, which Runtipi's app backups include.

## Links

- Website and documentation: https://open-todo.app
- Source code: https://github.com/pixari/opentodo
- Issues: https://github.com/pixari/opentodo/issues
