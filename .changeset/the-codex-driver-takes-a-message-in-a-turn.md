---
"@skillcdn/console": patch
---

Breaking: the `codex` driver of `console runner` speaks to the product's app server, `codex app-server`, one process a session, where it ran `codex exec`, a process a turn (ADR-0153). A message that arrives while a turn runs is put into that turn and read after the step under way, as with Claude Code, and the agent's page says so (`steer: true`): a supervisor's words no longer wait out a long turn. A message is taken when the product says it back, and one that was put into a turn and never read is the next turn's. What the product asks of a person is refused and recorded as a `permission` event.

A desk needs Codex 0.139.0 or later, the first whose app server says a message back under the id it was handed over with: the driver reads the build that answers and starts with no older one, with a line that says why. `runner.json`, the modes, the product's own sign-in and the conversation a desk kept stay as they are. The version an account's page shows is the build that runs, where a conversation says the one that began it. Run with a signed-in Codex 0.171.0-alpha.13.2 on Windows, which is listed as tried: a turn with a command and a file written, a message put into a turn and read in it, and a turn stopped for a message.

The driver reads the product's allowance too: an agent on Codex is told at 80% and at 90% of a window, as one on Claude Code is, and a usage limit is read by the product's own word for it and waited out. The sandbox the product says a conversation runs in is read: one that allows more than the desk's mode is never gone on with, and one that allows less is said where the session starts.

The `acp` driver is as it was. The Agent Client Protocol's version 1 has no message in a turn; what its version 2, a preview, and the adapters offer for one is said in the runner's spec, with why the driver waits for the protocol.
