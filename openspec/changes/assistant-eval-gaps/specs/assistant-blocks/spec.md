# Spec Delta

## ADDED Requirements

### Requirement: Answers are words first
In a chat turn, on the server and on the device, the text a round writes after tool calls SHALL start a new paragraph when the text before it did not end one. A `show_tasks` call that names one live task SHALL show nothing and SHALL answer with that task's id and a message to name it as a link; a routine's AI step SHALL keep showing it. A `suggest_followups` call before the answer has any text SHALL show the follow-ups and SHALL answer that the answer still needs words. The instructions SHALL say that blocks and follow-ups never replace the answer, that the answer says so when nothing is found, and that text written before a tool call is not repeated after it. Nothing is stored, so there is no offline or convergence behaviour.

#### Scenario: One task today
- **WHEN** the model writes "Today you only have one task:" and calls `show_tasks` with that task
- **THEN** no block is shown, the result names the task's id, and the model's next text follows on a new paragraph

#### Scenario: Follow-ups alone
- **WHEN** the model calls `suggest_followups` before writing any text
- **THEN** the follow-ups are shown and the result asks for the answer in words
