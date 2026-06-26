import { DEFAULT_COMMAND_PREFIX, normalizeCommandPrefix } from "./messageCommands.js";

export const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

export const COMMAND_TOGGLE_KEYS = Object.freeze([
  "antispam",
  "ban",
  "clear",
  "clearwarnings",
  "achievement",
  "birthday",
  "guessnumber",
  "kick",
  "lockdown",
  "mute",
  "nickreset",
  "purge",
  "slowmode",
  "softban",
  "timeout",
  "unban",
  "unlockdown",
  "unmute",
  "warn",
  "welcometest",
  "warnings"
]);

export const DEFAULT_COMMAND_TOGGLES = Object.freeze(
  Object.fromEntries(COMMAND_TOGGLE_KEYS.map((key) => [key, true]))
);

export const BANNER_THEMES = Object.freeze([
  "classic",
  "neon",
  "pastel",
  "arcade",
  "midnight"
]);

export const DEFAULT_ACHIEVEMENTS = Object.freeze([
  {
    key: "first-win",
    title: "First Win",
    description: "Won a server mini game.",
    badge: "WIN",
    enabled: true
  },
  {
    key: "good-vibes",
    title: "Good Vibes",
    description: "Recognized for keeping the server wholesome.",
    badge: "VIBE",
    enabled: true
  },
  {
    key: "helper",
    title: "Helper",
    description: "Helped another member or the moderation team.",
    badge: "HELP",
    enabled: true
  }
]);

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  autoMute: true,
  messageLimit: 6,
  windowSeconds: 10,
  duplicateLimit: 3,
  mentionLimit: 5,
  muteMinutes: 10,
  deleteSpam: true,
  blockInvites: false,
  antiSpamEnabled: true,
  antiFloodEnabled: true,
  antiInviteEnabled: false,
  antiScamEnabled: true,
  antiBadWordsEnabled: false,
  antiMentionSpamEnabled: true,
  antiEmojiSpamEnabled: true,
  antiZalgoEnabled: true,
  antiGhostPingEnabled: true,
  capsProtectionEnabled: true,
  emojiLimit: 12,
  zalgoMarkLimit: 8,
  capsMinLength: 12,
  capsPercentage: 70,
  ghostPingWindowSeconds: 120,
  strikeMuteMinutes: 360,
  strikeResetHours: 24,
  strikeMuteThreshold: 3,
  badWords: [],
  scamDomains: [
    "discordgift.site",
    "discord-nitro.com",
    "free-nitro.com",
    "nitro-gift.com",
    "steamcommunnity.com",
    "steancommunity.com"
  ],
  commandPrefix: DEFAULT_COMMAND_PREFIX,
  commandToggles: DEFAULT_COMMAND_TOGGLES,
  dmModerationEnabled: true,
  botProfileNick: null,
  botProfileBio: null,
  logChannelId: null,
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeInviteTrackingEnabled: true,
  welcomeShowInviter: true,
  welcomeMessage: "Welcome {mention} to {server}!\nInvited by {inviterName} - they now have {inviterInvites} invites.\nWe hope you enjoy your stay!",
  welcomeBannerEnabled: true,
  welcomeBannerTitle: "Welcome, {username}",
  welcomeBannerSubtitle: "You are member #{memberCount} in {server}.",
  welcomeBannerInviteLine: "Invited by {inviterName} - {inviterInvites} invites",
  welcomeBannerTheme: "classic",
  welcomeBannerBackgroundUrl: null,
  welcomeBannerBackgroundColor: "#20232a",
  welcomeBannerAccentColor: "#5b8def",
  welcomeBannerTextColor: "#ffffff",
  guessNumberEnabled: true,
  guessNumberChannelId: null,
  guessNumberMin: 1,
  guessNumberMax: 100,
  guessNumberMaxAttempts: 12,
  guessNumberBannerEnabled: true,
  guessNumberBannerTheme: "arcade",
  guessNumberBannerTitle: "Guess the Number",
  guessNumberBannerSubtitle: "Pick a number from {min} to {max}.",
  guessNumberWinMessage: "{mention} guessed {number} in {attempts} tries!",
  guessNumberBannerBackgroundUrl: null,
  guessNumberBannerBackgroundColor: "#111827",
  guessNumberBannerAccentColor: "#f59e0b",
  guessNumberBannerTextColor: "#ffffff",
  birthdayEnabled: false,
  birthdayChannelId: null,
  birthdayMessage: "Happy birthday {mention}! Wishing you an amazing day in {server}.",
  birthdayBannerEnabled: true,
  birthdayBannerTheme: "pastel",
  birthdayBannerTitle: "Happy Birthday, {displayName}!",
  birthdayBannerSubtitle: "From everyone in {server}",
  birthdayBannerBackgroundUrl: null,
  birthdayBannerBackgroundColor: "#7c3aed",
  birthdayBannerAccentColor: "#f9a8d4",
  birthdayBannerTextColor: "#ffffff",
  birthdayCheckHour: 9,
  birthdayTimezoneOffsetMinutes: 0,
  achievementsEnabled: true,
  achievementAnnounceEnabled: true,
  achievementAnnounceChannelId: null,
  achievements: DEFAULT_ACHIEVEMENTS,
  ignoredRoleIds: [],
  ignoredChannelIds: []
});

export const NUMERIC_LIMITS = Object.freeze({
  messageLimit: { min: 2, max: 20 },
  windowSeconds: { min: 3, max: 120 },
  duplicateLimit: { min: 2, max: 10 },
  mentionLimit: { min: 1, max: 30 },
  muteMinutes: { min: 1, max: MAX_TIMEOUT_MINUTES },
  emojiLimit: { min: 3, max: 100 },
  zalgoMarkLimit: { min: 3, max: 100 },
  capsMinLength: { min: 5, max: 200 },
  capsPercentage: { min: 50, max: 100 },
  ghostPingWindowSeconds: { min: 10, max: 3600 },
  strikeMuteMinutes: { min: 1, max: MAX_TIMEOUT_MINUTES },
  strikeResetHours: { min: 1, max: 168 },
  strikeMuteThreshold: { min: 1, max: 10 },
  guessNumberMin: { min: 1, max: 999999 },
  guessNumberMax: { min: 2, max: 1000000 },
  guessNumberMaxAttempts: { min: 1, max: 1000 },
  birthdayCheckHour: { min: 0, max: 23 },
  birthdayTimezoneOffsetMinutes: { min: -720, max: 840 }
});

export function normalizeGuildConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };

  return {
    enabled: readBoolean(merged.enabled, DEFAULT_CONFIG.enabled),
    autoMute: readBoolean(merged.autoMute, DEFAULT_CONFIG.autoMute),
    messageLimit: readInteger("messageLimit", merged.messageLimit),
    windowSeconds: readInteger("windowSeconds", merged.windowSeconds),
    duplicateLimit: readInteger("duplicateLimit", merged.duplicateLimit),
    mentionLimit: readInteger("mentionLimit", merged.mentionLimit),
    muteMinutes: readInteger("muteMinutes", merged.muteMinutes),
    deleteSpam: readBoolean(merged.deleteSpam, DEFAULT_CONFIG.deleteSpam),
    blockInvites: readBoolean(merged.blockInvites, DEFAULT_CONFIG.blockInvites),
    antiSpamEnabled: readBoolean(merged.antiSpamEnabled, DEFAULT_CONFIG.antiSpamEnabled),
    antiFloodEnabled: readBoolean(merged.antiFloodEnabled, DEFAULT_CONFIG.antiFloodEnabled),
    antiInviteEnabled: readBoolean(
      merged.antiInviteEnabled ?? merged.blockInvites,
      DEFAULT_CONFIG.antiInviteEnabled
    ),
    antiScamEnabled: readBoolean(merged.antiScamEnabled, DEFAULT_CONFIG.antiScamEnabled),
    antiBadWordsEnabled: readBoolean(
      merged.antiBadWordsEnabled,
      DEFAULT_CONFIG.antiBadWordsEnabled
    ),
    antiMentionSpamEnabled: readBoolean(
      merged.antiMentionSpamEnabled,
      DEFAULT_CONFIG.antiMentionSpamEnabled
    ),
    antiEmojiSpamEnabled: readBoolean(
      merged.antiEmojiSpamEnabled,
      DEFAULT_CONFIG.antiEmojiSpamEnabled
    ),
    antiZalgoEnabled: readBoolean(merged.antiZalgoEnabled, DEFAULT_CONFIG.antiZalgoEnabled),
    antiGhostPingEnabled: readBoolean(
      merged.antiGhostPingEnabled,
      DEFAULT_CONFIG.antiGhostPingEnabled
    ),
    capsProtectionEnabled: readBoolean(
      merged.capsProtectionEnabled,
      DEFAULT_CONFIG.capsProtectionEnabled
    ),
    emojiLimit: readInteger("emojiLimit", merged.emojiLimit),
    zalgoMarkLimit: readInteger("zalgoMarkLimit", merged.zalgoMarkLimit),
    capsMinLength: readInteger("capsMinLength", merged.capsMinLength),
    capsPercentage: readInteger("capsPercentage", merged.capsPercentage),
    ghostPingWindowSeconds: readInteger(
      "ghostPingWindowSeconds",
      merged.ghostPingWindowSeconds
    ),
    strikeMuteMinutes: readInteger("strikeMuteMinutes", merged.strikeMuteMinutes),
    strikeResetHours: readInteger("strikeResetHours", merged.strikeResetHours),
    strikeMuteThreshold: readInteger("strikeMuteThreshold", merged.strikeMuteThreshold),
    badWords: readWordList(merged.badWords),
    scamDomains: readWordList(merged.scamDomains, DEFAULT_CONFIG.scamDomains),
    commandPrefix: normalizeCommandPrefix(
      merged.commandPrefix,
      DEFAULT_CONFIG.commandPrefix
    ),
    commandToggles: readCommandToggles(merged.commandToggles),
    dmModerationEnabled: readBoolean(
      merged.dmModerationEnabled,
      DEFAULT_CONFIG.dmModerationEnabled
    ),
    botProfileNick: readOptionalText(merged.botProfileNick, 32),
    botProfileBio: readOptionalText(merged.botProfileBio, 190),
    logChannelId: readNullableId(merged.logChannelId),
    welcomeEnabled: readBoolean(merged.welcomeEnabled, DEFAULT_CONFIG.welcomeEnabled),
    welcomeChannelId: readNullableId(merged.welcomeChannelId),
    welcomeInviteTrackingEnabled: readBoolean(
      merged.welcomeInviteTrackingEnabled,
      DEFAULT_CONFIG.welcomeInviteTrackingEnabled
    ),
    welcomeShowInviter: readBoolean(
      merged.welcomeShowInviter,
      DEFAULT_CONFIG.welcomeShowInviter
    ),
    welcomeMessage: readText(merged.welcomeMessage, DEFAULT_CONFIG.welcomeMessage, 1000),
    welcomeBannerEnabled: readBoolean(
      merged.welcomeBannerEnabled,
      DEFAULT_CONFIG.welcomeBannerEnabled
    ),
    welcomeBannerTitle: readText(
      merged.welcomeBannerTitle,
      DEFAULT_CONFIG.welcomeBannerTitle,
      120
    ),
    welcomeBannerSubtitle: readText(
      merged.welcomeBannerSubtitle,
      DEFAULT_CONFIG.welcomeBannerSubtitle,
      180
    ),
    welcomeBannerInviteLine: readText(
      merged.welcomeBannerInviteLine,
      DEFAULT_CONFIG.welcomeBannerInviteLine,
      180
    ),
    welcomeBannerTheme: readTheme(
      merged.welcomeBannerTheme,
      DEFAULT_CONFIG.welcomeBannerTheme
    ),
    welcomeBannerBackgroundUrl: readNullableUrl(merged.welcomeBannerBackgroundUrl),
    welcomeBannerBackgroundColor: readColor(
      merged.welcomeBannerBackgroundColor,
      DEFAULT_CONFIG.welcomeBannerBackgroundColor
    ),
    welcomeBannerAccentColor: readColor(
      merged.welcomeBannerAccentColor,
      DEFAULT_CONFIG.welcomeBannerAccentColor
    ),
    welcomeBannerTextColor: readColor(
      merged.welcomeBannerTextColor,
      DEFAULT_CONFIG.welcomeBannerTextColor
    ),
    guessNumberEnabled: readBoolean(
      merged.guessNumberEnabled,
      DEFAULT_CONFIG.guessNumberEnabled
    ),
    guessNumberChannelId: readNullableId(merged.guessNumberChannelId),
    guessNumberMin: readInteger("guessNumberMin", merged.guessNumberMin),
    guessNumberMax: Math.max(
      readInteger("guessNumberMin", merged.guessNumberMin) + 1,
      readInteger("guessNumberMax", merged.guessNumberMax)
    ),
    guessNumberMaxAttempts: readInteger(
      "guessNumberMaxAttempts",
      merged.guessNumberMaxAttempts
    ),
    guessNumberBannerEnabled: readBoolean(
      merged.guessNumberBannerEnabled,
      DEFAULT_CONFIG.guessNumberBannerEnabled
    ),
    guessNumberBannerTheme: readTheme(
      merged.guessNumberBannerTheme,
      DEFAULT_CONFIG.guessNumberBannerTheme
    ),
    guessNumberBannerTitle: readText(
      merged.guessNumberBannerTitle,
      DEFAULT_CONFIG.guessNumberBannerTitle,
      120
    ),
    guessNumberBannerSubtitle: readText(
      merged.guessNumberBannerSubtitle,
      DEFAULT_CONFIG.guessNumberBannerSubtitle,
      180
    ),
    guessNumberWinMessage: readText(
      merged.guessNumberWinMessage,
      DEFAULT_CONFIG.guessNumberWinMessage,
      300
    ),
    guessNumberBannerBackgroundUrl: readNullableUrl(merged.guessNumberBannerBackgroundUrl),
    guessNumberBannerBackgroundColor: readColor(
      merged.guessNumberBannerBackgroundColor,
      DEFAULT_CONFIG.guessNumberBannerBackgroundColor
    ),
    guessNumberBannerAccentColor: readColor(
      merged.guessNumberBannerAccentColor,
      DEFAULT_CONFIG.guessNumberBannerAccentColor
    ),
    guessNumberBannerTextColor: readColor(
      merged.guessNumberBannerTextColor,
      DEFAULT_CONFIG.guessNumberBannerTextColor
    ),
    birthdayEnabled: readBoolean(merged.birthdayEnabled, DEFAULT_CONFIG.birthdayEnabled),
    birthdayChannelId: readNullableId(merged.birthdayChannelId),
    birthdayMessage: readText(merged.birthdayMessage, DEFAULT_CONFIG.birthdayMessage, 1000),
    birthdayBannerEnabled: readBoolean(
      merged.birthdayBannerEnabled,
      DEFAULT_CONFIG.birthdayBannerEnabled
    ),
    birthdayBannerTheme: readTheme(
      merged.birthdayBannerTheme,
      DEFAULT_CONFIG.birthdayBannerTheme
    ),
    birthdayBannerTitle: readText(
      merged.birthdayBannerTitle,
      DEFAULT_CONFIG.birthdayBannerTitle,
      120
    ),
    birthdayBannerSubtitle: readText(
      merged.birthdayBannerSubtitle,
      DEFAULT_CONFIG.birthdayBannerSubtitle,
      180
    ),
    birthdayBannerBackgroundUrl: readNullableUrl(merged.birthdayBannerBackgroundUrl),
    birthdayBannerBackgroundColor: readColor(
      merged.birthdayBannerBackgroundColor,
      DEFAULT_CONFIG.birthdayBannerBackgroundColor
    ),
    birthdayBannerAccentColor: readColor(
      merged.birthdayBannerAccentColor,
      DEFAULT_CONFIG.birthdayBannerAccentColor
    ),
    birthdayBannerTextColor: readColor(
      merged.birthdayBannerTextColor,
      DEFAULT_CONFIG.birthdayBannerTextColor
    ),
    birthdayCheckHour: readInteger("birthdayCheckHour", merged.birthdayCheckHour),
    birthdayTimezoneOffsetMinutes: readInteger(
      "birthdayTimezoneOffsetMinutes",
      merged.birthdayTimezoneOffsetMinutes
    ),
    achievementsEnabled: readBoolean(
      merged.achievementsEnabled,
      DEFAULT_CONFIG.achievementsEnabled
    ),
    achievementAnnounceEnabled: readBoolean(
      merged.achievementAnnounceEnabled,
      DEFAULT_CONFIG.achievementAnnounceEnabled
    ),
    achievementAnnounceChannelId: readNullableId(merged.achievementAnnounceChannelId),
    achievements: readAchievements(merged.achievements),
    ignoredRoleIds: readUniqueIds(merged.ignoredRoleIds),
    ignoredChannelIds: readUniqueIds(merged.ignoredChannelIds)
  };
}

export function isCommandEnabled(config, commandName) {
  return config.commandToggles?.[commandName] !== false;
}

export function updateIdList(ids, id, action) {
  const next = new Set(readUniqueIds(ids));

  if (action === "add") {
    next.add(id);
  } else if (action === "remove") {
    next.delete(id);
  }

  return [...next];
}

function readBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function readInteger(key, value) {
  const limits = NUMERIC_LIMITS[key];
  const fallback = DEFAULT_CONFIG[key];
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(limits.max, Math.max(limits.min, Math.round(number)));
}

function readNullableId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function readText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function readOptionalText(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readWordList(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;

  return [
    ...new Set(
      source
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 120))
    )
  ];
}

function readCommandToggles(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return Object.fromEntries(
    COMMAND_TOGGLE_KEYS.map((key) => [
      key,
      typeof source[key] === "boolean" ? source[key] : DEFAULT_COMMAND_TOGGLES[key]
    ])
  );
}

function readTheme(value, fallback) {
  return BANNER_THEMES.includes(value) ? value : fallback;
}

function readAchievements(value) {
  const source = typeof value === "string"
    ? value.split(/\r?\n/).map(parseAchievementLine)
    : Array.isArray(value)
      ? value
      : DEFAULT_ACHIEVEMENTS;
  const seen = new Set();
  const achievements = [];

  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const key = readAchievementKey(item.key);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    achievements.push({
      key,
      title: readText(item.title, key, 80),
      description: readText(item.description, "Custom server achievement.", 180),
      badge: readText(item.badge, key.slice(0, 8).toUpperCase(), 12),
      enabled: readBoolean(item.enabled, true)
    });
  }

  return achievements.length ? achievements.slice(0, 30) : [...DEFAULT_ACHIEVEMENTS];
}

function parseAchievementLine(line) {
  const trimmed = String(line).trim();

  if (!trimmed) {
    return null;
  }

  const [key, title, description, badge, enabled = "true"] = trimmed
    .split("|")
    .map((part) => part.trim());

  return {
    key,
    title,
    description,
    badge,
    enabled: !["false", "off", "0", "disabled"].includes(enabled.toLowerCase())
  };
}

function readAchievementKey(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
  return key.replace(/^-+|-+$/g, "");
}

function readNullableUrl(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  try {
    const url = new URL(String(value).trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function readColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function readUniqueIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(Boolean).map(String))];
}
