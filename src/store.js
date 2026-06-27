import { normalizeGuildConfig } from "./config.js";
import { createStateStorage } from "./persistence.js";

export class ConfigStore {
  constructor(options = {}) {
    this.storage = createStateStorage(options);
    this.filePath = this.storage.filePath ?? null;
    this.saveQueue = Promise.resolve();
    this.guilds = new Map();
    this.warnings = new Map();
    this.guessGames = new Map();
    this.birthdays = new Map();
    this.birthdayDeliveries = new Map();
    this.achievements = new Map();
  }

  async load() {
    const data = await this.storage.load();
    const guilds = data.guilds && typeof data.guilds === "object" ? data.guilds : {};
    const warnings = data.warnings && typeof data.warnings === "object" ? data.warnings : {};
    const guessGames = data.guessGames && typeof data.guessGames === "object" ? data.guessGames : {};
    const birthdays = data.birthdays && typeof data.birthdays === "object" ? data.birthdays : {};
    const birthdayDeliveries = data.birthdayDeliveries && typeof data.birthdayDeliveries === "object"
      ? data.birthdayDeliveries
      : {};
    const achievements = data.achievements && typeof data.achievements === "object"
      ? data.achievements
      : {};

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
    this.guessGames = new Map();

    for (const [guildId, game] of Object.entries(guessGames)) {
      const normalizedGame = normalizeGuessGame(game);

      if (normalizedGame) {
        this.guessGames.set(guildId, normalizedGame);
      }
    }
    this.birthdays = new Map(
      Object.entries(birthdays).map(([guildId, guildBirthdays]) => [
        guildId,
        normalizeGuildBirthdays(guildBirthdays)
      ])
    );
    this.birthdayDeliveries = new Map(
      Object.entries(birthdayDeliveries).map(([guildId, deliveries]) => [
        guildId,
        normalizeGuildBirthdayDeliveries(deliveries)
      ])
    );
    this.achievements = new Map(
      Object.entries(achievements).map(([guildId, guildAchievements]) => [
        guildId,
        normalizeGuildAchievements(guildAchievements)
      ])
    );
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

  /**
   * @param {string} guildId
   * @param {string} userId
   * @param {{ source?: string | null, since?: number }} [options]
   */
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

  getGuessGame(guildId) {
    const game = this.guessGames.get(guildId);
    return game ? clone(game) : null;
  }

  async startGuessGame(guildId, game) {
    const nextGame = normalizeGuessGame({
      ...game,
      id: game.id ?? `${Date.now()}`
    });

    if (!nextGame) {
      throw new Error("Guess number game data is invalid.");
    }

    this.guessGames.set(guildId, nextGame);
    await this.save();
    return clone(nextGame);
  }

  async addGuess(guildId, guess) {
    const game = this.guessGames.get(guildId);

    if (!game) {
      return null;
    }

    const nextGuess = normalizeGuess(guess);
    game.guesses.push(nextGuess);
    await this.save();
    return clone(game);
  }

  async addGuessPlayer(guildId, player) {
    const game = this.guessGames.get(guildId);

    if (!game) {
      return null;
    }

    const nextPlayer = normalizeGuessPlayer(player);

    if (!game.players.some((item) => item.userId === nextPlayer.userId)) {
      game.players.push(nextPlayer);
    }

    game.currentTurnIndex = clampTurnIndex(game.currentTurnIndex, game.players.length);
    await this.save();
    return clone(game);
  }

  async removeGuessPlayer(guildId, userId) {
    const game = this.guessGames.get(guildId);

    if (!game) {
      return null;
    }

    const previousIndex = game.players.findIndex((player) => player.userId === userId);

    if (previousIndex === -1) {
      return clone(game);
    }

    game.players.splice(previousIndex, 1);

    if (previousIndex < game.currentTurnIndex) {
      game.currentTurnIndex -= 1;
    }

    game.currentTurnIndex = clampTurnIndex(game.currentTurnIndex, game.players.length);
    await this.save();
    return clone(game);
  }

  async advanceGuessTurn(guildId) {
    const game = this.guessGames.get(guildId);

    if (!game) {
      return null;
    }

    if (game.players.length > 0) {
      game.currentTurnIndex = (game.currentTurnIndex + 1) % game.players.length;
    } else {
      game.currentTurnIndex = 0;
    }

    await this.save();
    return clone(game);
  }

  async stopGuessGame(guildId) {
    const game = this.guessGames.get(guildId);
    this.guessGames.delete(guildId);
    await this.save();
    return game ? clone(game) : null;
  }

  getBirthday(guildId, userId) {
    const birthday = this.birthdays.get(guildId)?.get(userId);
    return birthday ? { ...birthday } : null;
  }

  getBirthdaysForDate(guildId, month, day) {
    const guildBirthdays = this.birthdays.get(guildId);

    if (!guildBirthdays) {
      return [];
    }

    return [...guildBirthdays.entries()]
      .filter(([, birthday]) => birthday.month === month && birthday.day === day)
      .map(([userId, birthday]) => ({ userId, ...birthday }));
  }

  async setBirthday(guildId, userId, birthday) {
    const guildBirthdays = this.getGuildBirthdays(guildId);
    const nextBirthday = normalizeBirthday({
      ...birthday,
      userId,
      updatedAt: birthday.updatedAt ?? Date.now()
    });

    if (!nextBirthday) {
      throw new Error("Birthday date is invalid.");
    }

    guildBirthdays.set(userId, nextBirthday);
    await this.save();
    return { ...nextBirthday };
  }

  async clearBirthday(guildId, userId) {
    const guildBirthdays = this.getGuildBirthdays(guildId);
    const removed = guildBirthdays.delete(userId);
    await this.save();
    return removed;
  }

  hasBirthdayDelivery(guildId, userId, dateKey) {
    return this.birthdayDeliveries.get(guildId)?.get(userId) === dateKey;
  }

  async markBirthdayDelivered(guildId, userId, dateKey) {
    const guildDeliveries = this.getGuildBirthdayDeliveries(guildId);
    guildDeliveries.set(userId, String(dateKey));
    await this.save();
  }

  getUserAchievements(guildId, userId) {
    const userAchievements = this.achievements.get(guildId)?.get(userId) ?? [];
    return userAchievements.map((achievement) => ({ ...achievement }));
  }

  async grantAchievement(guildId, userId, achievement, grantedBy = {}) {
    const guildAchievements = this.getGuildAchievements(guildId);
    const userAchievements = guildAchievements.get(userId) ?? [];
    const existing = userAchievements.find((item) => item.key === achievement.key);

    if (existing) {
      return { achievement: { ...existing }, created: false };
    }

    const nextAchievement = normalizeEarnedAchievement({
      ...achievement,
      userId,
      grantedById: grantedBy.id,
      grantedByTag: grantedBy.tag,
      earnedAt: achievement.earnedAt ?? Date.now()
    });

    guildAchievements.set(userId, [...userAchievements, nextAchievement]);
    await this.save();
    return { achievement: { ...nextAchievement }, created: true };
  }

  async revokeAchievement(guildId, userId, key) {
    const guildAchievements = this.getGuildAchievements(guildId);
    const userAchievements = guildAchievements.get(userId) ?? [];
    const nextAchievements = userAchievements.filter((achievement) => achievement.key !== key);

    guildAchievements.set(userId, nextAchievements);
    await this.save();
    return userAchievements.length - nextAchievements.length;
  }

  async save() {
    const operation = this.saveQueue.then(() => this.storage.save(this.serialize()));
    this.saveQueue = operation.catch(() => {});
    return operation;
  }

  serialize() {
    const guilds = Object.fromEntries(this.guilds);
    const warnings = Object.fromEntries(
      [...this.warnings.entries()].map(([guildId, guildWarnings]) => [
        guildId,
        Object.fromEntries(guildWarnings)
      ])
    );
    const guessGames = Object.fromEntries(this.guessGames);
    const birthdays = Object.fromEntries(
      [...this.birthdays.entries()].map(([guildId, guildBirthdays]) => [
        guildId,
        Object.fromEntries(guildBirthdays)
      ])
    );
    const birthdayDeliveries = Object.fromEntries(
      [...this.birthdayDeliveries.entries()].map(([guildId, deliveries]) => [
        guildId,
        Object.fromEntries(deliveries)
      ])
    );
    const achievements = Object.fromEntries(
      [...this.achievements.entries()].map(([guildId, guildAchievements]) => [
        guildId,
        Object.fromEntries(guildAchievements)
      ])
    );

    return { guilds, warnings, guessGames, birthdays, birthdayDeliveries, achievements };
  }

  async close() {
    await this.saveQueue;

    if (typeof this.storage.close === "function") {
      await this.storage.close();
    }
  }

  getGuildWarnings(guildId) {
    if (!this.warnings.has(guildId)) {
      this.warnings.set(guildId, new Map());
    }

    return this.warnings.get(guildId);
  }

  getGuildBirthdays(guildId) {
    if (!this.birthdays.has(guildId)) {
      this.birthdays.set(guildId, new Map());
    }

    return this.birthdays.get(guildId);
  }

  getGuildBirthdayDeliveries(guildId) {
    if (!this.birthdayDeliveries.has(guildId)) {
      this.birthdayDeliveries.set(guildId, new Map());
    }

    return this.birthdayDeliveries.get(guildId);
  }

  getGuildAchievements(guildId) {
    if (!this.achievements.has(guildId)) {
      this.achievements.set(guildId, new Map());
    }

    return this.achievements.get(guildId);
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

function normalizeGuessGame(game) {
  if (!game || typeof game !== "object") {
    return null;
  }

  const min = Math.max(1, Math.round(Number(game.min)));
  const max = Math.round(Number(game.max));
  const secretNumber = Math.round(Number(game.secretNumber));
  const maxAttempts = Math.max(1, Math.round(Number(game.maxAttempts)));

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null;
  }

  if (!Number.isFinite(secretNumber) || secretNumber < min || secretNumber > max) {
    return null;
  }

  const players = normalizeGuessPlayers(game.players);

  return {
    id: String(game.id ?? `${Date.now()}`),
    min,
    max,
    secretNumber,
    maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 12,
    channelId: String(game.channelId ?? ""),
    startedById: String(game.startedById ?? ""),
    startedAt: normalizeTimestamp(game.startedAt),
    players,
    currentTurnIndex: clampTurnIndex(game.currentTurnIndex, players.length),
    guesses: Array.isArray(game.guesses) ? game.guesses.map(normalizeGuess) : []
  };
}

function normalizeGuess(guess) {
  return {
    userId: String(guess.userId ?? ""),
    userTag: String(guess.userTag ?? "Unknown user").slice(0, 80),
    number: Math.round(Number(guess.number)),
    createdAt: normalizeTimestamp(guess.createdAt)
  };
}

function normalizeGuessPlayers(players) {
  if (!Array.isArray(players)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const player of players) {
    const nextPlayer = normalizeGuessPlayer(player);

    if (!nextPlayer.userId || seen.has(nextPlayer.userId)) {
      continue;
    }

    seen.add(nextPlayer.userId);
    normalized.push(nextPlayer);
  }

  return normalized;
}

function normalizeGuessPlayer(player) {
  return {
    userId: String(player.userId ?? ""),
    userTag: String(player.userTag ?? "Unknown user").slice(0, 80),
    joinedAt: normalizeTimestamp(player.joinedAt)
  };
}

function clampTurnIndex(value, playerCount) {
  if (playerCount <= 0) {
    return 0;
  }

  const index = Math.round(Number(value));
  return Number.isFinite(index) ? Math.min(playerCount - 1, Math.max(0, index)) : 0;
}

function normalizeGuildBirthdays(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  const birthdays = new Map();

  for (const [userId, birthday] of Object.entries(value)) {
    const normalizedBirthday = normalizeBirthday({ ...birthday, userId });

    if (normalizedBirthday) {
      birthdays.set(userId, normalizedBirthday);
    }
  }

  return birthdays;
}

function normalizeBirthday(birthday) {
  const month = Math.round(Number(birthday.month));
  const day = Math.round(Number(birthday.day));

  if (!isValidMonthDay(month, day)) {
    return null;
  }

  return {
    userId: String(birthday.userId ?? ""),
    month,
    day,
    updatedAt: normalizeTimestamp(birthday.updatedAt)
  };
}

function normalizeGuildBirthdayDeliveries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).map(([userId, dateKey]) => [userId, String(dateKey)])
  );
}

function normalizeGuildAchievements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).map(([userId, achievements]) => [
      userId,
      Array.isArray(achievements) ? achievements.map(normalizeEarnedAchievement) : []
    ])
  );
}

function normalizeEarnedAchievement(achievement) {
  return {
    key: String(achievement.key ?? "").slice(0, 32),
    title: String(achievement.title ?? "Achievement").slice(0, 80),
    description: String(achievement.description ?? "Custom server achievement.").slice(0, 180),
    badge: String(achievement.badge ?? "STAR").slice(0, 12),
    userId: String(achievement.userId ?? ""),
    grantedById: String(achievement.grantedById ?? ""),
    grantedByTag: String(achievement.grantedByTag ?? "Unknown").slice(0, 80),
    earnedAt: normalizeTimestamp(achievement.earnedAt)
  };
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isValidMonthDay(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
