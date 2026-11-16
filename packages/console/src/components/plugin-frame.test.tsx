import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConsoleClient } from "../client.js";
import type { Navigation } from "../router.js";
import type { RestMe, RestPlugin } from "../schemas.js";
import { PluginFrame } from "./plugin-frame.js";

const plugin = { key: "hello", version: "1.0.0", roles: [] } as unknown as RestPlugin;
const me = { person: null, workspace: { name: "Acme" } } as unknown as RestMe;
const client = {
  plugin: () => ({ frameUrl: () => "/api/v1/plugins/hello/frame" }),
} as unknown as ConsoleClient;
const navigation = { go: () => undefined } as unknown as Navigation;

const drawn = (shown: { readonly page: string } | { readonly widget: string }) =>
  renderToStaticMarkup(
    <PluginFrame
      plugin={plugin}
      me={me}
      language="en"
      client={client}
      navigation={navigation}
      title="Hello"
      {...shown}
    />,
  );

describe("PluginFrame", () => {
  it("keeps a page's frame from scrolling, so that a wheel over it moves the console's page", () => {
    expect(drawn({ page: "greetings" })).toMatch(/<iframe[^>]* scrolling="no"/);
  });

  it("leaves a widget's frame as its document has it", () => {
    expect(drawn({ widget: "latest" })).not.toContain("scrolling=");
  });
});
