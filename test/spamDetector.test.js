import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/config.js";
import { SpamTracker } from "../src/spamDetector.js";

test("detects burst spam inside the configured window", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, messageLimit: 3, windowSeconds: 5 };

  assert.equal(tracker.track(message("1"), config, 0).spam, false);
  assert.equal(tracker.track(message("2"), config, 1000).spam, false);

  const result = tracker.track(message("3"), config, 2000);
  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /3 messages/);
});

test("does not count burst messages outside the configured window", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, messageLimit: 3, windowSeconds: 5 };

  tracker.track(message("1"), config, 0);
  tracker.track(message("2"), config, 1000);

  const result = tracker.track(message("3"), config, 7000);
  assert.equal(result.spam, false);
  assert.equal(result.messageCount, 1);
});

test("detects repeated messages", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, duplicateLimit: 3 };

  tracker.track(message("1", "BUY NOW"), config, 0);
  tracker.track(message("2", "buy   now"), config, 1000);

  const result = tracker.track(message("3", "buy now"), config, 2000);
  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /repeated/);
});

test("detects mass mentions in one message", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, mentionLimit: 3 };
  const result = tracker.track(
    message("1", "hello", { users: 2, roles: 1, everyone: false }),
    config,
    0
  );

  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /mentioned 3/);
});

test("only treats invite links as spam when invite blocking is enabled", () => {
  const tracker = new SpamTracker();
  const off = { ...DEFAULT_CONFIG, blockInvites: false };
  const on = { ...DEFAULT_CONFIG, blockInvites: true };

  assert.equal(tracker.track(message("1", "discord.gg/test"), off, 0).spam, false);
  assert.equal(tracker.track(message("2", "discord.gg/test"), on, 1000).spam, true);
});

test("detects scam links from configured domains", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, antiScamEnabled: true, scamDomains: ["bad.example"] };
  const result = tracker.track(message("1", "free stuff https://bad.example/login"), config, 0);

  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /scam/);
});

test("detects blocked words", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, antiBadWordsEnabled: true, badWords: ["banana"] };
  const result = tracker.track(message("1", "this banana is blocked"), config, 0);

  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /blocked word/);
});

test("detects excessive caps", () => {
  const tracker = new SpamTracker();
  const config = {
    ...DEFAULT_CONFIG,
    capsProtectionEnabled: true,
    capsMinLength: 10,
    capsPercentage: 70
  };
  const result = tracker.track(message("1", "THIS IS VERY LOUD"), config, 0);

  assert.equal(result.spam, true);
  assert.match(result.reasons.join(" "), /capital/);
});

test("detects emoji spam and zalgo text", () => {
  const tracker = new SpamTracker();
  const config = {
    ...DEFAULT_CONFIG,
    antiEmojiSpamEnabled: true,
    antiZalgoEnabled: true,
    emojiLimit: 3,
    zalgoMarkLimit: 3
  };

  assert.equal(tracker.track(message("1", "😀😀😀"), config, 0).spam, true);
  assert.equal(tracker.track(message("2", "h\u0301\u0302\u0303i"), config, 1000).spam, true);
});

test("detects ghost pings when a mention message is deleted", () => {
  const tracker = new SpamTracker();
  const config = { ...DEFAULT_CONFIG, antiGhostPingEnabled: true, ghostPingWindowSeconds: 60 };

  tracker.track(message("1", "hello", { users: 1 }), config, 0);

  const result = tracker.trackDeletedMessage({
    id: "1",
    channelId: "channel-1",
    guildId: "guild-1"
  }, config, 1000);

  assert.equal(result.spam, true);
  assert.equal(result.ghostPing, true);
});

function message(id, content = `message ${id}`, mentions = {}) {
  return {
    id,
    channelId: "channel-1",
    guildId: "guild-1",
    authorId: "user-1",
    content,
    mentions: {
      users: { size: mentions.users ?? 0 },
      roles: { size: mentions.roles ?? 0 },
      everyone: mentions.everyone ?? false
    }
  };
}
