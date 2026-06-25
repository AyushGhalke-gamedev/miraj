import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { isCommandEnabled, updateIdList } from "./config.js";
import { startDashboard } from "./dashboard.js";
import { InviteTracker } from "./inviteTracker.js";
import { configStore } from "./store.js";
import { SpamTracker } from "./spamDetector.js";
import { buildWelcomePayload, sendWelcome } from "./welcome.js";
import {
  canBanUser,
  canKickMember,
  canManageChannel,
  canManageMessages,
  canManageNickname,
  canTimeoutMember,
  clearMemberTimeout,
  deleteSpamMessages,
  formatConfig,
  formatMinutes,
  sendModerationLog,
  sendModerationDm,
  sendSpamLog,
  shouldSkipMessage,
  timeoutMember
} from "./moderation.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN in your environment.");
  process.exit(1);
}

await configStore.load();

const spamTracker = new SpamTracker();
const inviteTracker = new InviteTracker();
let dashboardStarted = false;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  allowedMentions: { parse: [] }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}. Watching ${readyClient.guilds.cache.size} servers.`);
  inviteTracker.warmGuilds(readyClient.guilds.cache).catch((error) => {
    console.warn(`Could not warm invite cache: ${error.message}`);
  });

  if (!dashboardStarted) {
    startDashboard(readyClient, configStore);
    dashboardStarted = true;
  }
});

client.on(Events.InviteCreate, (invite) => {
  inviteTracker.rememberCreatedInvite(invite);
});

client.on(Events.InviteDelete, (invite) => {
  inviteTracker.forgetDeletedInvite(invite);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMessage(message);
  } catch (error) {
    console.error("Failed to process message:", error);
  }
});

client.on(Events.MessageDelete, async (message) => {
  try {
    await handleDeletedMessage(message);
  } catch (error) {
    console.error("Failed to process deleted message:", error);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const sent = await sendWelcome(member, configStore, inviteTracker);

    if (!sent) {
      const config = configStore.get(member.guild.id);
      console.warn(
        `Welcome skipped for ${member.user.tag} in ${member.guild.name}. Enabled: ${config.welcomeEnabled}; channel: ${config.welcomeChannelId ?? "not set"}`
      );
    }
  } catch (error) {
    console.error("Failed to send welcome message:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) {
    return;
  }

  try {
    if (!await ensureAdministrator(interaction)) {
      return;
    }

    if (!await ensureCommandEnabled(interaction)) {
      return;
    }

    if (interaction.commandName === "antispam") {
      await handleAntispamCommand(interaction);
    } else if (interaction.commandName === "mute" || interaction.commandName === "timeout") {
      await handleMuteCommand(interaction);
    } else if (interaction.commandName === "unmute") {
      await handleUnmuteCommand(interaction);
    } else if (interaction.commandName === "warn") {
      await handleWarnCommand(interaction);
    } else if (interaction.commandName === "warnings") {
      await handleWarningsCommand(interaction);
    } else if (interaction.commandName === "clearwarnings") {
      await handleClearWarningsCommand(interaction);
    } else if (interaction.commandName === "kick") {
      await handleKickCommand(interaction);
    } else if (interaction.commandName === "ban") {
      await handleBanCommand(interaction);
    } else if (interaction.commandName === "unban") {
      await handleUnbanCommand(interaction);
    } else if (interaction.commandName === "softban") {
      await handleSoftbanCommand(interaction);
    } else if (interaction.commandName === "purge" || interaction.commandName === "clear") {
      await handlePurgeCommand(interaction);
    } else if (interaction.commandName === "slowmode") {
      await handleSlowmodeCommand(interaction);
    } else if (interaction.commandName === "lockdown") {
      await handleLockdownCommand(interaction, true);
    } else if (interaction.commandName === "unlockdown") {
      await handleLockdownCommand(interaction, false);
    } else if (interaction.commandName === "nickreset") {
      await handleNickresetCommand(interaction);
    } else if (interaction.commandName === "welcometest") {
      await handleWelcomeTestCommand(interaction);
    }
  } catch (error) {
    console.error("Failed to handle command:", error);
    await replySafely(interaction, {
      content: "Something went wrong while running that command."
    });
  }
});

await client.login(token);

async function handleMessage(message) {
  if (!message.guild) {
    return;
  }

  const config = configStore.get(message.guild.id);

  if (shouldSkipMessage(message, config)) {
    return;
  }

  const result = spamTracker.track(message, config);

  if (!result.spam) {
    return;
  }

  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  await applyAutomodViolation({
    guild: message.guild,
    user: message.author,
    member,
    channelId: message.channelId,
    message,
    result,
    config
  });
}

async function handleDeletedMessage(message) {
  if (!message.guild) {
    return;
  }

  const config = configStore.get(message.guild.id);

  if (!config.enabled || config.ignoredChannelIds.includes(message.channelId)) {
    return;
  }

  const result = spamTracker.trackDeletedMessage(message, config);

  if (!result.spam || !result.userId) {
    return;
  }

  const [user, member] = await Promise.all([
    client.users.fetch(result.userId).catch(() => null),
    message.guild.members.fetch(result.userId).catch(() => null)
  ]);

  if (!user) {
    return;
  }

  await applyAutomodViolation({
    guild: message.guild,
    user,
    member,
    channelId: result.channelId,
    message: null,
    result,
    config
  });
}

async function applyAutomodViolation({ guild, user, member, channelId, message, result, config }) {
  const reason = result.reasons.join("; ");
  const now = Date.now();
  let deletedCount = 0;

  if (config.deleteSpam && message) {
    deletedCount = await deleteSpamMessages(message, result.records).catch((error) => {
      console.warn(`Could not delete violating message(s): ${error.message}`);
      return 0;
    });
  }

  const warning = await configStore.addWarning(guild.id, user.id, {
    moderatorId: client.user.id,
    moderatorTag: "AutoMod",
    reason,
    source: "automod",
    createdAt: now
  });
  const activeWarnings = configStore.getActiveWarnings(guild.id, user.id, {
    source: "automod",
    since: now - config.strikeResetHours * 60 * 60 * 1000
  });
  const activeCount = activeWarnings.length;
  let action = `Warning ${activeCount}/${config.strikeMuteThreshold}`;
  let muted = false;

  if (config.autoMute && activeCount >= config.strikeMuteThreshold) {
    const botMember = await getBotMember(guild);
    const check = canTimeoutMember(member, botMember);

    if (check.ok) {
      const minutes = await timeoutMember(member, config.strikeMuteMinutes, `AutoMod: ${reason}`);
      action = `Timed out for ${formatMinutes(minutes)} after ${activeCount} active warning(s)`;
      muted = true;
      spamTracker.reset(guild.id, user.id);
    } else {
      action = `Warning ${activeCount}/${config.strikeMuteThreshold}; could not timeout: ${check.reason}`;
    }
  }

  await sendModerationDm(user, guild, config, {
    action: muted ? "AutoMod timeout" : "AutoMod warning",
    duration: muted ? formatMinutes(config.strikeMuteMinutes) : null,
    reason,
    moderator: "AutoMod",
    extra: `Active AutoMod warnings: ${activeCount}/${config.strikeMuteThreshold}.`
  });

  await sendSpamLog(guild, config, {
    user,
    channelId,
    reason: `${reason}${deletedCount ? `; deleted ${deletedCount} message(s)` : ""}; warning ID ${warning.id}`,
    action,
    muted
  });
}

async function handleAntispamCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
    const config = configStore.get(interaction.guild.id);
    await replySafely(interaction, {
      content: `Current anti-spam settings:\n\`\`\`\n${formatConfig(config)}\n\`\`\``
    });
    return;
  }

  if (subcommand === "set") {
    const patch = readAntispamPatch(interaction);

    if (Object.keys(patch).length === 0) {
      await replySafely(interaction, {
        content: "No settings were changed. Add at least one option to update."
      });
      return;
    }

    const updated = await configStore.update(interaction.guild.id, patch);
    await replySafely(interaction, {
      content: `Updated anti-spam settings:\n\`\`\`\n${formatConfig(updated)}\n\`\`\``
    });
    return;
  }

  if (subcommand === "ignore-channel") {
    const action = interaction.options.getString("action", true);
    const channel = interaction.options.getChannel("channel", true);
    const config = configStore.get(interaction.guild.id);
    const ignoredChannelIds = updateIdList(config.ignoredChannelIds, channel.id, action);

    await configStore.update(interaction.guild.id, { ignoredChannelIds });
    await replySafely(interaction, {
      content: `${action === "add" ? "Ignored" : "Watching"} <#${channel.id}>.`
    });
    return;
  }

  if (subcommand === "ignore-role") {
    const action = interaction.options.getString("action", true);
    const role = interaction.options.getRole("role", true);
    const config = configStore.get(interaction.guild.id);
    const ignoredRoleIds = updateIdList(config.ignoredRoleIds, role.id, action);

    await configStore.update(interaction.guild.id, { ignoredRoleIds });
    await replySafely(interaction, {
      content: `${action === "add" ? "Ignored" : "Watching"} role ${role.name}.`
    });
  }
}

async function handleMuteCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason") ?? `Manual timeout by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const botMember = await getBotMember(interaction.guild);
  const check = canTimeoutMember(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  const safeMinutes = await timeoutMember(member, minutes, reason);
  await notifyModerationTarget(interaction, user, {
    action: "Timeout",
    duration: formatMinutes(safeMinutes),
    reason
  });
  await logModerationAction(interaction, {
    action: "Timeout",
    target: formatUser(user),
    reason: `${formatMinutes(safeMinutes)} - ${reason}`,
    color: 0xf59f00
  });
  await replySafely(interaction, {
    content: `Timed out ${user.tag} for ${formatMinutes(safeMinutes)}.`
  });
}

async function handleUnmuteCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? `Timeout removed by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await replySafely(interaction, { content: "That member could not be found in this server." });
    return;
  }

  const botMember = await getBotMember(interaction.guild);
  const check = canTimeoutMember(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  await clearMemberTimeout(member, reason);
  await notifyModerationTarget(interaction, user, {
    action: "Timeout removed",
    reason
  });
  await logModerationAction(interaction, {
    action: "Remove timeout",
    target: formatUser(user),
    reason,
    color: 0x51cf66
  });
  await replySafely(interaction, {
    content: `Removed timeout from ${user.tag}.`
  });
}

async function handleWarnCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const warning = await configStore.addWarning(interaction.guild.id, user.id, {
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    reason,
    createdAt: Date.now()
  });
  const warningCount = configStore.getWarnings(interaction.guild.id, user.id).length;

  await logModerationAction(interaction, {
    action: "Warn",
    target: formatUser(user),
    reason,
    color: 0xffd43b
  });
  await notifyModerationTarget(interaction, user, {
    action: "Warning",
    reason,
    extra: `Warning ID: ${warning.id}. Total warnings: ${warningCount}.`
  });
  await replySafely(interaction, {
    content: `Warned ${user.tag}. They now have ${warningCount} warning${warningCount === 1 ? "" : "s"}. Warning ID: ${warning.id}`
  });
}

async function handleWarningsCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const warnings = configStore.getWarnings(interaction.guild.id, user.id);

  await replySafely(interaction, {
    content: formatWarnings(user, warnings)
  });
}

async function handleClearWarningsCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount");
  const cleared = await configStore.clearWarnings(interaction.guild.id, user.id, amount);

  await notifyModerationTarget(interaction, user, {
    action: "Warnings cleared",
    reason: amount ? `${cleared} recent warning(s) cleared.` : `All ${cleared} warning(s) cleared.`
  });
  await logModerationAction(interaction, {
    action: "Clear warnings",
    target: formatUser(user),
    reason: amount ? `Cleared ${cleared} recent warning(s).` : `Cleared all ${cleared} warning(s).`,
    color: 0x51cf66
  });
  await replySafely(interaction, {
    content: `Cleared ${cleared} warning${cleared === 1 ? "" : "s"} for ${user.tag}.`
  });
}

async function handleKickCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? `Kicked by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const botMember = await getBotMember(interaction.guild);
  const check = canKickMember(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  await notifyModerationTarget(interaction, user, {
    action: "Kick",
    reason
  });
  await member.kick(reason);
  await logModerationAction(interaction, {
    action: "Kick",
    target: formatUser(user),
    reason,
    color: 0xff922b
  });
  await replySafely(interaction, {
    content: `Kicked ${user.tag}.`
  });
}

async function handleBanCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const deleteMessageDays = interaction.options.getInteger("delete_message_days") ?? 0;
  const reason = interaction.options.getString("reason") ?? `Banned by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const botMember = await getBotMember(interaction.guild);
  const check = canBanUser(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  await notifyModerationTarget(interaction, user, {
    action: "Ban",
    reason,
    extra: deleteMessageDays ? `${deleteMessageDays} day(s) of recent messages may be deleted.` : null
  });
  await interaction.guild.members.ban(user.id, {
    deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
    reason
  });
  await logModerationAction(interaction, {
    action: "Ban",
    target: formatUser(user),
    reason: `${reason}${deleteMessageDays ? `; deleted ${deleteMessageDays} day(s) of messages` : ""}`,
    color: 0xd94848
  });
  await replySafely(interaction, {
    content: `Banned ${user.tag}.`
  });
}

async function handleUnbanCommand(interaction) {
  const userId = interaction.options.getString("user_id", true).trim();
  const reason = interaction.options.getString("reason") ?? `Unbanned by ${interaction.user.tag}`;
  const botMember = await getBotMember(interaction.guild);
  const check = canBanUser(null, botMember);

  if (!/^\d{17,20}$/.test(userId)) {
    await replySafely(interaction, { content: "That does not look like a valid Discord user ID." });
    return;
  }

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  const unbanned = await interaction.guild.bans.remove(userId, reason).catch(() => null);

  if (!unbanned) {
    await replySafely(interaction, { content: `Could not find an active ban for user ID ${userId}.` });
    return;
  }

  await notifyModerationTarget(interaction, unbanned, {
    action: "Unban",
    reason
  });
  await logModerationAction(interaction, {
    action: "Unban",
    target: userId,
    reason,
    color: 0x51cf66
  });
  await replySafely(interaction, {
    content: `Removed ban for user ID ${userId}.`
  });
}

async function handleSoftbanCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const deleteMessageDays = interaction.options.getInteger("delete_message_days") ?? 1;
  const reason = interaction.options.getString("reason") ?? `Softbanned by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const botMember = await getBotMember(interaction.guild);
  const check = canBanUser(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  await notifyModerationTarget(interaction, user, {
    action: "Softban",
    reason,
    extra: `${deleteMessageDays} day(s) of recent messages may be deleted. The ban will be removed immediately.`
  });
  await interaction.guild.members.ban(user.id, {
    deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
    reason
  });
  await interaction.guild.bans.remove(user.id, `Softban release: ${reason}`);
  await logModerationAction(interaction, {
    action: "Softban",
    target: formatUser(user),
    reason: `${reason}; deleted ${deleteMessageDays} day(s) of messages`,
    color: 0xff922b
  });
  await replySafely(interaction, {
    content: `Softbanned ${user.tag} and removed the ban.`
  });
}

async function handlePurgeCommand(interaction) {
  const amount = interaction.options.getInteger("amount", true);
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason") ?? `Purged by ${interaction.user.tag}`;
  const botMember = await getBotMember(interaction.guild);
  const check = canManageMessages(interaction.channel, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  const targets = user
    ? fetched.filter((message) => message.author.id === user.id).first(amount)
    : fetched.first(amount);
  const deleted = await deleteMessages(interaction.channel, targets);

  await logModerationAction(interaction, {
    action: interaction.commandName === "clear" ? "Clear" : "Purge",
    target: user ? formatUser(user) : "Recent channel messages",
    channelId: interaction.channelId,
    reason: `${deleted} message(s) deleted. ${reason}`,
    color: 0x4c6ef5
  });
  await replySafely(interaction, {
    content: `Deleted ${deleted} message${deleted === 1 ? "" : "s"}${user ? ` from ${user.tag}` : ""}.`
  });
}

async function handleSlowmodeCommand(interaction) {
  const seconds = interaction.options.getInteger("seconds", true);
  const reason = interaction.options.getString("reason") ?? `Slowmode changed by ${interaction.user.tag}`;
  const botMember = await getBotMember(interaction.guild);
  const check = canManageChannel(interaction.channel, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  if (typeof interaction.channel?.setRateLimitPerUser !== "function") {
    await replySafely(interaction, { content: "This channel does not support slowmode." });
    return;
  }

  await interaction.channel.setRateLimitPerUser(seconds, reason);
  await logModerationAction(interaction, {
    action: "Slowmode",
    channelId: interaction.channelId,
    reason: seconds === 0 ? `Disabled. ${reason}` : `Set to ${seconds}s. ${reason}`,
    color: 0x4c6ef5
  });
  await replySafely(interaction, {
    content: seconds === 0 ? "Slowmode disabled." : `Slowmode set to ${seconds} second${seconds === 1 ? "" : "s"}.`
  });
}

async function handleLockdownCommand(interaction, locked) {
  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  const reason = interaction.options.getString("reason")
    ?? `${locked ? "Locked" : "Unlocked"} by ${interaction.user.tag}`;
  const botMember = await getBotMember(interaction.guild);
  const check = canManageChannel(channel, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  if (typeof channel?.permissionOverwrites?.edit !== "function") {
    await replySafely(interaction, { content: "That channel does not support permission overwrites." });
    return;
  }

  await channel.permissionOverwrites.edit(
    interaction.guild.roles.everyone,
    { SendMessages: locked ? false : null },
    { reason }
  );
  await logModerationAction(interaction, {
    action: locked ? "Lockdown" : "Unlockdown",
    channelId: channel.id,
    reason,
    color: locked ? 0xd94848 : 0x51cf66
  });
  await replySafely(interaction, {
    content: locked ? `Locked <#${channel.id}>.` : `Unlocked <#${channel.id}>.`
  });
}

async function handleNickresetCommand(interaction) {
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? `Nickname reset by ${interaction.user.tag}`;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const botMember = await getBotMember(interaction.guild);
  const check = canManageNickname(member, botMember);

  if (!check.ok) {
    await replySafely(interaction, { content: check.reason });
    return;
  }

  await member.setNickname(null, reason);
  await notifyModerationTarget(interaction, user, {
    action: "Nickname reset",
    reason
  });
  await logModerationAction(interaction, {
    action: "Nickname reset",
    target: formatUser(user),
    reason,
    color: 0x4c6ef5
  });
  await replySafely(interaction, {
    content: `Reset ${user.tag}'s server nickname.`
  });
}

async function handleWelcomeTestCommand(interaction) {
  const config = configStore.get(interaction.guild.id);
  const overrideChannel = interaction.options.getChannel("channel");
  const user = interaction.options.getUser("user") ?? interaction.user;

  if (!overrideChannel && !config.welcomeEnabled) {
    await replySafely(interaction, {
      content: "Welcome messages are disabled. Enable Welcome in the dashboard, or pass a channel to `/welcometest` for a one-off preview."
    });
    return;
  }

  const channel = overrideChannel
    ?? await interaction.guild.channels.fetch(config.welcomeChannelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    await replySafely(interaction, {
      content: "No valid welcome channel is configured. Set one in the dashboard or pass a channel to `/welcometest`."
    });
    return;
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await replySafely(interaction, {
      content: "That user is not a member of this server."
    });
    return;
  }

  const payload = await buildWelcomePayload(member, config, {
    code: "test",
    inviterId: interaction.user.id,
    inviterTag: interaction.user.tag,
    inviterUsername: interaction.user.username,
    inviterMention: `<@${interaction.user.id}>`,
    inviterInvites: 1
  });

  await channel.send(payload);
  await replySafely(interaction, {
    content: `Sent a test welcome for ${user.tag} in <#${channel.id}>.`
  });
}

function readAntispamPatch(interaction) {
  const patch = {};
  const booleanOptions = [
    ["enabled", "enabled"],
    ["auto_mute", "autoMute"],
    ["delete_spam", "deleteSpam"],
    ["block_invites", "blockInvites"]
  ];
  const integerOptions = [
    ["message_limit", "messageLimit"],
    ["window_seconds", "windowSeconds"],
    ["duplicate_limit", "duplicateLimit"],
    ["mention_limit", "mentionLimit"],
    ["mute_minutes", "strikeMuteMinutes"]
  ];

  for (const [optionName, configKey] of booleanOptions) {
    const value = interaction.options.getBoolean(optionName);

    if (value !== null) {
      patch[configKey] = value;
    }
  }

  for (const [optionName, configKey] of integerOptions) {
    const value = interaction.options.getInteger(optionName);

    if (value !== null) {
      patch[configKey] = value;
    }
  }

  const logChannel = interaction.options.getChannel("log_channel");

  if (logChannel) {
    patch.logChannelId = logChannel.id;
  }

  if (interaction.options.getBoolean("clear_log_channel")) {
    patch.logChannelId = null;
  }

  return patch;
}

async function ensureAdministrator(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  await replySafely(interaction, {
    content: "Only server administrators can use this bot's commands."
  });
  return false;
}

async function ensureCommandEnabled(interaction) {
  const config = configStore.get(interaction.guild.id);

  if (isCommandEnabled(config, interaction.commandName)) {
    return true;
  }

  await replySafely(interaction, {
    content: `/${interaction.commandName} is currently disabled for this server.`
  });
  return false;
}

async function getBotMember(guild) {
  return guild.members.me ?? await guild.members.fetchMe();
}

async function deleteMessages(channel, messages) {
  const targets = Array.isArray(messages) ? messages.filter(Boolean) : [...messages.values()];

  if (targets.length === 0) {
    return 0;
  }

  if (targets.length === 1) {
    await targets[0].delete();
    return 1;
  }

  const deleted = await channel.bulkDelete(targets, true);
  return deleted.size;
}

async function logModerationAction(interaction, details) {
  const config = configStore.get(interaction.guild.id);

  await sendModerationLog(interaction.guild, config, {
    moderator: formatUser(interaction.user),
    ...details
  });
}

async function notifyModerationTarget(interaction, user, details) {
  const config = configStore.get(interaction.guild.id);

  await sendModerationDm(user, interaction.guild, config, {
    moderator: formatUser(interaction.user),
    ...details
  });
}

function formatWarnings(user, warnings) {
  if (warnings.length === 0) {
    return `${user.tag} has no warnings in this server.`;
  }

  const recent = warnings.slice(-10);
  const lines = recent.map((warning, index) => {
    const number = warnings.length - recent.length + index + 1;
    const timestamp = Math.floor(warning.createdAt / 1000);
    const source = warning.source === "automod" ? "AutoMod" : "Manual";
    return `#${number} (${source}, ${warning.id}) <t:${timestamp}:f> by ${warning.moderatorTag}: ${truncate(warning.reason, 140)}`;
  });

  const hiddenCount = warnings.length - recent.length;
  const prefix = `${user.tag} has ${warnings.length} warning${warnings.length === 1 ? "" : "s"}:`;
  const suffix = hiddenCount > 0 ? `\n...and ${hiddenCount} older warning${hiddenCount === 1 ? "" : "s"}.` : "";

  return `${prefix}\n${lines.join("\n")}${suffix}`;
}

function formatUser(user) {
  return `${user.tag} (${user.id})`;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

async function replySafely(interaction, payload) {
  const response = {
    ...payload,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(response);
  } else {
    await interaction.reply(response);
  }
}
