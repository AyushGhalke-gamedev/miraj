import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { MAX_TIMEOUT_MINUTES } from "./config.js";

export function shouldSkipMessage(message, config) {
  if (!message.guild || message.author?.bot || message.system || message.webhookId) {
    return true;
  }

  if (!config.enabled || config.ignoredChannelIds.includes(message.channelId)) {
    return true;
  }

  const member = message.member;

  if (!member) {
    return false;
  }

  if (config.ignoredRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
    return true;
  }

  return member.permissions.has(PermissionFlagsBits.Administrator)
    || member.permissions.has(PermissionFlagsBits.ManageMessages)
    || member.permissions.has(PermissionFlagsBits.ModerateMembers);
}

export function canTimeoutMember(member, botMember) {
  if (!member) {
    return { ok: false, reason: "Member could not be fetched." };
  }

  if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return { ok: false, reason: "Bot is missing the Moderate Members permission." };
  }

  if (!member.moderatable) {
    return {
      ok: false,
      reason: "Target is above the bot in role hierarchy, is the server owner, or cannot be moderated."
    };
  }

  return { ok: true, reason: null };
}

export function canKickMember(member, botMember) {
  if (!member) {
    return { ok: false, reason: "Member could not be fetched." };
  }

  if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
    return { ok: false, reason: "Bot is missing the Kick Members permission." };
  }

  if (!member.kickable) {
    return {
      ok: false,
      reason: "Target is above the bot in role hierarchy, is the server owner, or cannot be kicked."
    };
  }

  return { ok: true, reason: null };
}

export function canBanUser(member, botMember) {
  if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return { ok: false, reason: "Bot is missing the Ban Members permission." };
  }

  if (member && !member.bannable) {
    return {
      ok: false,
      reason: "Target is above the bot in role hierarchy, is the server owner, or cannot be banned."
    };
  }

  return { ok: true, reason: null };
}

export function canManageMessages(channel, botMember) {
  const permissions = botMember?.permissionsIn?.(channel);

  if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
    return { ok: false, reason: "Bot is missing the Manage Messages permission in this channel." };
  }

  if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
    return { ok: false, reason: "Bot is missing the Read Message History permission in this channel." };
  }

  return { ok: true, reason: null };
}

export function canManageChannel(channel, botMember) {
  const permissions = botMember?.permissionsIn?.(channel);

  if (!permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, reason: "Bot is missing the Manage Channels permission in this channel." };
  }

  return { ok: true, reason: null };
}

export function canManageNickname(member, botMember) {
  if (!member) {
    return { ok: false, reason: "Member could not be fetched." };
  }

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return { ok: false, reason: "Bot is missing the Manage Nicknames permission." };
  }

  if (!member.manageable) {
    return {
      ok: false,
      reason: "Target is above the bot in role hierarchy, is the server owner, or cannot be managed."
    };
  }

  return { ok: true, reason: null };
}

export async function timeoutMember(member, minutes, reason) {
  const safeMinutes = Math.min(MAX_TIMEOUT_MINUTES, Math.max(1, Math.round(minutes)));
  await member.timeout(safeMinutes * 60 * 1000, reason);
  return safeMinutes;
}

export async function clearMemberTimeout(member, reason) {
  await member.timeout(null, reason);
}

export async function deleteSpamMessages(message, records) {
  const messageIds = [
    ...new Set(
      records
        .filter((record) => record.channelId === message.channelId && record.messageId)
        .map((record) => record.messageId)
    )
  ];

  if (typeof message.channel?.bulkDelete === "function" && messageIds.length > 1) {
    const deleted = await message.channel.bulkDelete(messageIds, true);
    return deleted.size;
  }

  if (message.deletable) {
    await message.delete();
    return 1;
  }

  return 0;
}

export async function sendSpamLog(guild, config, details) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Anti-spam action")
    .setColor(details.muted ? 0xd94848 : 0xf59f00)
    .setTimestamp()
    .addFields(
      { name: "User", value: `${details.user.tag} (${details.user.id})`, inline: false },
      { name: "Channel", value: `<#${details.channelId}>`, inline: true },
      { name: "Action", value: details.action, inline: true },
      { name: "Reason", value: details.reason.slice(0, 1024), inline: false }
    );

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

export async function sendModerationLog(guild, config, details) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return;
  }

  const fields = [
    { name: "Action", value: details.action, inline: true },
    { name: "Moderator", value: details.moderator, inline: true }
  ];

  if (details.target) {
    fields.push({ name: "Target", value: details.target, inline: false });
  }

  if (details.channelId) {
    fields.push({ name: "Channel", value: `<#${details.channelId}>`, inline: true });
  }

  if (details.reason) {
    fields.push({ name: "Reason", value: details.reason.slice(0, 1024), inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle("Moderation action")
    .setColor(details.color ?? 0x4c6ef5)
    .setTimestamp()
    .addFields(fields);

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

export async function sendModerationDm(user, guild, config, details) {
  if (!config.dmModerationEnabled || !user?.send) {
    return false;
  }

  const content = buildModerationDmContent(guild, details);
  const sent = await user.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
  return Boolean(sent);
}

export function buildModerationDmContent(guild, details) {
  const lines = [
    `Moderation notice from ${guild.name}`,
    `Action: ${details.action}`
  ];

  if (details.duration) {
    lines.push(`Duration: ${details.duration}`);
  }

  if (details.reason) {
    lines.push(`Reason: ${details.reason}`);
  }

  if (details.moderator) {
    lines.push(`Moderator: ${details.moderator}`);
  }

  if (details.extra) {
    lines.push(details.extra);
  }

  return lines.join("\n");
}

export function formatMinutes(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = minutes / 60;

  if (hours < 24 && Number.isInteger(hours)) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = minutes / (60 * 24);

  if (Number.isInteger(days)) {
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return `${minutes} minutes`;
}

export function formatConfig(config) {
  return [
    `Enabled: ${yesNo(config.enabled)}`,
    `Auto mute: ${yesNo(config.autoMute)}`,
    `Delete spam: ${yesNo(config.deleteSpam)}`,
    `Anti flood: ${yesNo(config.antiFloodEnabled)} (${config.messageLimit} messages / ${config.windowSeconds}s)`,
    `Anti spam repeats: ${yesNo(config.antiSpamEnabled)} (${config.duplicateLimit} duplicates)`,
    `Anti invites: ${yesNo(config.antiInviteEnabled || config.blockInvites)}`,
    `Anti scam links: ${yesNo(config.antiScamEnabled)}`,
    `Anti bad words: ${yesNo(config.antiBadWordsEnabled)} (${config.badWords.length} words)`,
    `Anti mentions: ${yesNo(config.antiMentionSpamEnabled)} (${config.mentionLimit} mentions)`,
    `Anti emoji: ${yesNo(config.antiEmojiSpamEnabled)} (${config.emojiLimit} emoji)`,
    `Anti zalgo: ${yesNo(config.antiZalgoEnabled)} (${config.zalgoMarkLimit} marks)`,
    `Caps protection: ${yesNo(config.capsProtectionEnabled)} (${config.capsPercentage}% caps)`,
    `Ghost ping protection: ${yesNo(config.antiGhostPingEnabled)}`,
    `Strike action: ${config.strikeMuteThreshold} warnings -> ${formatMinutes(config.strikeMuteMinutes)} mute`,
    `Strike reset: ${config.strikeResetHours} hour${config.strikeResetHours === 1 ? "" : "s"}`,
    `DM moderation notices: ${yesNo(config.dmModerationEnabled)}`,
    `Log channel: ${config.logChannelId ? `<#${config.logChannelId}>` : "not set"}`,
    `Ignored channels: ${config.ignoredChannelIds.length}`,
    `Ignored roles: ${config.ignoredRoleIds.length}`
  ].join("\n");
}

function yesNo(value) {
  return value ? "yes" : "no";
}
