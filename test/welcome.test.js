import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuildConfig } from "../src/config.js";
import { renderWelcomeTemplate } from "../src/welcome.js";

test("welcome templates replace member and server placeholders", () => {
  const member = {
    id: "123",
    displayName: "Captain",
    user: { username: "ayush" },
    guild: { name: "Code Club", memberCount: 42 }
  };

  assert.equal(
    renderWelcomeTemplate("Hi {mention}, welcome to {server}. You are #{memberCount}, {displayName}.", member),
    "Hi <@123>, welcome to Code Club. You are #42, Captain."
  );
});

test("welcome config normalizes colors and custom background URLs", () => {
  const config = normalizeGuildConfig({
    welcomeEnabled: true,
    welcomeChannelId: "999",
    welcomeBannerBackgroundColor: "nope",
    welcomeBannerAccentColor: "#ABCDEF",
    welcomeBannerBackgroundUrl: "https://example.com/banner.png"
  });

  assert.equal(config.welcomeEnabled, true);
  assert.equal(config.welcomeChannelId, "999");
  assert.equal(config.welcomeBannerBackgroundColor, "#20232a");
  assert.equal(config.welcomeBannerAccentColor, "#abcdef");
  assert.equal(config.welcomeBannerBackgroundUrl, "https://example.com/banner.png");
});
