import { describe, expect, it } from "vitest";
import * as particles from "./i18n/particles.js";
import * as server from "./plugin.js";
import * as web from "./plugin-web.js";

// A plugin's Korean reads as the console's does (ADR-0137): both of a plugin's entry points hand
// it the functions the console's own pack writes its particles with, and not copies of them,
// so that a rule changed here changes there with the next build of the plugin.
describe("the Korean particles a plugin writes with", () => {
  it("are the console's own, from the server module's entry point and the web bundle's", () => {
    for (const entry of [server, web]) {
      expect(entry.asObject).toBe(particles.asObject);
      expect(entry.asSubject).toBe(particles.asSubject);
      expect(entry.asWay).toBe(particles.asWay);
    }
    expect(server.asObject("휴가")).toBe("휴가를");
    expect(web.asSubject("Slack")).toBe("Slack이");
    expect(web.asWay("채널")).toBe("채널로");
  });

  it("are every helper the console's Korean has, so that none is left for a plugin to write again", () => {
    expect(Object.keys(particles).sort()).toEqual(["asObject", "asSubject", "asWay"]);
  });
});
