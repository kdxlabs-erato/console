# ADR-0130: The REST check holds an answer to what a console of before sends

- Status: Accepted
- Date: 2026-11-16
- Amends [ADR-0043](0043-the-rest-contract-is-held-to-a-snapshot-taken-at-the-floors.md), point 2 (what breaks), which stands otherwise, as do its points 1, 3 and 4. Reads the floors as [ADR-0038](0038-the-command-and-the-console-go-together-within-a-line-and-a-release-that-changes-what-passes-between-them-raises-the-floors.md) has them.

## Context

`pnpm check` compares the REST schemas as built with the snapshot taken at the floors as an older command reads and sends them: the console's floor on the command, `CLIENT_POLICY.atLeast` (ADR-0043). The command's floor on the console, `CONSOLE_AT_LEAST`, it left to the author's care. One break of that side is in the schemas all the same: a field an answer must now carry. The command parses what a console answers with its own schema, and a console at the floor answers as the snapshot has it; a field required now that the snapshot does not have, or not always, fails the command on every such answer. Within a line the command meets older consoles as a matter of course, a release's command on the consoles of the release before until their operators move them, and an answer's new fields were read as optional by care alone; a field added as required passed the check.

## Decision

1. **An answer is held both ways.** Besides what ADR-0043 lists, an answer breaks where a field is required now, with no default to fill it where it is not sent, that the snapshot does not have or has as optional: at whatever depth a console of before sends it, a field of a list's items, of another field, of a record's values or of a union's member. The check names it, `added as required, which a console of before does not send` or `required now, which a console of before may leave out`, and says what to do: raise `CONSOLE_AT_LEAST` to the version the pending changesets make, with a changeset that begins with `Breaking:`, and take the snapshot again; or read the field as optional.
2. **A union's members are matched as before.** A member that only gained a field is still the member it was to an older reader (ADR-0043); held the other way it is compared with that member, so that a field it requires now is named as the field, not as a member added.
3. **A field added as optional is not looked into.** No console of before sends it, so nothing it carries is required of one.
4. **The comparison is tested.** `scripts/check-rest-compat.test.mjs` holds both ways on schemas of its own, with Node's own runner, which the repository's root has without a dependency; it needs no build and runs in `pnpm check` and `pnpm check:rest`. The script lends it the comparison and checks only when it is run.

## Consequences

- A field an answer must carry now fails `pnpm check` with its path named, instead of failing the command of the coming release on every console that has not moved yet.
- The rest of the command's floor stays the author's care, as ADR-0043, point 4, has it: a route or a field of a request the command relies on the console having, and an answer of before that the command's schema refuses now for another reason, a value of an enum or a member of a union taken out, a bound narrowed, null no longer taken. None was seen to happen; the required field was, and is held.
- The snapshot stands for a console at the floor because it is taken again when a floor moves. One taken again with `CLIENT_POLICY.atLeast` raised and `CONSOLE_AT_LEAST` left lower holds the answers of a console later than that floor, and a field required since is not caught; such a change says so in its review.
- Rejected: a mark in the snapshot of the version each field came with (the snapshot is of shapes, and the floors say the versions); a test of the script through a snapshot written for it (it needs the build, and says less than the comparison held on schemas made for each case).
