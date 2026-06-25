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
