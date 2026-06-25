const INVITE_PATTERN = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
const CUSTOM_EMOJI_PATTERN = /<a?:[a-z0-9_]+:\d+>/gi;
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const COMBINING_MARK_PATTERN = /\p{M}/gu;

export class SpamTracker {
  constructor({ maxEntriesPerUser = 80, ghostPingMaxAgeMs = 10 * 60 * 1000 } = {}) {
    this.maxEntriesPerUser = maxEntriesPerUser;
    this.ghostPingMaxAgeMs = ghostPingMaxAgeMs;
    this.buckets = new Map();
    this.mentionMessages = new Map();
  }

  track(message, config, now = Date.now()) {
    const guildId = message.guildId ?? message.guild?.id;
    const userId = message.authorId ?? message.author?.id;

    if (!guildId || !userId || !config.enabled) {
      return emptyResult();
    }

    const key = `${guildId}:${userId}`;
    const windowMs = config.windowSeconds * 1000;
    const previousRecords = this.buckets.get(key) ?? [];
    const records = previousRecords.filter((record) => now - record.timestamp <= windowMs);
    const content = message.content ?? "";
    const normalized = normalizeMessage(content);
    const mentionCount = getMentionCount(message);
    const emojiCount = getEmojiCount(content);
    const zalgoMarkCount = getZalgoMarkCount(content);
    const caps = getCapsStats(content);
    const urls = getUrls(content);
    const hasInvite = INVITE_PATTERN.test(content);

    records.push({
      timestamp: now,
      normalized,
      messageId: message.id,
      channelId: message.channelId,
      mentionCount,
      emojiCount,
      hasInvite
    });

    while (records.length > this.maxEntriesPerUser) {
      records.shift();
    }

    this.buckets.set(key, records);
    this.rememberMentionMessage(message, mentionCount, now);

    const duplicateCount = normalized
      ? records.filter((record) => record.normalized === normalized).length
      : 0;
    const reasons = [];

    if (config.antiFloodEnabled && records.length >= config.messageLimit) {
      reasons.push(`sent ${records.length} messages in ${config.windowSeconds}s`);
    }

    if (config.antiSpamEnabled && normalized && duplicateCount >= config.duplicateLimit) {
      reasons.push(`repeated the same message ${duplicateCount} times`);
    }

    if (isInviteProtectionEnabled(config) && hasInvite) {
      reasons.push("posted a Discord invite link");
    }

    if (config.antiScamEnabled && hasScamLink(urls, config.scamDomains)) {
      reasons.push("posted a suspected scam link");
    }

    if (config.antiBadWordsEnabled && hasBadWord(content, config.badWords)) {
      reasons.push("used a blocked word");
    }

    if (config.antiMentionSpamEnabled && mentionCount >= config.mentionLimit) {
      reasons.push(`mentioned ${mentionCount} targets in one message`);
    }

    if (config.antiEmojiSpamEnabled && emojiCount >= config.emojiLimit) {
      reasons.push(`used ${emojiCount} emoji in one message`);
    }

    if (config.antiZalgoEnabled && zalgoMarkCount >= config.zalgoMarkLimit) {
      reasons.push(`used zalgo text with ${zalgoMarkCount} combining marks`);
    }

    if (
      config.capsProtectionEnabled
      && caps.letterCount >= config.capsMinLength
      && caps.percentage >= config.capsPercentage
    ) {
      reasons.push(`used ${caps.percentage}% capital letters`);
    }

    return {
      spam: reasons.length > 0,
      reasons,
      messageCount: records.length,
      duplicateCount,
      mentionCount,
      emojiCount,
      zalgoMarkCount,
      capsPercentage: caps.percentage,
      hasInvite,
      hasScamLink: hasScamLink(urls, config.scamDomains),
      hasBadWord: hasBadWord(content, config.badWords),
      records: [...records]
    };
  }

  trackDeletedMessage(message, config, now = Date.now()) {
    if (!config.enabled || !config.antiGhostPingEnabled) {
      return emptyResult();
    }

    const record = this.mentionMessages.get(message.id);

    if (!record) {
      return emptyResult();
    }

    this.mentionMessages.delete(message.id);

    if (now - record.timestamp > config.ghostPingWindowSeconds * 1000) {
      return emptyResult();
    }

    return {
      ...emptyResult(),
      spam: true,
      reasons: [`deleted a message that mentioned ${record.mentionCount} target(s)`],
      mentionCount: record.mentionCount,
      records: [record],
      ghostPing: true,
      userId: record.userId,
      channelId: record.channelId,
      guildId: record.guildId
    };
  }

  reset(guildId, userId) {
    this.buckets.delete(`${guildId}:${userId}`);
  }

  rememberMentionMessage(message, mentionCount, now) {
    if (!message.id || mentionCount <= 0) {
      return;
    }

    this.mentionMessages.set(message.id, {
      timestamp: now,
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guildId ?? message.guild?.id,
      userId: message.authorId ?? message.author?.id,
      mentionCount
    });

    for (const [messageId, record] of this.mentionMessages.entries()) {
      if (now - record.timestamp > this.ghostPingMaxAgeMs) {
        this.mentionMessages.delete(messageId);
      }
    }
  }
}

export function normalizeMessage(content) {
  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function getEmojiCount(content) {
  const customCount = content.match(CUSTOM_EMOJI_PATTERN)?.length ?? 0;
  const withoutCustom = content.replace(CUSTOM_EMOJI_PATTERN, "");
  const unicodeCount = withoutCustom.match(UNICODE_EMOJI_PATTERN)?.length ?? 0;

  return customCount + unicodeCount;
}

export function getZalgoMarkCount(content) {
  return content.normalize("NFD").match(COMBINING_MARK_PATTERN)?.length ?? 0;
}

export function getCapsStats(content) {
  const letters = content.match(/\p{L}/gu) ?? [];
  const uppercase = letters.filter((letter) => letter.toUpperCase() === letter && letter.toLowerCase() !== letter);
  const percentage = letters.length === 0 ? 0 : Math.round((uppercase.length / letters.length) * 100);

  return {
    letterCount: letters.length,
    uppercaseCount: uppercase.length,
    percentage
  };
}

export function hasBadWord(content, badWords = []) {
  const normalized = content.toLowerCase();

  return badWords.some((word) => {
    const escaped = escapeRegExp(word);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu");
    return pattern.test(normalized);
  });
}

export function hasScamLink(urls, scamDomains = []) {
  return urls.some((url) => {
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    return scamDomains.some((domain) => {
      const cleanDomain = domain.toLowerCase().replace(/^www\./, "");
      return host === cleanDomain || host.endsWith(`.${cleanDomain}`);
    });
  });
}

export function getUrls(content) {
  return [...content.matchAll(URL_PATTERN)]
    .map(([raw]) => {
      try {
        return new URL(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getMentionCount(message) {
  const users = message.mentions?.users?.size ?? 0;
  const roles = message.mentions?.roles?.size ?? 0;
  const everyone = message.mentions?.everyone ? 1 : 0;

  return users + roles + everyone;
}

function isInviteProtectionEnabled(config) {
  return Boolean(config.antiInviteEnabled || config.blockInvites);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emptyResult() {
  return {
    spam: false,
    reasons: [],
    messageCount: 0,
    duplicateCount: 0,
    mentionCount: 0,
    emojiCount: 0,
    zalgoMarkCount: 0,
    capsPercentage: 0,
    hasInvite: false,
    hasScamLink: false,
    hasBadWord: false,
    ghostPing: false,
    records: []
  };
}
