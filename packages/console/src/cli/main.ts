#!/usr/bin/env node
import { existsSync } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as z from "zod/mini";
import { userAgentOf } from "../compat.js";
import { isLfsPointer, MAX_LFS_POINTER_BYTES, RECORDS_DIR } from "../records.js";
import { runCli } from "./cli.js";
import { createFileStore, defaultConfigDir } from "./credentials.js";
import { createDirectoryStore } from "./directory.js";
import { detectInstall } from "./install.js";
import { createNoticeStore } from "./notices.js";
import { templateFiles } from "./plugin-init.js";
import { createRunnerHost } from "./runner-host.js";
import { listenOn } from "./serve.js";
import { createSetupMachine } from "./setup-machine.js";
import { readBytesAt, readFileAt, readSecret, readStdin, writeBytesAt } from "./terminal.js";

// The `console` command: the only place the command reads the process. Everything it does is in
// cli.ts, which takes what it needs and is what the tests run.

/** The package's own directory, two levels above dist/cli: where its manifest and its skills are. */
const packageDir = fileURLToPath(new URL("../../", import.meta.url));
/** The version of the package this file runs from: its own manifest. */
const manifest = z
  .object({ version: z.string() })
  .safeParse(createRequire(import.meta.url)("../../package.json"));
const version = manifest.success ? manifest.data.version : undefined;
/** The console's own skills, shipped with the package beside dist/ (ADR-0015); not there in a checkout before packing. */
const skillsDir = fileURLToPath(new URL("../../skills/", import.meta.url));
/** The shell of a desk's pages, shipped with the package beside dist/ as the plugin's template is (ADR-0115). */
const deskWebDir = join(packageDir, "template", "desk-web");
const configDir = defaultConfigDir(process.env);

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  fetch: (input, init) => fetch(input, init),
  readStdin,
  readSecret,
  hostname: hostname(),
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  // Whether a terminal shows what is printed as it is printed: an agent's host, a pipe and a
  // file show it when the command ends, where login says its code and ends (ADR-0129).
  terminal: process.stdout.isTTY === true,
  readFile: readFileAt,
  readBytes: readBytesAt,
  writeBytes: writeBytesAt,
  store: createFileStore(configDir),
  directory: createDirectoryStore(process.cwd()),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  version,
  // The command names itself on every request, and where it runs, so that the console holds it
  // to the versions it takes and the access log says which commands are about (ADR-0025).
  userAgent:
    version === undefined
      ? undefined
      : userAgentOf(version, `cli; node ${process.versions.node}; ${process.platform}`),
  install: detectInstall({
    packageDir,
    cwd: process.cwd(),
    env: process.env,
    exists: existsSync,
  }),
  notices: createNoticeStore(configDir),
  // The manifest read again: what the package is now, where it was updated under a runner.
  installedVersion: async () => {
    try {
      const read = z
        .object({ version: z.string() })
        .safeParse(JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")));
      return read.success ? read.data.version : undefined;
    } catch {
      return undefined;
    }
  },
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  skillsDir: existsSync(skillsDir) ? skillsDir : undefined,
  listen: listenOn,
  // A product's process begins from this process's environment, where its own sign-in is.
  runner: createRunnerHost(process.cwd(), process.env),
  // A machine is set up as the command was started: the same runtime, the same file, the same PATH.
  machine: createSetupMachine(process.env, process.argv[1]),
  // A desk's records (ADR-0117), as `desk check` reads them: the files under its `records/`,
  // by paths the format's own schemas let through, which name no folder above it.
  recordsAt: (directory) => {
    const root = resolve(directory, RECORDS_DIR);
    const at = (path: string): string =>
      join(root, ...path.split("/").filter((part) => part.length > 0));
    return {
      directory: resolve(directory),
      files: {
        read: async (path) => {
          try {
            return await readFile(at(path), "utf8");
          } catch {
            return undefined;
          }
        },
        size: async (path) => {
          try {
            const info = await stat(at(path));
            return info.isFile() ? info.size : undefined;
          } catch {
            return undefined;
          }
        },
        // A git LFS pointer is a few lines of text: its beginning says whether a file is one.
        pointer: async (path) => {
          try {
            const file = await open(at(path), "r");
            try {
              const head = Buffer.alloc(MAX_LFS_POINTER_BYTES);
              const { bytesRead } = await file.read(head, 0, head.length, 0);
              return isLfsPointer(head.subarray(0, bytesRead).toString("utf8"));
            } finally {
              await file.close();
            }
          } catch {
            return false;
          }
        },
        folders: async (path) => {
          try {
            return (await readdir(at(path), { withFileTypes: true }))
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name);
          } catch {
            return undefined;
          }
        },
      },
    };
  },
  // The shell of a desk's pages (ADR-0115), read when `desk --web` asks for it.
  deskWebTemplate: async () => {
    if (!existsSync(deskWebDir)) {
      return undefined;
    }
    const files = new Map<string, string>();
    for (const path of await templateFiles(deskWebDir)) {
      files.set(path, await readFile(join(deskWebDir, ...path.split("/")), "utf8"));
    }
    return files;
  },
});
