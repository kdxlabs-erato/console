---
"@skillcdn/console": patch
---

The packages are taken at SkillCDN 0.6.2, and the command prints a pack as that release's `skillcdn` command does.

- **A part of a skill ends in the `skillcdn` command's own words**, and the console adds none after them: that the part ends before the skill does, how many pages follow it where the pack counts them, that the skill is read on from now, and, alone on the last line, the command that prints the next part. The last part ends with `Skill context is complete: this was its last part.` The two sentences the console wrote after a part (`This part stops in the middle of the skill …`, `The skill is complete …`) are gone, since the library now says the same: with both, every part said it twice.
- **Every read keeps within 28,000 bytes**, the console's own lines counted, where a part of a skill was bounded in characters and the other reads not at all. A skill in Hangul was printed in parts of some 49,000 bytes, which one host saved to a file and another cut in the middle.
- **`console skills` prints a long listing in pages**, as `console plugin <key> skills` does: the first page has the console's own lines above the listing and ends with `The listing goes on: console skills --cursor <cursor>`, and the last says that it is the last. A listing that fits one read is printed as before, and `--json` is the whole listing either way.
- `@hono/node-server` is asked for at `^2.1.11`, the release that carries two security fixes of the adapter's `websocket` option. The console does not turn that option on, so nothing changes in how it answers; the image carries no version an advisory names.
