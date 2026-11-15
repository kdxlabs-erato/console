---
"@skillcdn/console": patch
---

An agent's conversation draws one line for an event that arrives, however long the session is. Every line of the session was drawn again on each event, so a session of a few thousand events slowed with every step the agent took; a line is now drawn again only when its own events, its own text read whole, its files or the day changed.
