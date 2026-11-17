---
"@skillcdn/console": patch
---

Breaking: `formatInstant` writes a moment without its year in the year it is, and its hour as the language writes one, never in two digits: "Nov 16, 1:33 PM" where it wrote "Nov 16, 2026, 01:33 PM". It takes the moment it is read at as a third argument, for a test. `Time` writes the same at every precision, and the feed writes its hours as the language does where it wrote a clock of twenty-four. A line of an agent's conversation is read against the line before it: it says its hour alone on the same day, and its day where the day changes (ADR-0135).
