import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuildConfig } from "../src/config.js";
import { renderBirthdayTemplate, renderGuessTemplate } from "../src/funBanners.js";
import { buildWelcomePayload, renderWelcomeTemplate, sendWelcome } from "../src/welcome.js";

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

test("welcome templates replace inviter placeholders", () => {
  const member = {
    id: "123",
    displayName: "Captain",
    user: { username: "ayush" },
    guild: { name: "Code Club", memberCount: 42 }
  };
  const inviteInfo = {
    code: "abc",
    inviterUsername: "mercy",
    inviterMention: "<@999>",
    inviterInvites: 7
  };

  assert.equal(
    renderWelcomeTemplate(
      "Invited by {inviterName} using {inviteCode}; they now have {inviterInvites}.",
      member,
      inviteInfo
    ),
    "Invited by mercy using abc; they now have 7."
  );
});

test("welcome payload deduplicates the member and inviter mention", async () => {
  const member = {
    id: "123",
    displayName: "Captain",
    user: { username: "ayush" },
    guild: { name: "Code Club", memberCount: 42 }
  };
  const config = normalizeGuildConfig({
    welcomeMessage: "Welcome {mention}!",
    welcomeBannerEnabled: false
  });
  const payload = await buildWelcomePayload(member, config, {
    code: "test",
    inviterId: "123",
    inviterTag: "ayush",
    inviterUsername: "ayush",
    inviterMention: "<@123>",
    inviterInvites: 1
  });

  assert.deepEqual(payload.allowedMentions.users, ["123"]);
});

test("detected inviter name is included in the sent welcome message", async () => {
  let sentPayload = null;
  const channel = {
    isTextBased: () => true,
    send: async (payload) => {
      sentPayload = payload;
    }
  };
  const member = {
    id: "123",
    displayName: "New Member",
    user: { username: "new-member" },
    guild: {
      id: "guild-1",
      name: "Code Club",
      memberCount: 42,
      channels: { fetch: async () => channel }
    }
  };
  const config = normalizeGuildConfig({
    welcomeEnabled: true,
    welcomeChannelId: "channel-1",
    welcomeInviteTrackingEnabled: true,
    welcomeShowInviter: true,
    welcomeBannerEnabled: false,
    welcomeMessage: "Welcome {mention}! Invited by {inviterName}."
  });
  const store = { get: () => config };
  const inviteTracker = {
    identifyInvite: async () => ({
      code: "abc",
      inviterId: "999",
      inviterTag: "mercy",
      inviterUsername: "mercy",
      inviterMention: "<@999>",
      inviterInvites: 7
    })
  };

  assert.equal(await sendWelcome(member, store, inviteTracker), true);
  assert.equal(sentPayload.content, "Welcome <@123>! Invited by mercy.");
  assert.deepEqual(sentPayload.allowedMentions.users, ["123", "999"]);
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

test("fun templates replace birthday and game placeholders", () => {
  const guild = { name: "Code Club" };
  const member = {
    id: "123",
    displayName: "Captain",
    user: { username: "ayush" },
    guild: { name: "Code Club", memberCount: 42 }
  };

  assert.equal(
    renderBirthdayTemplate("Happy birthday {mention} from {server}, {displayName}!", member),
    "Happy birthday <@123> from Code Club, Captain!"
  );
  assert.equal(
    renderGuessTemplate("{mention} won with {number} after {attempts} tries in {server}.", guild, {
      userId: "123",
      number: 7,
      attempts: 4
    }),
    "<@123> won with 7 after 4 tries in Code Club."
  );
});
