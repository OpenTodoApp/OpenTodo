## MODIFIED Requirements

### Requirement: Model response checks
Before using a model response, the server SHALL check the stop reason: tool use continues the loop, a refusal SHALL show "The model declined this request." with no partial content and no change set, and truncation SHALL mark the answer as cut off without proposing changes. A turn SHALL run at most 12 model calls; a tool-use answer on the 12th call SHALL end it with stop reason `round_limit` and no change set, while an `end_turn` on the 12th call SHALL keep the change set it planned. For Anthropic it SHALL use `tool_choice` auto, adaptive thinking and streaming, and SHALL mark the tools strict only when the request's whole tool set fits Anthropic's strict limits (at most 20 tools and 24 optional parameters across their schemas); a larger set SHALL be sent with the same schemas, not strict, and the registry SHALL validate every call's arguments either way. A turn the provider refuses SHALL be logged on the server with the provider's status and error type, never the provider's text.

#### Scenario: Refusal
- **WHEN** the provider ends a turn with stop reason `refusal`
- **THEN** the panel shows the refusal message, no partial text, no change set, and usage is still counted

#### Scenario: Truncated answer
- **WHEN** a turn ends with stop reason `max_tokens`
- **THEN** the answer is marked as cut off and no change set is proposed

#### Scenario: Provider key rejected
- **WHEN** the provider answers that the key is invalid
- **THEN** the turn ends with error `provider_auth`, the owner is pointed to Settings, and no key appears in the message

#### Scenario: A long multi-step request finishes
- **WHEN** a task needs several tool rounds and the model stops with `end_turn` on the 12th model call
- **THEN** the turn ends with the change set it planned, not `round_limit`

#### Scenario: The budget is reached
- **WHEN** the model calls a tool on the 12th model call
- **THEN** the turn ends with `round_limit`, no tool results are sent and no change set is proposed

#### Scenario: A single call over the registry's own per-call limit
- **WHEN** one `schedule_tasks` call names 70 tasks
- **THEN** the tool answers a tool error and the turn does not write from it

#### Scenario: More tools than Anthropic allows strict
- **WHEN** an in-app turn with Anthropic offers 32 tools
- **THEN** the request carries them without strict mode and the turn is answered

#### Scenario: A small tool set stays strict
- **WHEN** a request offers at most 20 tools with at most 24 optional parameters in all
- **THEN** every tool is marked strict

### Requirement: Provider requests from the device
The device SHALL call only the provider set up on it: Anthropic's Messages API with the browser access header, `tool_choice` auto and adaptive thinking, its tools strict only within Anthropic's strict limits as on the server; OpenAI, Google Gemini and model servers through the Chat Completions format with streaming. A request blocked by the page's policy or by the provider's cross-origin rules SHALL be reported as such, saying to reload the page when the owner allowed the provider a moment ago, and a rejected key SHALL be reported as the device's key being rejected, without the key in the message.

#### Scenario: Only the chosen provider
- **WHEN** a device set up with OpenAI runs a turn while its network is inspected
- **THEN** the turn's requests go to the OpenAI host only, carry the user's key, and none goes to the OpenTodo server

#### Scenario: Rejected key
- **WHEN** the provider answers 401
- **THEN** the answer says the provider rejected the key saved on this device and points to the device settings

#### Scenario: The device's tools exceed the strict limits
- **WHEN** a device set up with Anthropic offers its 15 tools with 47 optional parameters
- **THEN** the request carries them without strict mode
