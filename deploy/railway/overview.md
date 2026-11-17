# Deploy and Host OpenTodo with Railway

OpenTodo is an open-source, local-first task manager. It replaces subscription task apps with one small container you own: the web app, the sync server and the database (SQLite) in a single image. Every device keeps a full copy, works offline and syncs when it is back.

## About Hosting OpenTodo

This template runs the released OpenTodo image as one service with a volume on /data, where the database, attachments and backups live. Railway gives it an https address, which becomes OPENTODO_BASE_URL so passkeys, secure cookies and links work. The first person to open the address creates the owner account; the template generates a setup token for it, which you find in the service's Variables tab. Sign-up stays closed: the owner invites people.

## Common Use Cases

- Personal tasks, projects and notes on every device, without a subscription
- A small team or family sharing projects on a server they control
- Replacing Todoist, TickTick or Things with an open-source app (import included)
- Planning the day in a calendar view, with reminders as push notifications

## Dependencies for OpenTodo Hosting

- None besides the OpenTodo image: the database is SQLite on the volume

### Deployment Dependencies

- Image: https://github.com/OpenTodoApp/OpenTodo/pkgs/container/opentodo
- Source and documentation: https://github.com/OpenTodoApp/OpenTodo
- Self-hosting guide: https://open-todo.app/docs/self-hosting/

### Why Deploy OpenTodo on Railway?

Railway runs OpenTodo with an https address, a persistent volume and health checks in a few clicks, and keeps it running without a server to manage.
