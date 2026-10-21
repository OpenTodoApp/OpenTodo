---
title: Running on Synology
summary: Run OpenTodo on a Synology NAS with Container Manager (DSM 7.2 and later), the data folder and its owner, https with DSM's reverse proxy and Let's Encrypt, updates and backups.
audience: admin
specs: [self-hosting]
screens: []
order: 37
---
# Running OpenTodo on Synology

OpenTodo is one container with one data folder and no required settings. On a Synology NAS it runs in **Container Manager** (DSM 7.2 and later, on the models where Package Center offers it) as a **Project**, which is a Docker Compose file. The image is built for x86-64 and ARM64.

OpenTodo is not in Package Center: Package Center installs packages (`.spk` files built for DSM, including those from SynoCommunity), not containers, so OpenTodo is installed as a Container Manager project.

## Install

1. In **Package Center**, install **Container Manager**. It creates the shared folder `docker`.
2. In **File Station**, open `docker`, create the folder `opentodo`, and inside it the folder `data`. Create them with the DSM account you sign in with: that account owns them.
3. Find the user and group id of that account (see [The data folder and its owner](#the-data-folder-and-its-owner)). On most NAS units the first account is `1026` and its group `users` is `100`.
4. In **Container Manager → Project**, click **Create**. Project name `opentodo`, path `/docker/opentodo` (that is `/volume1/docker/opentodo`), source **Create docker-compose.yml**, and paste:

   ```yaml
   services:
     opentodo:
       image: ghcr.io/pixari/opentodo:stable
       container_name: opentodo
       pull_policy: always
       user: "1026:100"
       restart: unless-stopped
       ports:
         - "8080:8080"
       environment:
         OPENTODO_BASE_URL: ""
         OPENTODO_SETUP_TOKEN: ""
         OPENTODO_ALLOW_SIGNUP: "false"
         OPENTODO_TRUSTED_PROXIES: ""
       volumes:
         - ./data:/data
       healthcheck:
         test: ["CMD", "/opentodo", "healthcheck"]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 10s
   ```

   Change `"1026:100"` if your ids are different. If port 8080 is taken on the NAS, change the first number (for example `"8090:8080"`).
5. Skip the web portal settings (Web Station is not needed), click **Next** and **Done**. Container Manager pulls the image and starts the project; the container shows as healthy once it answers.
6. Open `http://<your-nas-address>:8080`. The first visitor creates the owner account; after that, sign-up is closed and the owner invites people.

If the NAS can be reached from the internet before you create the owner account, set a setup token first (below).

## Settings

Change them in the project's YAML (**Project → opentodo → YAML Configurations**, edit, save, and let Container Manager rebuild the project).

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENTODO_BASE_URL` | empty | Leave empty when you open OpenTodo by the NAS's address. Behind the reverse proxy, set the https address people open, for example `https://todo.example.com`. |
| `OPENTODO_SETUP_TOKEN` | empty | Optional, 16+ characters. When set, creating the owner account asks for it, so a stranger cannot claim the server first. |
| `OPENTODO_ALLOW_SIGNUP` | `false` | `true` lets anyone who can reach the server create an account. |
| `OPENTODO_TRUSTED_PROXIES` | empty | Leave it empty behind DSM's reverse proxy (OpenTodo trusts proxies on loopback and private addresses). Set `cloudflare` if Cloudflare's proxy sits in front. |

Other `OPENTODO_*` variables are in the [configuration table](https://github.com/pixari/opentodo#configuration).

## The data folder and its owner

The image runs as user 65532 by default, but the binary runs as any user that can write `/data`. A folder created in File Station belongs to your DSM account, so the project runs OpenTodo as that account (`user: "<uid>:<gid>"`), and its files stay yours: you can browse, copy and back them up like any other folder.

To see your ids without SSH, use the Task Scheduler:

1. **Control Panel → Task Scheduler → Settings**: tick **Save output results** and choose a folder, then **OK**.
2. **Create → Scheduled Task → User-defined script**. Task name `id`, user `root`, untick **Enabled**. Under **Task Settings**, enter `id yourname` (your DSM user name) as the script, then **OK**.
3. Select the task, click **Run**, then **Action → View Result**. The output reads like `uid=1026(yourname) gid=100(users) …`: put `uid:gid` (here `1026:100`) in the project's `user:` line. Delete the task afterwards.

If you can use SSH, `id yourname` shows the same. Alternatives to `user:`:

- **Give the folder to the image's user** (needs SSH): remove the `user:` line and run `sudo chown -R 65532:65532 /volume1/docker/opentodo/data`. The files then belong to an id DSM does not know, so File Station shows no owner for them.
- **Open the folder's permissions** (no SSH): in File Station, right-click `data` → **Properties → Permission → Create**, choose **Everyone**, tick **Read** and **Write**, apply it to this folder, sub-folders and files, and remove the `user:` line. Anyone with access to the `docker` shared folder can then read the data.

If the container stops right after it starts and its log (**Container → opentodo → Log**) says `open /data/opentodo.lock: permission denied`, the user in `user:` cannot write the folder: check the ids, check that the `data` folder exists (if it is missing, Docker creates it owned by root), and that your account has **Read & Write** on it under **Properties → Permission**.

## https with DSM's reverse proxy

On `http://<your-nas-address>:8080` tasks, projects, sync, sharing and attachments work. Installing the app on a phone, working offline, push notifications, passkeys and end-to-end encryption need https, because browsers only allow them there. DSM has a reverse proxy and Let's Encrypt built in:

1. Point a domain name at your NAS (your own domain, or a Synology DDNS name from **Control Panel → External Access → DDNS**), and forward ports 80 and 443 of your router to the NAS.
2. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**. Source: protocol **HTTPS**, hostname `todo.example.com`, port `443`. Destination: protocol **HTTP**, hostname `localhost`, port `8080`. Save.
3. **Control Panel → Security → Certificate → Add → Add a new certificate → Get a certificate from Let's Encrypt**, with `todo.example.com` as the domain name. Then **Settings** on the same page, and choose that certificate for the reverse proxy entry `todo.example.com`.
4. Set `OPENTODO_BASE_URL: "https://todo.example.com"` in the project's YAML and rebuild it.

Do not set an `https://` address while you open OpenTodo over plain http: the session cookie becomes secure-only and sign-in fails. Live updates stream through DSM's proxy without extra settings; to test them, see [Live updates through the proxy](docker.md#live-updates-through-the-proxy). Tailscale (in Package Center) is another way to get https without opening ports. More in [Running with Docker](docker.md#behind-a-reverse-proxy).

## Updates

The project uses the `stable` image, which every release moves. Container Manager shows no update notice for images from `ghcr.io`, so update by hand: **Project → opentodo → Action → Stop**, then **Action → Build**. Because of `pull_policy: always`, the build pulls the current `stable` image and recreates the container; the data folder is kept and migrations run on start. There are no down-migrations, so back up first. If the version at `http://<your-nas-address>:8080/healthz` did not change, stop the project, choose **Action → Clean**, delete the image under **Image**, and **Build** again.

To stay on one release line, use `ghcr.io/pixari/opentodo:0.9` (or one version, `0.9.0`) as the image.

## Backups

Everything OpenTodo stores (the database, attachments and its own backups) is in `/volume1/docker/opentodo/data`. Back up the `docker/opentodo` folder with **Hyper Backup**, or take snapshots of the `docker` shared folder with **Snapshot Replication** (Btrfs volumes). For a copy that is consistent while OpenTodo runs, turn on scheduled backups in OpenTodo's **Settings → Server**: they are written to `data/backups` (which Hyper Backup then picks up) or to S3 or WebDAV. See [Backups](../backups.md).
