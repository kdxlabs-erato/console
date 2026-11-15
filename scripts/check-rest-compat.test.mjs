// The comparison of scripts/check-rest-compat.mjs, held both ways (ADR-0043): what an older
// command reads and sends of a console of now, and what this command reads of a console of
// before. Run with Node's own runner, as part of `pnpm check`; needs no build.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
// biome-ignore lint/correctness/useImportExtensions: the module beside this one is .mjs, as every script here is
import { breaksOf } from "./check-rest-compat.mjs";

/** An object as z.toJSONSchema writes one: its fields, and those always there. */
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const text = { type: "string" };
const RUN = object({ id: text, status: { type: "string", enum: ["open", "finished"] } });

/** What a schema of now breaks of the snapshot's, as the check says it. */
function breaks(before, after, io = "output") {
  const found = [];
  breaksOf(before, after, io, "restRunSchema", found);
  return found;
}

describe("an answer as this command reads it of a console of before", () => {
  it("fails on a field added as required, which a console of before does not send", () => {
    const after = object({ ...RUN.properties, summary: text });
    assert.deepEqual(breaks(RUN, after), [
      "restRunSchema.summary: added as required, which a console of before does not send",
    ]);
  });

  it("fails on a field that was there and not always, required now", () => {
    const before = object({ ...RUN.properties, summary: text }, ["id", "status"]);
    const after = object({ ...RUN.properties, summary: text });
    assert.deepEqual(breaks(before, after), [
      "restRunSchema.summary: required now, which a console of before may leave out",
    ]);
  });

  it("passes a field added as optional, or with a default that fills it where it is not sent", () => {
    assert.deepEqual(
      breaks(RUN, object({ ...RUN.properties, summary: text }, ["id", "status"])),
      [],
    );
    const filled = object({
      ...RUN.properties,
      files: { default: [], type: "array", items: text },
    });
    assert.deepEqual(breaks(RUN, filled), []);
  });

  it("finds the field where it is, in a list, a field of a field and a record", () => {
    const runs = (run) => object({ items: { type: "array", items: run } });
    assert.deepEqual(breaks(runs(RUN), runs(object({ ...RUN.properties, summary: text }))), [
      "restRunSchema.items[].summary: added as required, which a console of before does not send",
    ]);
    // A field of an optional field: where a console of before sends the field, it sends it so.
    const holding = (task) => object({ id: text, task }, ["id"]);
    assert.deepEqual(breaks(holding(RUN), holding(object({ ...RUN.properties, title: text }))), [
      "restRunSchema.task.title: added as required, which a console of before does not send",
    ]);
    const record = (value) => ({
      type: "object",
      propertyNames: text,
      additionalProperties: value,
    });
    assert.deepEqual(breaks(record(RUN), record(object({ ...RUN.properties, title: text }))), [
      "restRunSchema[*].title: added as required, which a console of before does not send",
    ]);
    // A field added as optional holds nothing of what it carries: no console of before sends it.
    assert.deepEqual(breaks(RUN, object({ ...RUN.properties, task: RUN }, ["id", "status"])), []);
  });

  it("holds a member of a union to the member it was, and says the field, not a member added", () => {
    const member = (kind, more = {}) => object({ kind: { type: "string", const: kind }, ...more });
    const before = { anyOf: [member("task.created"), member("run.ended")] };
    const after = { anyOf: [member("task.created"), member("run.ended", { status: text })] };
    assert.deepEqual(breaks(before, after), [
      "restRunSchema.status: added as required, which a console of before does not send",
    ]);
    // An optional field more, as before: the member it was, and nothing to say.
    const optional = {
      anyOf: [
        member("task.created"),
        object({ ...member("run.ended").properties, status: text }, ["kind"]),
      ],
    };
    assert.deepEqual(breaks(before, optional), []);
    // A member of another kind is still a member added, which a reader of before refuses.
    const added = { anyOf: [...before.anyOf, member("run.taken_over")] };
    assert.deepEqual(breaks(before, added), [
      "restRunSchema: a member of the union was added, which a reader of before refuses",
    ]);
  });
});

describe("what an older command reads and sends, as before", () => {
  it("fails on a field of an answer removed or no longer always there", () => {
    assert.deepEqual(breaks(RUN, object({ id: text })), ["restRunSchema.status: removed"]);
    assert.deepEqual(breaks(RUN, object(RUN.properties, ["id"])), [
      "restRunSchema.status: no longer always there, which a reader of before expects",
    ]);
  });

  it("fails on what is sent becoming required, and holds nothing of an input's answer side", () => {
    const input = object({ title: text, summary: text }, ["title"]);
    assert.deepEqual(breaks(input, object(input.properties), "input"), [
      "restRunSchema.summary: required now, which a sender of before leaves out",
    ]);
    assert.deepEqual(
      breaks(input, object({ ...input.properties, plan: text }, ["title", "plan"]), "input"),
      ["restRunSchema.plan: added as required, which a sender of before leaves out"],
    );
    // A field the console takes now and need not be sent passes, as an addition.
    assert.deepEqual(
      breaks(input, object({ ...input.properties, plan: text }, ["title"]), "input"),
      [],
    );
  });
});
