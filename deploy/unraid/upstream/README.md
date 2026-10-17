# OpenTodo templates for Unraid

Unraid Community Applications templates for [OpenTodo](https://open-todo.app), the open-source, local-first task manager you host yourself.

| Template | App |
| --- | --- |
| [`templates/opentodo.xml`](templates/opentodo.xml) | OpenTodo: one container, one appdata folder, no required settings |

Install it from **Apps** in Unraid: search for **OpenTodo** and click **Install**. Without Community Applications, add it by hand from Unraid's terminal:

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-OpenTodo.xml \
  https://raw.githubusercontent.com/pixari/opentodo-unraid/main/templates/opentodo.xml
```

then open **Docker → Add Container** and choose **OpenTodo** under *User templates*. The settings, permissions, https and updates are explained in [Running OpenTodo on Unraid](https://github.com/pixari/opentodo/blob/main/docs/self-hosting/unraid.md).

**Do not edit these files here.** They are published from [`deploy/unraid/upstream/`](https://github.com/pixari/opentodo/tree/main/deploy/unraid/upstream) in the OpenTodo repository, where every change is checked against the release it names. Report problems in [OpenTodo's issues](https://github.com/pixari/opentodo/issues).
