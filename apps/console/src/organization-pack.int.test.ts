import {
  projectPath,
  REST_ROUTES,
  restErrorSchema,
  restPeopleSchema,
  restProjectsSchema,
  restSkillBrowseSchema,
  restSkillCodeSchema,
  restSkillFileSchema,
  restSkillFindSchema,
  restSkillLoadSchema,
  restSkillRowsSchema,
  restSkillsSchema,
  restTokenCreatedSchema,
} from "@skillcdn/console/api";
import { type Address, formatAddress, type RestMount, type RestSkill } from "@skillcdn/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, DEV_DATABASE_URL, type TestDatabase } from "./db/testing.js";
import { type Pack, PackError, type PackSource } from "./ports/skill-source.js";
import { createFixtureProvider } from "./testing/fixture-provider.js";
import { createHarness, type Harness, SIGN_IN_URL } from "./testing/harness.js";

// The organization's pack, read where no project is named (ADR-0113): the reads of a project's
// pack under /api/v1/workspace/skills, for every member of the workspace. In a database of its
// own, where the one project is private, so that a member in no project is really in none.

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const ORG = REST_ROUTES.workspaceSkills;
const JSON_HEADERS = { origin: SIGN_IN_URL, "content-type": "application/json" };

function mountOf(address: Address): RestMount {
  return {
    address: formatAddress(address),
    repository: {
      host: address.host,
      owner: address.owner,
      name: address.repo,
      defaultBranch: "main",
      description: null,
      avatar: "https://avatars.example/acme.png",
    },
    ref: address.ref?.kind === "name" ? address.ref.name : null,
    pinned: false,
    commit: COMMIT,
    path: address.path,
    verified: false,
    image: null,
    index: {
      status: "ready",
      truncated: false,
      manifest: null,
      skillCount: 1,
      documentCount: 0,
      skills: [
        {
          path: "review/SKILL.md",
          name: "review",
          directory: "review",
          description: "Reviews a change.",
          warnings: [],
          translations: {},
        },
      ],
      documents: [],
      diagnostics: [],
    },
  };
}

const SKILL: RestSkill = {
  status: "ready",
  commit: COMMIT,
  skill: {
    path: "review/SKILL.md",
    ruleChain: [{ path: "SKILLCDN.md", body: "Be kind.", truncated: false }],
    references: [],
    complete: true,
    nextCursor: null,
    includedContents: [],
    name: "review",
    directory: "review",
    description: "Reviews a change.",
    license: "MIT",
    compatibility: null,
    allowedTools: null,
    metadata: {},
    body: "Read the diff.",
    files: ["review/guide.md"],
    filesTruncated: false,
    included: [],
    warnings: [],
    translations: {},
    rules: { path: "SKILLCDN.md", body: "Be kind.", truncated: false },
  },
};

/** The pack's reads as they were asked, with the token each was asked with. */
const tokens: (string | undefined)[] = [];
const asked: string[] = [];
const source: PackSource = {
  open(address, token): Pack {
    tokens.push(token);
    // A private pack: nothing is served to whoever comes without the workspace's token.
    const held = (): void => {
      if (token !== "scdn_repo_org") {
        throw new PackError(404, "repo.not_found", "Nothing is served here to the asker.");
      }
    };
    return {
      address,
      location: { kind: "deployment", url: "https://skillcdn.test" },
      async mount() {
        held();
        return mountOf(address);
      },
      async skill(path) {
        held();
        asked.push(`skill ${path}`);
        if (path !== "review/SKILL.md") {
          throw new PackError(404, "skill.not_found", "No skill at that SKILL.md path.");
        }
        return SKILL;
      },
      async file(query) {
        held();
        asked.push(`file ${query.path}`);
        return {
          kind: "file",
          commit: COMMIT,
          path: query.path,
          content: "How to review.",
          offset: query.offset ?? 0,
          nextOffset: null,
          totalLength: 14,
        };
      },
      async browse(query) {
        held();
        asked.push(`browse ${query.path ?? ""}`);
        // A document's outline, with the deployment's own address for its data.
        return {
          status: "ready",
          commit: COMMIT,
          path: query.path ?? "",
          entries: [],
          nextCursor: null,
          outline: {
            path: query.path ?? "",
            size: 400,
            totalLength: 400,
            headings: [],
            truncated: false,
            tables: { count: 1, rows: 2 },
            codeBlocks: 1,
            data: {
              rows: "https://skillcdn.test/api/v1/rows/gh/acme/skills?path=review/codes.md",
              code: "https://skillcdn.test/api/v1/code/gh/acme/skills?path=review/codes.md",
            },
          },
        };
      },
      async find(query) {
        held();
        asked.push("find");
        return {
          status: "ready",
          commit: COMMIT,
          query: query.query ?? null,
          path: query.path,
          items: [],
          nextCursor: null,
          totals: null,
        };
      },
      async rows(query) {
        held();
        asked.push(`rows ${query.path ?? ""}`);
        return {
          status: "ready",
          commit: COMMIT,
          path: query.path ?? "",
          tables: [
            { path: "review/codes.md", heading: ["Codes"], columns: ["Code"], rows: [["R1"]] },
          ],
          rowCount: 1,
          nextCursor: null,
        };
      },
      async code(query) {
        held();
        asked.push(`code ${query.path ?? ""}`);
        return {
          status: "ready",
          commit: COMMIT,
          path: query.path ?? "",
          blocks: [
            { path: "review/codes.md", heading: ["Codes"], language: "sh", text: "pnpm check\n" },
          ],
          nextCursor: null,
        };
      },
    };
  },
};

let testDatabase: TestDatabase;
let h: Harness;
let admin: string;
let member: string;
let apart: string;

beforeAll(async () => {
  testDatabase = await createTestDatabase(process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL);
  h = createHarness(testDatabase, {
    providers: [createFixtureProvider()],
    admins: ["alice"],
    skills: { address: "/gh/Acme/skills", source },
  });
  admin = await h.signIn("alice");
  member = await h.signIn("bob");
  apart = await h.signIn("carol");
  // The one project is private and Alice's alone, with a pack of its own.
  await h.project(admin, {
    key: "closed",
    name: "Closed",
    visibility: "private",
    skillsAddress: "/gh/acme/closed",
  });
  const set = await h.request(REST_ROUTES.workspacePackToken, {
    method: "PUT",
    headers: { cookie: admin, ...JSON_HEADERS },
    body: JSON.stringify({ token: "scdn_repo_org" }),
  });
  expect(set.status).toBe(200);
});

afterAll(async () => {
  await h?.close();
  await testDatabase?.drop();
});

const get = (path: string, headers: Record<string, string>) => h.request(path, { headers });
const codeOf = async (response: Response) =>
  restErrorSchema.parse(await response.json()).error.code;

describe("the organization's pack, read where no project is named (ADR-0113)", () => {
  it("is read by every member of the workspace, one in no project too, with the workspace's token", async () => {
    // Carol is in no project: the one there is, is private and not hers.
    const hers = restProjectsSchema.parse(
      await (await get(REST_ROUTES.projects, { cookie: apart })).json(),
    );
    expect(hers.items).toEqual([]);
    expect((await get(projectPath("closed", "skills"), { cookie: apart })).status).toBe(404);

    tokens.length = 0;
    asked.length = 0;
    const headers = { cookie: apart };
    const listed = restSkillsSchema.parse(await (await get(ORG, headers)).json());
    expect(listed).toMatchObject({
      address: "/gh/acme/skills",
      source: "https://skillcdn.test",
      page: "https://skillcdn.test/gh/acme/skills",
      status: "ready",
      refusal: null,
    });
    expect(listed.items.map((item) => item.path)).toEqual(["review/SKILL.md"]);
    // Every read of a project's pack has its twin, answered in the same envelope.
    const one = restSkillLoadSchema.parse(
      await (await get(`${ORG}/one?path=review%2FSKILL.md`, headers)).json(),
    );
    expect(one.read?.status === "ready" ? one.read.skill.body : undefined).toBe("Read the diff.");
    const file = restSkillFileSchema.parse(
      await (await get(`${ORG}/file?path=review%2Fguide.md`, headers)).json(),
    );
    expect(file.read).toMatchObject({ kind: "file", content: "How to review." });
    const found = restSkillFindSchema.parse(
      await (await get(`${ORG}/find?query=review&limit=5`, headers)).json(),
    );
    expect(found.status).toBe("ready");
    const rows = restSkillRowsSchema.parse(
      await (await get(`${ORG}/rows?path=review%2Fcodes.md`, headers)).json(),
    );
    expect(rows.read?.status === "ready" ? rows.read.rowCount : undefined).toBe(1);
    const code = restSkillCodeSchema.parse(
      await (await get(`${ORG}/code?path=review`, headers)).json(),
    );
    expect(code.read?.status === "ready" ? code.read.blocks[0]?.text : undefined).toBe(
      "pnpm check\n",
    );
    // An outline names the workspace's own routes for its tables and its code, never the
    // deployment's, which the console's token does not read, and never a project's.
    const outlined = restSkillBrowseSchema.parse(
      await (await get(`${ORG}/browse?path=review%2Fcodes.md`, headers)).json(),
    );
    expect(outlined.read?.status === "ready" ? outlined.read.outline?.data : undefined).toEqual({
      rows: `${ORG}/rows?path=review%2Fcodes.md`,
      code: `${ORG}/code?path=review%2Fcodes.md`,
    });
    expect(JSON.stringify(outlined)).not.toContain("skillcdn.test/api/v1");
    // Each read went to the deployment with the workspace's token, and is logged with who read
    // which path, with no project, and never with the token or what was read.
    expect(asked).toEqual([
      "skill review/SKILL.md",
      "file review/guide.md",
      "find",
      "rows review/codes.md",
      "code review",
      "browse review/codes.md",
    ]);
    expect(new Set(tokens)).toEqual(new Set(["scdn_repo_org"]));
    const read = h.logs.filter((line) => line.msg === "a skill of the pack was read").at(-1);
    expect(read).toMatchObject({ address: "/gh/acme/skills", path: "review/SKILL.md" });
    expect(read).not.toHaveProperty("project");
    expect(JSON.stringify(h.logs)).not.toContain("scdn_repo");
    expect(JSON.stringify(h.logs)).not.toContain("Read the diff.");

    // What is asked wrong is refused here, as on a project's routes.
    expect((await get(`${ORG}/one`, headers)).status).toBe(400);
    expect((await get(`${ORG}/find`, headers)).status).toBe(400);
    expect((await get(`${ORG}/rows?limit=5001`, headers)).status).toBe(400);
    // A skill that is not there is the pack's own refusal.
    expect(
      restSkillLoadSchema.parse(
        await (await get(`${ORG}/one?path=nothing%2FSKILL.md`, headers)).json(),
      ),
    ).toMatchObject({ status: "not_found", refusal: { code: "skill.not_found" }, read: null });
  });

  it("is read through an agent's token as its person, and by nobody who is not in", async () => {
    // A person's agent, with the token they made: the same pack.
    const made = await h.request(REST_ROUTES.tokens, {
      method: "POST",
      headers: { cookie: member, ...JSON_HEADERS },
      body: JSON.stringify({ name: "Codex on the desk" }),
    });
    expect(made.status).toBe(201);
    const token = restTokenCreatedSchema.parse(await made.json()).secret;
    const bearer = { authorization: `Bearer ${token}` };
    expect(restSkillsSchema.parse(await (await get(ORG, bearer)).json()).status).toBe("ready");
    expect((await get(`${ORG}/one?path=review%2FSKILL.md`, bearer)).status).toBe(200);

    // Nobody signed in, and a token the console does not know, read none of it.
    for (const path of [
      ORG,
      `${ORG}/one?path=review%2FSKILL.md`,
      `${ORG}/file?path=review%2Fguide.md`,
      `${ORG}/browse`,
      `${ORG}/find?query=review`,
      `${ORG}/rows`,
      `${ORG}/code`,
    ]) {
      expect((await h.request(path)).status, path).toBe(401);
      expect((await get(path, { authorization: "Bearer cns_t_unknown" })).status, path).toBe(401);
    }

    // Someone who is out reads none of it, by their session or by their agent's token, and is
    // told why through the token, which the console keeps (ADR-0044); back in, they read again.
    const people = restPeopleSchema.parse(
      await (await get(REST_ROUTES.people, { cookie: admin })).json(),
    );
    const bobId = people.items.find((person) => person.login === "bob")?.id ?? "";
    const standing = (status: string) =>
      h.request(`${REST_ROUTES.people}/${bobId}`, {
        method: "PATCH",
        headers: { cookie: admin, ...JSON_HEADERS },
        body: JSON.stringify({ status }),
      });
    expect((await standing("deactivated")).status).toBe(200);
    try {
      expect((await get(ORG, { cookie: member })).status).toBe(401);
      const out = await get(`${ORG}/one?path=review%2FSKILL.md`, bearer);
      expect(out.status).toBe(403);
      expect(await codeOf(out)).toBe("auth.deactivated");
    } finally {
      expect((await standing("active")).status).toBe(200);
    }
    expect((await get(ORG, bearer)).status).toBe(200);
  });

  it("says what a pack with no token, and a console with no address, say of themselves", async () => {
    // The workspace's token taken away: the private pack is served to the console no more.
    const removed = await h.request(REST_ROUTES.workspacePackToken, {
      method: "DELETE",
      headers: { cookie: admin, origin: SIGN_IN_URL },
    });
    expect(removed.status).toBe(200);
    const unserved = restSkillsSchema.parse(await (await get(ORG, { cookie: apart })).json());
    expect(unserved).toMatchObject({ address: "/gh/acme/skills", status: "not_found", items: [] });
    // A console that names no address for the organization's skills has no pack to read there.
    const bare = createHarness(testDatabase, { providers: [createFixtureProvider()] });
    const cookie = await bare.signIn("carol");
    expect(
      restSkillsSchema.parse(await (await bare.request(ORG, { headers: { cookie } })).json()),
    ).toMatchObject({ address: null, status: "none" });
  });
});
