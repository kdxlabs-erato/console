---
"@skillcdn/console": patch
---

A runner that ends by itself, stopped by its service or for an update, no longer counts as delivered what its product had not taken: a signal handed to a product that was still starting, or at a turn, was counted when the runner ended, and the runner started after was never sent it. It is sent again now, and what the product did say it took, as it was being ended too, is delivered once. A supervisor's `restart`, `reset` or `stop` of an agent whose product had taken nothing of its session hands what that product was sent to the session that follows, where it was dropped. A session's record says so in a `status` that names the signals, and no longer shows a first message as read where the product never took it.
