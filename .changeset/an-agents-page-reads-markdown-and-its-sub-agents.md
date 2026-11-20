---
"@skillcdn/console": patch
---

Breaking: an agent account's page reads what the agent said as Markdown, and what its sub-agents did under the call that started each (ADR-0141). What the agent said stood on the page as the characters it was written in, a table as rows of bars and code between its fences; it is now rendered to elements by the component that renders what is written on the board: headings, lists, tables, code, links that open elsewhere, raw HTML as text and never as HTML. A picture named there is not fetched: it is shown as its words, a link to where it is. Two lines with no empty line between them are one paragraph from now on, as Markdown has it. What the agent was told, a thought, a tool's call and what it answered stay text that keeps its spaces and its lines.

A sub-agent's events were shown where they arrived, each with a label, so that three at work made one line of their steps. The call that starts a sub-agent is now its row: what it is called, whether it runs, is done, failed or was stopped with its turn, how many tools it called and how long it ran; opened, what it was started with, what it did, a line each, and what it answered. While a turn is under way the conversation's foot says how many sub-agents are at work, with each under it by its name, what it is at, its count and its time, which the page counts by itself. All of it is read off the record, and a session recorded before reads the same way.

The runner writes one fact more: the `tool_call` that starts a sub-agent carries `starts`, what the call calls the sub-agent, so that a page knows of it before its first event arrives. The `claude` driver says it; the other two say nothing of sub-agents, as before.

`Markdown` takes `picturesAsLinks`, for a text nobody looked at before it is shown: a picture named in it is left a link and nothing is fetched. A language pack of one's own gains `agents.page.live.agent` (`label`, `calls`, `states`, `steps`) and `agents.page.live.working.agents`.
