# ADR-0118: The console's reads of a pack keep to the skillcdn command's, read by read

- Status: Accepted; how the two commands are held equal (the last consequence), a skill whole (point 6) and the size of a file's page (point 2) are superseded by [ADR-0124](0124-the-commands-reads-of-a-pack-are-the-skillcdn-commands-own.md), by which the command's reads are the skillcdn command's own
- Date: 2026-11-15
- Amends [ADR-0031](0031-the-console-reads-a-pack-as-the-skillcdn-command-does-and-a-local-one-from-a-directory.md), point 5: which reads the command joins, and how a refused read ends. The contract is in [specs/cli.md](../specs/cli.md#commands-for-skills-rules-and-plugins).

## Context

The console reads a pack as the `skillcdn` command reads one ([ADR-0031](0031-the-console-reads-a-pack-as-the-skillcdn-command-does-and-a-local-one-from-a-directory.md)): the same reads, answered in the shapes of `@skillcdn/core` and rendered by its renderers, so that an agent reads the same text through the console, through that command and over MCP. Point 5 had the console's command join the pages every read came in.

The `skillcdn` command has since settled otherwise for two of them. It reads a file a page at a time, 40,000 characters unless told, and says where the next page begins; it browses a folder a page at a time, 50 entries unless told, and names the cursor that continues it. The console's command followed the cursors itself and printed the whole: a README of 44,000 characters came back in one answer where the other command gave a page and an offset, and a folder of any size came back whole. An agent that had learned one command met another behaviour in the other, and what was spent on a file was not what the pack's own tools would have spent.

They had drifted in smaller things too, each found by running both against one pack. A read the pack refused was printed by the console as if it were the read, with exit `0`, where the other command ends with the refusal on standard error; its words for a skill that is not there named a private pack and a token, which sent an agent to mend a pack that had just answered. The code blocks were printed under a line of another shape; the tables had no `--format json` and the blocks no `--grep`; a search took its folder after the words only; the listing did not mark a folder's README as its overview.

## Decision

1. **Where the two commands read the same thing, the console's does what the `skillcdn` command does**: the same pages and the same defaults, the same bounds, the same flags, the same words. What `@skillcdn/core` exports is used, never copied: the renderers, the limits, the joining of a skill's pages. What that command words for itself and does not export, the console words the same.
2. **The reads, one by one.**

   | Read | `skillcdn` | `console` | What the console does |
   |---|---|---|---|
   | The listing | `skills` | `skills` | What a client is told on connect, then every skill and document as a search without words lists them, a folder's README marked as its overview |
   | A folder, or a file's outline | `browse [<folder>] [--cursor] [--limit]` | `skills <folder\|file> [--cursor] [--limit]` | One page, 50 entries unless `--limit` (up to 200); a page that ends early names its `nextCursor` |
   | Words | `find <words> [--path] [--cursor] [--limit]` | `skills --search <words> [<folder>\|--path <folder>] [--cursor] [--limit]` | One page, 10 results unless `--limit` (up to 25) |
   | A skill | `skill <path>` | `skill <path>` | Whole, the pages it came in joined; one that is not there is said in that command's words, with the skills there are |
   | A file | `file <path> [--offset] [--limit]` | `skill --file <path> [--offset] [--limit]` | One page, 40,000 characters unless `--limit` (up to 100,000); a page that ends early says where the next begins |
   | The tables | `rows [<path>] [--heading] [--format csv\|json] [--out]` | `skills --rows [<path>] [--heading] [--format csv\|json] [--out]` | Every page joined; one CSV, or an array of rows; `--out` says how much was written |
   | The code blocks | `code [<path>] [--heading] [--grep] [--out]` | `skills --code [<path>] [--heading] [--grep] [--out]` | Every page joined; each block under `--- <path> > <heading> (<language>) ---` |

3. **A read the pack refused ends the command as refused**, the listing too: exit `1`, the refusal on standard error, nothing printed as if it were the pack. For one read, a path with nothing at it or a read asked wrong, the words are the pack's own code and message, as the `skillcdn` command prints them. For the pack as a whole, they are the console's: where the pack is, how it stands, and whose token is missing, since the pack is a project's or the organization's and its token is the console's to hold. The pack's code tells the two apart.
4. **What stays the console's own, on purpose.** The commands' names where they are other commands by design, `skills --search` for `find`, `skill --file` for `file`, `skills --rows` and `skills --code` for `rows` and `code`, and the folder of a search after the words as well as with `--path`. The lines of its own around a listing: where the pack is and how it stands, where a person connects an agent of their own, where the console's own skills are, how a skill is loaded, where the plugins' skills are; and the line that says the pack is the organization's ([ADR-0113](0113-the-organizations-pack-is-read-where-no-project-is-named-by-every-member.md)). Its own exit codes: `1` for a refusal and `2` for a command not understood, where the other command says `1` or `2` and `64`. `--json`, which is the console's answer around the pack's. And a bound on what one command joins: 64 pages of a skill, of tables or of code blocks, where the other command follows a pack to its end.
5. **The listing is built from what the pack says of itself in one answer**, since the console's API takes no search without words: the same lines, with a folder's README marked by the rule `@skillcdn/core` exports. A document made from others is marked so in a search and not in the listing.
6. **A skill stays whole in both commands.** A page of a skill with a continuation, should it come, comes to both as one change of the main repository.

## Consequences

- An agent reads a pack the same way with either command: the same pages, the same words, the same next step. What it learned of one holds for the other, and the pack's own pages on how it is read hold for both.
- A large file costs a page, not itself: `console skill --file` prints 40,000 characters and where the next begins, where it printed the file whole. A script that took a whole file through the command reads on from the offset the page names, or takes the tables and the code blocks as data, which are still joined.
- A refused read no longer ends well. A script or an agent that read exit `0` after a read the pack refused, and the status in what was printed, reads the exit code now; `--json` still prints the console's answer, which says the status.
- The console keeps a layer of its own over these reads, which this decision holds equal by hand: the flags and their bounds, the joining of the tables and the code blocks, the line a block stands under, the rows as an array, the words for a skill that is not there, how much a file written holds. It goes when the main repository exports the reads of its command over a pack given to it, with the names of the reads; until then a change there is a change here, in the same release.
- Rejected: keeping the pages joined and saying so (two commands that read one pack two ways, and the dearer one through the console); joining only up to a size (a third behaviour); reading a search without words through the console for the listing (several requests for the answer one gives, through a console that may be far, for one mark); the other command's exit codes (`64` and `78` mean nothing among the console's, which every other command of it keeps).
