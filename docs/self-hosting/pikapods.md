---
title: Running on PikaPods
summary: A managed OpenTodo pod on PikaPods - what it costs, the owner screen and the setup code, invitations, backups you keep yourself, and moving to your own server later.
audience: admin
specs: [self-hosting]
screens: []
order: 22
---
# Running OpenTodo on PikaPods

[PikaPods](https://www.pikapods.com/apps/opentodo) runs OpenTodo for you as a managed pod: it handles updates and HTTPS, and tests every update before it reaches your pod. It is one way to run OpenTodo, next to running it on your own hardware with the [handbook](README.md).

PikaPods shares part of its revenue with the OpenTodo project. You get the same open-source OpenTodo, and you can export your data and move to your own server at any time.

## Cost and size

A pod starts at $2.00 a month, billed by the hour from prepaid credit; new PikaPods accounts get $5 of welcome credit. The smallest pod (0.25 CPU, 0.25 GB of memory and 5 GB of storage) is enough to start; you can give the pod more later.

## Set up

1. On the [OpenTodo page](https://www.pikapods.com/apps/opentodo), choose to run your own pod and follow PikaPods' steps.
2. Open the pod's address and finish the owner screen before you share the address with anyone. **The first person to finish it becomes the owner.**
3. If the screen asks for a setup code, find it in the pod's logs on PikaPods, or use the setup token if one is configured for the pod ([The setup code](docker.md#the-setup-code)).
4. Registration is closed by default. Invite people from **Settings** ([Managing users](docker.md#managing-users)).

## Backups

PikaPods can make nightly encrypted backups of the pod to S3 storage you own; turn them on for your pod. PikaPods also backs up its servers in case one fails, but those backups can't restore a single pod, so keep your own.

You can also let OpenTodo back itself up: in **Settings → Server → Backups**, choose an S3 or WebDAV destination and a schedule. Backups written to the pod's own `backups/` folder stay in the pod, so they don't protect you if the pod is lost. See [Backups](../backups.md).

## Move to your own server

1. With an S3 or WebDAV destination set, choose **Back up now** in **Settings → Server → Backups** and download the new archive from that destination. If it is encrypted, have its passphrase ready.
2. Start OpenTodo on your own server with the [handbook](README.md) and create the owner account.
3. On the new server, open **Settings → Server → Backups → Restore from a backup**, choose **Upload a file** and restore the archive. It brings back every account, project and task ([Restore from the web app](../backups.md#restore-from-the-web-app)).
4. Point your devices at the new address and sign in again. When everything is there, stop the pod on PikaPods.

Each person can also take their own tasks with them as a file from **Settings → Data** ([Download everything](../import-export.md#download-everything)).
