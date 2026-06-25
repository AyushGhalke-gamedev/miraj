export const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

export const COMMAND_TOGGLE_KEYS = Object.freeze([
  "antispam",
  "ban",
  "clear",
  "clearwarnings",
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
  "warnings"
]);

export const DEFAULT_COMMAND_TOGGLES = Object.freeze(
  Object.fromEntries(COMMAND_TOGGLE_KEYS.map((key) => [key, true]))
);

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
  commandToggles: DEFAULT_COMMAND_TOGGLES,
  dmModerationEnabled: true,
  botProfileNick: null,
  botProfileBio: null,
  logChannelId: null,
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: "Welcome to {server}, {mention}! We're so glad you're here.",
  welcomeBannerEnabled: true,
  welcomeBannerTitle: "Welcome, {username}",
  welcomeBannerSubtitle: "You are member #{memberCount} in {server}.",
  welcomeBannerBackgroundUrl: null,
  welcomeBannerBackgroundColor: "#20232a",
  welcomeBannerAccentColor: "#5b8def",
  welcomeBannerTextColor: "#ffffff",
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
  strikeMuteThreshold: { min: 1, max: 10 }
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
