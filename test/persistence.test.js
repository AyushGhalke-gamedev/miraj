import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PostgresStateStorage } from "../src/persistence.js";
import { ConfigStore } from "../src/store.js";

test("PostgreSQL storage persists bot state across store instances", async () => {
  const pool = new MemoryPostgresPool();
  const first = new ConfigStore({
    storage: new PostgresStateStorage({ pool, seedFilePath: null })
  });

  await first.load();
  await first.update("guild-1", {
    welcomeEnabled: true,
    welcomeChannelId: "channel-1"
  });
  await first.addWarning("guild-1", "user-1", {
    id: "warning-1",
    moderatorId: "mod-1",
    moderatorTag: "Mod#0001",
    reason: "Test warning",
    source: "manual",
    createdAt: 1000
  });

  const reloaded = new ConfigStore({
    storage: new PostgresStateStorage({ pool, seedFilePath: null })
  });
  await reloaded.load();

  assert.equal(reloaded.get("guild-1").welcomeEnabled, true);
  assert.equal(reloaded.get("guild-1").welcomeChannelId, "channel-1");
  assert.equal(reloaded.getWarnings("guild-1", "user-1")[0].id, "warning-1");
  assert.equal(pool.createCount, 2);
});

test("empty PostgreSQL storage is seeded from the existing JSON data file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "spam-guard-seed-"));
  const seedFilePath = path.join(directory, "guilds.json");
  const pool = new MemoryPostgresPool();

  await fs.writeFile(seedFilePath, JSON.stringify({
    guilds: {
      "guild-1": {
        welcomeEnabled: true,
        welcomeChannelId: "channel-1"
      }
    }
  }));

  const store = new ConfigStore({
    storage: new PostgresStateStorage({ pool, seedFilePath })
  });
  await store.load();

  assert.equal(store.get("guild-1").welcomeEnabled, true);
  assert.equal(pool.state.guilds["guild-1"].welcomeChannelId, "channel-1");
});

class MemoryPostgresPool {
  constructor() {
    this.state = null;
    this.createCount = 0;
  }

  async query(text, values = []) {
    if (text.includes("CREATE TABLE")) {
      this.createCount += 1;
      return { rows: [] };
    }

    if (text.includes("SELECT payload")) {
      return {
        rows: this.state === null ? [] : [{ payload: structuredClone(this.state) }]
      };
    }

    if (text.includes("INSERT INTO discord_bot_state")) {
      this.state = JSON.parse(values[0]);
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${text}`);
  }
}
