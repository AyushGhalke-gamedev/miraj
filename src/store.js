import fs from "node:fs/promises";
import path from "node:path";
import { normalizeGuildConfig } from "./config.js";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "guilds.json");

export class ConfigStore {
  constructor(filePath = process.env.SPAM_BOT_DATA_FILE || DEFAULT_DATA_FILE) {
    this.filePath = filePath;
    this.guilds = new Map();
    this.warnings = new Map();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      const guilds = data.guilds && typeof data.guilds === "object" ? data.guilds : {};
      const warnings = data.warnings && typeof data.warnings === "object" ? data.warnings : {};

      this.guilds = new Map(
        Object.entries(guilds).map(([guildId, config]) => [
          guildId,
          normalizeGuildConfig(config)
        ])
      );
      this.warnings = new Map(
        Object.entries(warnings).map(([guildId, guildWarnings]) => [
          guildId,
          normalizeGuildWarnings(guildWarnings)
        ])
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  get(guildId) {
    if (!this.guilds.has(guildId)) {
      this.guilds.set(guildId, normalizeGuildConfig());
    }

    return { ...this.guilds.get(guildId) };
  }

  async update(guildId, patch) {
    const next = normalizeGuildConfig({ ...this.get(guildId), ...patch });
    this.guilds.set(guildId, next);
    await this.save();
    return { ...next };
  }

  getWarnings(guildId, userId) {
    const guildWarnings = this.warnings.get(guildId);
    const userWarnings = guildWarnings?.get(userId) ?? [];
    return userWarnings.map((warning) => ({ ...warning }));
  }

  getActiveWarnings(guildId, userId, { source = null, since = 0 } = {}) {
    return this.getWarnings(guildId, userId).filter((warning) => {
      if (source && warning.source !== source) {
        return false;
      }

      return warning.createdAt >= since;
    });
  }

  async addWarning(guildId, userId, warning) {
    const guildWarnings = this.getGuildWarnings(guildId);
    const userWarnings = guildWarnings.get(userId) ?? [];
    const nextWarning = normalizeWarning({
      ...warning,
      id: warning.id ?? `${Date.now()}-${userWarnings.length + 1}`,
      userId
    });

    guildWarnings.set(userId, [...userWarnings, nextWarning]);
    await this.save();
    return { ...nextWarning };
  }

  async clearWarnings(guildId, userId, amount = null) {
    const guildWarnings = this.getGuildWarnings(guildId);
    const userWarnings = guildWarnings.get(userId) ?? [];

    if (amount === null || amount >= userWarnings.length) {
      guildWarnings.delete(userId);
      await this.save();
      return userWarnings.length;
    }

    const keepCount = Math.max(0, userWarnings.length - amount);
    guildWarnings.set(userId, userWarnings.slice(0, keepCount));
    await this.save();
    return userWarnings.length - keepCount;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const guilds = Object.fromEntries(this.guilds);
    const warnings = Object.fromEntries(
      [...this.warnings.entries()].map(([guildId, guildWarnings]) => [
        guildId,
        Object.fromEntries(guildWarnings)
      ])
    );

    await fs.writeFile(
      this.filePath,
      `${JSON.stringify({ guilds, warnings }, null, 2)}\n`,
      "utf8"
    );
  }

  getGuildWarnings(guildId) {
    if (!this.warnings.has(guildId)) {
      this.warnings.set(guildId, new Map());
    }

    return this.warnings.get(guildId);
  }
}

export const configStore = new ConfigStore();

function normalizeGuildWarnings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).map(([userId, warnings]) => [
      userId,
      Array.isArray(warnings) ? warnings.map(normalizeWarning) : []
    ])
  );
}

function normalizeWarning(warning) {
  const createdAt = Number(warning.createdAt);

  return {
    id: String(warning.id ?? `${Date.now()}`),
    userId: String(warning.userId ?? ""),
    moderatorId: String(warning.moderatorId ?? ""),
    moderatorTag: String(warning.moderatorTag ?? "Unknown moderator"),
    reason: String(warning.reason ?? "No reason provided").slice(0, 500),
    source: String(warning.source ?? "manual"),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
  };
}
