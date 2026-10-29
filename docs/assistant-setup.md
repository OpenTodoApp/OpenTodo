---
title: Set up the assistant
summary: For the server owner, allow one or more model providers, enter models and keys, test the connection and turn the assistant on for everyone.
audience: user
section: Guides
specs: []
screens: []
order: 81
---
# Set up the assistant

<picture><source srcset="images/assistant-settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-settings-light.webp" alt="Settings, Integrations, the Assistant card as the owner sees it: whether the assistant is on, the provider and model everyone uses, the monthly limit and the Configure button."></picture>

The [assistant](assistant.md) is off until the server owner turns it on here. Members' own settings are described in [Assistant settings](assistant-settings.md); the owner's further choices in [Assistant owner options](assistant-owner-options.md).

## Turn it on

**Settings → Integrations → Assistant** shows the owner whether the assistant is on, the provider and model everyone uses, the providers allowed (flagging one without a key), the monthly limit and whether members may bring their own key. Select **Configure** (owner only) to change them:

1. Tick **Allow this provider** for one or more providers and enter the model and key.
2. Choose the **Provider everyone uses**.
3. Tick **Turn on the assistant for this server** and select **Save assistant settings**. The dialog closes and the section shows the new state.
4. In **Configure**, select **Test connection** under a provider: it sends one tiny request with the model, base URL and key you see on screen, saved or not, and reports success or the provider's error. Testing never saves anything; a passing test of unsaved values says so, and you still select **Save**. It is the only request the server makes outside someone's turn.

| Provider | Model | Key | Notes |
| --- | --- | --- | --- |
| Anthropic (Claude) | `claude-opus-5-5` by default; `claude-sonnet-5-5` and `claude-haiku-5-5` are offered, any model id can be typed | An Anthropic API key | Uses the official Anthropic Go SDK and the Messages API |
| OpenAI | Any chat model id from your account | An OpenAI API key | Chat Completions at `api.openai.com` |
| Google Gemini | Any Gemini model id | A Gemini API key | Google's OpenAI-compatible endpoint on `generativelanguage.googleapis.com` |
| Compatible endpoint | The model name your server serves | Optional | Ollama, LM Studio, OpenRouter, Mistral and others; enter the base URL, for example `http://192.168.1.20:11434/v1` |

The model must support tool use. **Test connection** reports an endpoint that rejects tool definitions as `no_tool_support`. A model on your own network is set up as a compatible endpoint; see [A local model](assistant-owner-options.md#a-local-model).

## When Test connection fails

The result names the problem with a code; the provider's own error text is never shown.

| Code | What to check |
| --- | --- |
| `provider_auth` | The key. Google Gemini reports a wrong key as HTTP 400, which OpenTodo reads as a rejected key too. |
| `provider_not_found` | The provider's own 404, not OpenTodo's: check the model id and, for a compatible endpoint, the base URL, which usually ends in `/v1`. |
| `no_tool_support` | Choose a model that supports tool use. |

A compatible base URL pasted with `/chat/completions` at the end is shortened to its base when you test or save it; OpenTodo adds that path itself. If the test says the request never reached the provider, see [Behind a reverse proxy](self-hosting/docker.md#method-not-allowed-or-unknown-api-route-from-a-test-or-save).

Changing the provider asks everyone to accept the disclosure again. Where keys are stored, and the switches for members' own keys and the monthly allowance, are in [Assistant owner options](assistant-owner-options.md#other-settings).

Network details for operators are in [Running with Docker](self-hosting/docker.md#in-app-assistant); the routes are in the [API reference](api.md#in-app-assistant).
