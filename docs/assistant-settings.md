---
title: Assistant settings
summary: Your part of Settings → Integrations → Assistant, using your own Anthropic, OpenAI or Gemini key instead of the server's, and letting small changes skip the review.
audience: user
section: Guides
specs: []
screens: [settings/assistant]
order: 79
---
# Assistant settings

<picture><source srcset="images/assistant-settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/assistant-settings-light.webp" alt="Settings, Integrations, the Assistant card: the provider and model in use, this month's usage, and the switch Small changes without review."></picture>

**Settings → Integrations → Assistant** holds your consent, which assistant you use, this month's usage, **Small changes without review** (this device) and **Clear conversations on this device**, which are stored only on this device. The owner's part of the card is described in [Set up the assistant](assistant-setup.md).

## Use your own provider and key

When the server owner turns on **Let members bring their own key**, **Settings → Integrations → Assistant** shows **Which assistant you use**:

- **The server's assistant**: the provider and model the owner set up. This is the default.
- **My own provider and key**: choose **Anthropic (Claude)**, **OpenAI** or **Google Gemini**, a model, and paste an API key from your own account, then select **Save my provider**. For Anthropic you pick one of the offered models; for OpenAI and Gemini you type the model id (up to 100 characters: letters, digits, `.`, `_`, `:` and `-`, for example `gpt-4.1-mini` or `gemini-2.5-flash`). **Test connection** sends one tiny request with the provider, model and key on screen to check them, before or after you save (up to 5 tests in 10 minutes). Testing never saves anything.

Your questions then go from this server to the provider you chose, with your key, so that provider's terms for your account apply. The assistant asks you to accept the [disclosure](assistant-privacy.md#before-your-first-message) for that provider before your next message. Your key is stored on the server, never shown again, never sent to your browser and never in backups or exports. Going back to **The server's assistant** deletes the key you stored for your provider.

A compatible endpoint (a model server address) is never offered here: only the server owner decides which other machines the server connects to.

If the owner later stops allowing members' own keys, your choice is kept but not used: the server's assistant answers (after you accept its disclosure) until the owner allows it again. **Forget my provider and key** deletes both.

If you saved a key in an earlier version of OpenTodo, it still works with the server's assistant; **Remove my key** deletes it.

Answers on your own key are paid by you; how they count is explained under [Costs and limits](assistant-privacy.md#costs-and-limits).

## Apply small changes without review

The switch **Settings → Integrations → Assistant → Small changes without review** (this device) is off by default. When it is on, a proposal that touches at most 3 existing tasks and only changes completion, due dates, priority or labels is applied at once, with an Undo notice. Anything else, including every new task, every move to another project or section, every deletion and every text edit, is always shown for [review](assistant-ask.md#ask-and-review).

## Suggest after adding

The switch **Settings → Integrations → Assistant → Suggest after adding** (this device) is off by default. When it is on and the assistant is available to you, a task you add from a quick-add line (a list's line, the add bar or palette, the phone's add sheet) opens the assistant with one question about that task: a clearer title only if it helps, the project only if clearly better, and at most four subtasks if the task is really several steps. You review the proposal like any other: uncheck what you don't want, then **Apply**, and **Undo** puts it back. Nothing changes before you apply, no date is invented, and tasks that arrive by import, the API, CalDAV, email or another device are never asked about. Each suggestion is one assistant turn, so it counts toward the monthly limit.
