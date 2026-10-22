---
title: Speech to text
summary: Dictation that stays on your network - running Speaches or whisper.cpp next to OpenTodo, connecting it in Settings or with OPENTODO_STT_*, and what passes through the server.
audience: admin
specs: [voice-capture]
screens: []
order: 47
---
# Speech to text

Voice capture uses the browser's own speech recognition by default, and some browsers send that audio to their vendor. If you run a speech-to-text service yourself, people can choose **This server's speech service** instead. Each spoken phrase then goes from their browser to your OpenTodo server, on to your service, and back as text. Nothing leaves your network.

OpenTodo speaks the OpenAI-compatible `POST /v1/audio/transcriptions` request, so any service that implements it works:

- [Speaches](https://speaches.ai) (formerly faster-whisper-server) runs in one container, on CPU or GPU, under the MIT licence;
- whisper.cpp's server is lighter, a single binary run with `--inference-path /v1/audio/transcriptions`;
- LocalAI or a hosted service also work if you prefer one.

## Run Speaches with Docker Compose

Add a service next to OpenTodo in your `docker-compose.yml`:

```yaml
services:
  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: unless-stopped
    volumes:
      - speaches-models:/home/ubuntu/.cache/huggingface/hub
volumes:
  speaches-models:
```

Download a model once with `docker compose exec speaches speaches-cli model download Systran/faster-whisper-small`. The small model needs about 1 GB of RAM and answers a short phrase in one to three seconds on four CPU cores. `Systran/faster-whisper-base` is faster on a small server, and `Systran/faster-whisper-medium` is more accurate if you have the memory.

## Connect it

In **Settings → Server → Speech to text**, enter the address (`http://speaches:8000` from the same compose project), the model, and a key only if the service needs one. Press **Test**: OpenTodo sends one second of silence and shows the answer, or the step that failed. The service is on a private network, so also turn on **Allow private network targets** in **Settings → Integrations → Webhooks**. Otherwise OpenTodo refuses to reach it.

You can also set it with optional variables. A field set by a variable is read-only in Settings and names it:

| Variable | Meaning |
| --- | --- |
| `OPENTODO_STT_URL` | The service's address, `http` or `https` |
| `OPENTODO_STT_MODEL` | The model name the service expects |
| `OPENTODO_STT_KEY_FILE` | A file holding the key, if the service needs one |

A key typed in Settings is stored in `<data>/secrets/stt.json`. It is never in the database or in backups, and it is never shown again.

## What passes through the server

- A phrase is at most 60 seconds and 5 MB, recorded only while the microphone is on.
- The server holds the audio and the text in memory for the request, with a 30-second timeout. It writes neither to disk, the database, the logs or the audit log.
- Each person can send 30 phrases a minute.
- Requests go only to the configured host, with no redirects.
- For an end-to-end encrypted account, the statement people confirm says that the server and the service can read the phrase while the request runs.

People choose the recogniser per device in **Settings → Capture → Voice capture** ([Voice](../quick-add.md#voice)).

## whisper.cpp instead

Build or download whisper.cpp's server with a model such as `ggml-base.en.bin`, then start it with `whisper-server -m ggml-base.en.bin --host 0.0.0.0 --port 8080 --inference-path /v1/audio/transcriptions`. Use its address and any model name in Settings. whisper.cpp ignores the model name and uses the model it loaded.
