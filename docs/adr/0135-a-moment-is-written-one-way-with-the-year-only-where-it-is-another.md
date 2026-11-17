# ADR-0135: A moment is written one way, with the year only where it is another

- Status: Accepted
- Date: 2026-11-17

## Context

The pages wrote a moment three ways. `formatInstant`, and `Time` through it, wrote the year always and the hour in two digits: "Nov 16, 2026, 01:33 PM". `Time` at the precision `clock` left the year out and kept the two digits: "Nov 16, 01:33 PM". The feed wrote its hours on a clock of twenty-four whatever the language: "13:33". A page that shows a decision waiting beside the record of the answered ones showed two of the three side by side. A day alone was already written without the year in the year it is (`formatDay`), so a moment and a day of the same page disagreed about the year too. And an hour in two digits is how neither language the pages speak writes one beside a word for the half of the day: "01:33 PM".

In a conversation with an agent every line carried its day, since a line was read against today: a session of yesterday said "Nov 16" on each of its lines.

## Decision

1. **A moment is the day and the time of day, the year with them only where it is not this year's**, as `formatDay` writes a day: "Nov 16, 1:33 PM", and "Nov 16, 2025, 1:33 PM" a year on.
2. **The hour is written as the language writes one** (`hour: "numeric"`), the minute in two digits. Whether the clock is of twelve or twenty-four is the language's, on every page, the feed included.
3. **A line of a conversation is read against the line before it**: it says its hour alone where that line is of the same day, and its day where the day changes. The first line is read against today. The whole moment stays in the title of each.
4. **A plugin's pages write a moment the same way.** A plugin formats its own moments; the reference plugins write theirs to this rule.

## Consequences

- `formatInstant(iso, language)` answers another string than it did, and takes the moment it is read at as a third argument, for a test: a patch whose entry says so first.
- A page reads a moment of this year without its year. A moment a year old says its year, so nothing is read as this year's that is not.
- A stretch of days (`formatDays`) is unchanged: it says the year, since a plan is read months ahead.
- Rejected: the year always (four more digits on every row of every log, for the year everyone is in); a clock of twenty-four on every page (not how Korean or English is written beside the pages' other words); a relative moment, "three hours ago" (a page left open goes stale, and a record wants the moment).
