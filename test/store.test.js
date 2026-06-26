import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConfigStore } from "../src/store.js";

test("warning history persists and can be partially cleared", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spam-guard-"));
  const filePath = path.join(directory, "guilds.json");
  const store = new ConfigStore(filePath);

  await store.load();
  await store.addWarning("guild-1", "user-1", {
    id: "one",
    moderatorId: "mod-1",
    moderatorTag: "Mod#0001",
    reason: "First warning",
    source: "manual",
    createdAt: 1000
  });
  await store.addWarning("guild-1", "user-1", {
    id: "two",
    moderatorId: "mod-1",
    moderatorTag: "Mod#0001",
    reason: "Second warning",
    source: "automod",
    createdAt: 2000
  });

  const reloaded = new ConfigStore(filePath);
  await reloaded.load();

  assert.equal(reloaded.getWarnings("guild-1", "user-1").length, 2);
  assert.equal(await reloaded.clearWarnings("guild-1", "user-1", 1), 1);
  assert.deepEqual(
    reloaded.getWarnings("guild-1", "user-1").map((warning) => warning.id),
    ["one"]
  );
});

test("active warnings can be filtered by source and timestamp", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spam-guard-"));
  const filePath = path.join(directory, "guilds.json");
  const store = new ConfigStore(filePath);

  await store.load();
  await store.addWarning("guild-1", "user-1", {
    id: "old",
    moderatorId: "bot",
    moderatorTag: "AutoMod",
    reason: "Old",
    source: "automod",
    createdAt: 1000
  });
  await store.addWarning("guild-1", "user-1", {
    id: "new",
    moderatorId: "bot",
    moderatorTag: "AutoMod",
    reason: "New",
    source: "automod",
    createdAt: 5000
  });
  await store.addWarning("guild-1", "user-1", {
    id: "manual",
    moderatorId: "mod",
    moderatorTag: "Mod#0001",
    reason: "Manual",
    source: "manual",
    createdAt: 6000
  });

  assert.deepEqual(
    store.getActiveWarnings("guild-1", "user-1", { source: "automod", since: 3000 })
      .map((warning) => warning.id),
    ["new"]
  );
});

test("fun module state persists across reloads", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spam-guard-"));
  const filePath = path.join(directory, "guilds.json");
  const store = new ConfigStore(filePath);

  await store.load();
  await store.startGuessGame("guild-1", {
    id: "game-1",
    min: 1,
    max: 10,
    secretNumber: 7,
    maxAttempts: 5,
    channelId: "channel-1",
    startedById: "admin-1",
    startedAt: 1000,
    guesses: []
  });
  await store.addGuess("guild-1", {
    userId: "user-1",
    userTag: "Player#0001",
    number: 4,
    createdAt: 2000
  });
  await store.setBirthday("guild-1", "user-1", {
    month: 6,
    day: 26,
    updatedAt: 3000
  });
  await store.markBirthdayDelivered("guild-1", "user-1", "2026-06-26");
  await store.grantAchievement("guild-1", "user-1", {
    key: "first-win",
    title: "First Win",
    description: "Won a game.",
    badge: "WIN"
  }, {
    id: "bot",
    tag: "Bot#0001"
  });

  const reloaded = new ConfigStore(filePath);
  await reloaded.load();

  assert.equal(reloaded.getGuessGame("guild-1").guesses[0].number, 4);
  assert.deepEqual(reloaded.getBirthday("guild-1", "user-1"), {
    userId: "user-1",
    month: 6,
    day: 26,
    updatedAt: 3000
  });
  assert.equal(
    reloaded.hasBirthdayDelivery("guild-1", "user-1", "2026-06-26"),
    true
  );
  assert.equal(
    reloaded.getUserAchievements("guild-1", "user-1")[0].key,
    "first-win"
  );
});
