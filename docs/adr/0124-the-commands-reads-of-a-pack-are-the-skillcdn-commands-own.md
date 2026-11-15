# ADR-0124: The command's reads of a pack are the skillcdn command's own

- Status: Accepted
- Date: 2026-11-15
- Supersedes [ADR-0118](0118-the-consoles-reads-of-a-pack-keep-to-the-skillcdn-commands-read-by-read.md) in how the two commands are held equal (its last consequence, a layer kept equal by hand), in point 6 (a skill whole) and in the size of a file's page (point 2). The rest of it stands: which reads there are, how a refused read ends, what is the console's own, the listing made from one answer (point 5). Builds on [ADR-0031](0031-the-console-reads-a-pack-as-the-skillcdn-command-does-and-a-local-one-from-a-directory.md) and [ADR-0001](0001-the-console-is-the-reference-console-built-on-the-published-packages.md). The contract is in [specs/cli.md](../specs/cli.md#commands-for-skills-rules-and-plugins).

## Context

The console's command reads a pack as the `skillcdn` command reads one, and [ADR-0118](0118-the-consoles-reads-of-a-pack-keep-to-the-skillcdn-commands-read-by-read.md) held the two equal read by read. What that command did between a pack and its text was private to it, so the console kept a copy: which reads are joined, the words of a skill that is not there, the line over a code block, the rows as an array, the words of a number out of its range. The decision said the copy would go when the main repository exported the reads, and that a skill in parts, should it come, would come to both commands as one change there.

Both came with SkillCDN 0.5.2. `@skillcdn/cli` has a library entry point, `readPack`, that does one read of a pack handed to it and answers the text, in the caller's words for the reads (its ADR-0110). And that command prints no more than a host shows whole: hosts bound what they show an agent of one command's output, one of them saving anything over 30,000 characters to a file and showing its first two kilobytes, so a read prints at most 28,000 characters, a longer skill in parts, and a page of a file is 24,000 characters ended at a line (its ADR-0108).

The console needed the second as much as the first. Ten skills of the reference pack printed between 31,000 and 77,000 characters through `console skill`, and an agent shown the head of one began with its description and none of its workflow.

## Decision

1. **The command prints a pack with the reads of `@skillcdn/cli`.** It makes a pack of the console's answers, each read asked of the console's API and the pack's own answer taken out of the console's, and hands it to `readPack` with the words of the commands the pack is read with. The copy of that command's layer is gone from the package.
2. **A skill longer than a host shows whole is printed in parts.** `console skill <path>` prints as many of the skill's pages as fit in 28,000 characters; a part says at its head that the skill's context is incomplete, and its last line is the command that prints the next part: the skill as it was named, `--cursor` with the next page's cursor, and `--project`, `--url` and `--account` where they were given, so that the next part is asked as this one was. `--cursor` goes with a skill and never with `--file`. A skill that fits is printed whole, as before.
3. **A page of a file is 24,000 characters, ended at the end of a line,** unless `--limit` says otherwise.
4. **The reads are named by the commands the pack is read with.** A project's pack and the organization's by `console skills` and `console skill`; a plugin's by `console plugin <key> skills` and `console plugin <key> skill`, in everything printed of it: its supporting files, its next part, the words for a skill that is not there. It was the project's commands for every pack but in that last line.
5. **What stays the console's own.**
   - `--json` is the console's answer around the pack's own: the envelope that says where the pack is and how the read went, with what the `skillcdn` command's `--json` prints inside it, a skill whole from `--cursor` on, a file's page as the API gives it.
   - The listing is still made from the one answer the console has about the pack ([ADR-0118](0118-the-consoles-reads-of-a-pack-keep-to-the-skillcdn-commands-read-by-read.md), point 5): the pack made of the console's answers gives it to `readPack` as that command's search without words would, and the console's API still takes no search without words.
   - The words of a pack the console could not read as a whole, with whose token is missing, and the lines around a listing.
   - The commands' own shapes and the checks of what goes with what; exit `1` for a refusal and `2` for a command not understood.
   - A bound of 64 pages on what one command joins, and the line on standard error that says a read of data held nothing.
6. **`@skillcdn/cli` is a dependency of the package.** It is the main repository's own, on the console's line of versions ([ADR-0034](0034-the-package-is-versioned-on-skillcdns-line-one-line-at-a-time-with-a-patch-of-its-own.md)), and only the command imports it: nothing of it is reached from the pages' entry points, so no browser bundle carries it.
7. **No route is added, and none is changed.** The reads go to the routes a console of 0.5.0 has: a skill's page by its cursor, a file's page by its offset and limit. The command of this version reads a pack through a console of 0.5.0 as through its own.

## Consequences

- **A change of the `skillcdn` command's text reaches the console with that package's next version**, and the two cannot drift. A test reads one directory both ways, with that command's reads and through the console, and holds every read equal: the listing, a folder, a search, a skill in its parts, a file in its pages, the tables, the code blocks, a skill that is not there.
- **A long skill costs as many calls as it has parts**, and an agent must read every part before using it; each part ends by saying so. A skill that printed 77,000 characters comes in three parts at the least.
- **`console skill --file` prints 24,000 characters where it printed 40,000**, and a page ends at a line. A script that read 40,000 at a time says `--limit 40000`.
- **Every read begins with what the address serves**, as that command's reads do. The tables and the code blocks as data asked nothing first, and now cost one request more; a pack that is not served says so with the same words as before.
- **The words for a number out of its range are that command's**: `--limit takes an integer between 1 and 200`, without the value after it.
- **An install of the package is larger.** The packed package is 2.3 MB either way. Installed with npm beside React, it was 108 packages and 29.9 MB, and is 118 packages and 40.2 MB: `@skillcdn/cli` declares the packages its own command serves a pack with, which the library entry point does not import and the console's command never loads, and they bring an MCP server library (8.0 MB) and an HTTP framework (1.3 MB). This is said to the main repository as a proposal, a package of the reads alone; until then the install carries them.
- **Rejected:**
  - copying the parts into the console's own layer: a third copy to hold equal, of the text ADR-0118 already could not hold by hand;
  - a route for a search without words, to list a pack as that command lists a directory: several requests through a console that may be far for the answer one gives, and a route a console of 0.5.0 does not have;
  - raising the oldest console the command takes: nothing here needs a console newer than 0.5.0;
  - bundling `@skillcdn/cli` into the package: a copy of the main repository's code in another package's files, which [ADR-0001](0001-the-console-is-the-reference-console-built-on-the-published-packages.md) rules out.
