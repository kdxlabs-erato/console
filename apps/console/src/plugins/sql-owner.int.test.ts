import { randomBytes } from "node:crypto";
import process from "node:process";
import { Client } from "pg";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/client.js";
import { migrateDatabase } from "../db/migrate.js";
import { DEV_DATABASE_URL } from "../db/testing.js";
import { PluginSqlService } from "./sql.js";

// A plugin's schema where the console's database user is no superuser, as a managed database's
// is: it owns its database and may make roles. Roles are the cluster's: every one here is named
// for this run, so that the files and the checkouts that run beside it do not meet it.

const adminUrl = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;
const run = randomBytes(4).toString("hex");
const owner = `console_test_${run}_owner`;
const ownedName = `console_test_${run}_owned`;
const password = randomBytes(18).toString("base64url");
const silent = pino({ level: "warn" }, { write: () => {} });

let admin: Client;
const opened: Database[] = [];
const services: PluginSqlService[] = [];

/** The address of a database, signed in as a role of this run. */
function urlOf(base: string, database: string | undefined, role: string): string {
  const url = new URL(base);
  if (database !== undefined) {
    url.pathname = `/${database}`;
  }
  url.username = role;
  url.password = password;
  return url.href;
}

function serviceOf(connectionString: string): { database: Database; service: PluginSqlService } {
  const database = createDatabase({ connectionString, maxConnections: 2 });
  const service = new PluginSqlService({
    database,
    connectionString,
    ca: undefined,
    logger: silent,
  });
  opened.push(database);
  services.push(service);
  return { database, service };
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create role "${owner}" with login createrole password '${password}'`);
  await admin.query(`create database "${ownedName}" owner "${owner}"`);
});

afterAll(async () => {
  for (const service of services) {
    await service.stop();
  }
  for (const database of opened) {
    await database.close();
  }
  if (admin !== undefined) {
    await admin.query(`drop database if exists "${ownedName}" with (force)`);
    for (const role of [`plugin_own${run}`, owner]) {
      await admin.query(`drop role if exists "${role}"`);
    }
    await admin.end();
  }
});

describe("where the console's database user owns its database", () => {
  it("provisions the plugin's role, and again at every boot", async () => {
    const url = urlOf(adminUrl, ownedName, owner);
    await migrateDatabase(url);
    const { service } = serviceOf(url);
    const key = `own${run}`;
    try {
      expect(await service.available()).toBe(true);
      await service.provision(key);
      expect((await service.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
      // Every boot provisions again, with a password drawn anew.
      await service.provision(key);
      expect((await service.query(key, "select 1 as n", [])).rows).toEqual([{ n: 1 }]);
    } finally {
      await service.purge(key);
    }
  });
});
