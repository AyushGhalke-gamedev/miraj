import assert from "node:assert/strict";
import test from "node:test";
import { isCommandEnabled, normalizeGuildConfig } from "../src/config.js";

test("normalizes command toggles and defaults unknown commands to enabled", () => {
  const config = normalizeGuildConfig({
    dmModerationEnabled: false,
    commandToggles: {
      ban: false,
      kick: true
    }
  });

  assert.equal(isCommandEnabled(config, "ban"), false);
  assert.equal(isCommandEnabled(config, "kick"), true);
  assert.equal(isCommandEnabled(config, "mute"), true);
  assert.equal(config.dmModerationEnabled, false);
});

test("normalizes chat protection lists", () => {
  const config = normalizeGuildConfig({
    badWords: "Alpha\nbeta, beta",
    scamDomains: "Bad.Example\nwww.fake.test"
  });

  assert.deepEqual(config.badWords, ["alpha", "beta"]);
  assert.deepEqual(config.scamDomains, ["bad.example", "www.fake.test"]);
});
