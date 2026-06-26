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
    scamDomains: "Bad.Example\nwww.fake.test",
    botProfileNick: "  Custom Guard  ",
    botProfileBio: "  Watching this server kindly.  ",
    welcomeInviteTrackingEnabled: false,
    welcomeShowInviter: false,
    welcomeBannerInviteLine: "Invited by {inviterName}",
    commandPrefix: "  mod  "
  });

  assert.deepEqual(config.badWords, ["alpha", "beta"]);
  assert.deepEqual(config.scamDomains, ["bad.example", "www.fake.test"]);
  assert.equal(config.botProfileNick, "Custom Guard");
  assert.equal(config.botProfileBio, "Watching this server kindly.");
  assert.equal(config.welcomeInviteTrackingEnabled, false);
  assert.equal(config.welcomeShowInviter, false);
  assert.equal(config.welcomeBannerInviteLine, "Invited by {inviterName}");
  assert.equal(config.commandPrefix, "mod");
});

test("normalizes fun module settings", () => {
  const config = normalizeGuildConfig({
    welcomeBannerTheme: "neon",
    guessNumberMin: 50,
    guessNumberMax: 40,
    guessNumberBannerTheme: "arcade",
    guessNumberBannerBackgroundColor: "nope",
    birthdayBannerTheme: "pastel",
    birthdayTimezoneOffsetMinutes: 9999,
    achievements: "sharp | Sharp Guess | Guessed the number fast | AIM | true\nbad key! | Nice | Desc | OK | false"
  });

  assert.equal(config.welcomeBannerTheme, "neon");
  assert.equal(config.guessNumberMin, 50);
  assert.equal(config.guessNumberMax, 51);
  assert.equal(config.guessNumberBannerTheme, "arcade");
  assert.equal(config.guessNumberBannerBackgroundColor, "#111827");
  assert.equal(config.birthdayBannerTheme, "pastel");
  assert.equal(config.birthdayTimezoneOffsetMinutes, 840);
  assert.deepEqual(
    config.achievements.map((achievement) => [
      achievement.key,
      achievement.title,
      achievement.enabled
    ]),
    [
      ["sharp", "Sharp Guess", true],
      ["bad-key", "Nice", false]
    ]
  );
});
