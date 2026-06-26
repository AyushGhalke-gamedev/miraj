import "dotenv/config";
import { randomInt } from "node:crypto";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { isCommandEnabled, updateIdList } from "./config.js";
import { startDashboard } from "./dashboard.js";
import {
  buildBirthdayPayload,
  buildGuessNumberPayload,
  renderGuessTemplate
} from "./funBanners.js";
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
let birthdaySchedulerStarted = false;
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

  if (!birthdaySchedulerStarted) {
    startBirthdayScheduler(readyClient);
    birthdaySchedulerStarted = true;
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
    if (!await ensureCommandEnabled(interaction)) {
      return;
    }

    if (requiresAdministrator(interaction) && !await ensureAdministrator(interaction)) {
      return;
    }

    if (interaction.commandName === "antispam") {
      await handleAntispamCommand(interaction);
    } else if (interaction.commandName === "achievement") {
      await handleAchievementCommand(interaction);
    } else if (interaction.commandName === "birthday") {
      await handleBirthdayCommand(interaction);
    } else if (interaction.commandName === "guessnumber") {
      await handleGuessNumberCommand(interaction);
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

  if (await handleGuessNumberMessage(message, config)) {
    return;
  }

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

async function handleGuessNumberCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "start") {
    await handleGuessNumberStart(interaction);
    return;
  }

  if (subcommand === "guess") {
    await handleGuessNumberGuess(interaction);
    return;
  }

  if (subcommand === "join") {
    await handleGuessNumberJoin(interaction);
    return;
  }

  if (subcommand === "leave") {
    await handleGuessNumberLeave(interaction);
    return;
  }

  if (subcommand === "status") {
    await handleGuessNumberStatus(interaction);
    return;
  }

  if (subcommand === "stop") {
    await handleGuessNumberStop(interaction);
  }
}

async function handleGuessNumberStart(interaction) {
  const config = configStore.get(interaction.guild.id);

  if (!config.guessNumberEnabled) {
    await replySafely(interaction, { content: "Guess-the-number is disabled in the dashboard." });
    return;
  }

  const existing = configStore.getGuessGame(interaction.guild.id);

  if (existing) {
    await replySafely(interaction, {
      content: `A game is already running in <#${existing.channelId}>. Stop it first with \`/guessnumber stop\`.`
    });
    return;
  }

  const channel = interaction.options.getChannel("channel")
    ?? await fetchChannel(interaction.guild, config.guessNumberChannelId)
    ?? interaction.channel;
  const min = interaction.options.getInteger("min") ?? config.guessNumberMin;
  const max = interaction.options.getInteger("max") ?? config.guessNumberMax;
  const maxAttempts = interaction.options.getInteger("attempts") ?? config.guessNumberMaxAttempts;

  if (!channel?.isTextBased?.()) {
    await replySafely(interaction, { content: "Choose a text channel for the game." });
    return;
  }

  if (max <= min) {
    await replySafely(interaction, { content: "The max number must be higher than the min number." });
    return;
  }

  const game = await configStore.startGuessGame(interaction.guild.id, {
    min,
    max,
    maxAttempts,
    channelId: channel.id,
    secretNumber: randomInt(min, max + 1),
    startedById: interaction.user.id,
    startedAt: Date.now(),
    guesses: []
  });
  const payload = await buildGuessNumberPayload(interaction.guild, config, {
    min: game.min,
    max: game.max,
    maxAttempts: game.maxAttempts,
    channelId: channel.id,
    footer: `${game.maxAttempts} total guesses. Type join or reply with a number.`,
    content: `Guess-the-number has started in <#${channel.id}>. Range: ${game.min}-${game.max}. Type \`join\`, then type a number when it is your turn.`
  });

  await channel.send(payload);
  await replySafely(interaction, {
    content: `Started a guess-the-number game in <#${channel.id}>.`
  });
}

async function handleGuessNumberGuess(interaction) {
  const config = configStore.get(interaction.guild.id);
  const number = interaction.options.getInteger("number", true);

  await handleGuessNumberGuessInput({
    guild: interaction.guild,
    channelId: interaction.channelId,
    user: interaction.user,
    number,
    config,
    respond: (payload) => replyPublic(interaction, payload)
  });
}

async function handleGuessNumberJoin(interaction) {
  const config = configStore.get(interaction.guild.id);

  await handleGuessNumberJoinInput({
    guild: interaction.guild,
    channelId: interaction.channelId,
    user: interaction.user,
    config,
    respond: (payload) => replyPublic(interaction, payload)
  });
}

async function handleGuessNumberLeave(interaction) {
  const config = configStore.get(interaction.guild.id);

  await handleGuessNumberLeaveInput({
    guild: interaction.guild,
    channelId: interaction.channelId,
    user: interaction.user,
    config,
    respond: (payload) => replyPublic(interaction, payload)
  });
}

async function handleGuessNumberMessage(message, config) {
  if (!config.guessNumberEnabled || message.author?.bot || message.system || message.webhookId) {
    return false;
  }

  const game = configStore.getGuessGame(message.guild.id);

  if (!game || message.channelId !== game.channelId) {
    return false;
  }

  const input = parseGuessNumberMessage(message.content);

  if (!input) {
    return false;
  }

  const respond = (payload) => message.reply({
    ...payload,
    allowedMentions: payload.allowedMentions ?? { parse: [] }
  });

  if (input.type === "join") {
    await handleGuessNumberJoinInput({
      guild: message.guild,
      channelId: message.channelId,
      user: message.author,
      config,
      respond
    });
    return true;
  }

  if (input.type === "leave") {
    await handleGuessNumberLeaveInput({
      guild: message.guild,
      channelId: message.channelId,
      user: message.author,
      config,
      respond
    });
    return true;
  }

  await handleGuessNumberGuessInput({
    guild: message.guild,
    channelId: message.channelId,
    user: message.author,
    number: input.number,
    config,
    respond
  });
  return true;
}

async function handleGuessNumberJoinInput({ guild, channelId, user, config, respond }) {
  const game = await getPlayableGuessGame({ guild, channelId, config, respond });

  if (!game) {
    return;
  }

  const alreadyJoined = hasGuessPlayer(game, user.id);
  const updatedGame = await configStore.addGuessPlayer(guild.id, {
    userId: user.id,
    userTag: user.tag,
    joinedAt: Date.now()
  });
  const currentPlayer = getCurrentGuessPlayer(updatedGame);
  const suffix = currentPlayer?.userId === user.id
    ? "It is your turn. Type a number."
    : `Current turn: <@${currentPlayer.userId}>.`;

  await respond({
    content: alreadyJoined
      ? `${user} is already in the queue. ${suffix}`
      : `${user} joined the guess queue. ${suffix}`,
    allowedMentions: { parse: [] }
  });
}

async function handleGuessNumberLeaveInput({ guild, channelId, user, config, respond }) {
  const game = await getPlayableGuessGame({ guild, channelId, config, respond });

  if (!game) {
    return;
  }

  if (!hasGuessPlayer(game, user.id)) {
    await respond({
      content: `${user} is not in the current guess queue.`,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const updatedGame = await configStore.removeGuessPlayer(guild.id, user.id);
  const currentPlayer = getCurrentGuessPlayer(updatedGame);

  await respond({
    content: currentPlayer
      ? `${user} left the queue. Current turn: <@${currentPlayer.userId}>.`
      : `${user} left the queue. No players are queued now.`,
    allowedMentions: { parse: [] }
  });
}

async function handleGuessNumberGuessInput({ guild, channelId, user, number, config, respond }) {
  let game = await getPlayableGuessGame({ guild, channelId, config, respond });

  if (!game) {
    return;
  }

  if (number < game.min || number > game.max) {
    await respond({
      content: `Your guess must be between ${game.min} and ${game.max}.`
    });
    return;
  }

  if (game.players.length === 0) {
    game = await configStore.addGuessPlayer(guild.id, {
      userId: user.id,
      userTag: user.tag,
      joinedAt: Date.now()
    });
  } else if (!hasGuessPlayer(game, user.id)) {
    const updatedGame = await configStore.addGuessPlayer(guild.id, {
      userId: user.id,
      userTag: user.tag,
      joinedAt: Date.now()
    });
    const currentPlayer = getCurrentGuessPlayer(updatedGame);

    await respond({
      content: `${user} joined the queue. Wait for your turn${currentPlayer ? ` after <@${currentPlayer.userId}>` : ""}.`,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const currentPlayer = getCurrentGuessPlayer(game);

  if (currentPlayer && currentPlayer.userId !== user.id) {
    await respond({
      content: `Wait your turn, ${user}. Current turn: <@${currentPlayer.userId}>.`,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const updatedGame = await configStore.addGuess(guild.id, {
    userId: user.id,
    userTag: user.tag,
    number,
    createdAt: Date.now()
  });
  const attempts = updatedGame.guesses.length;

  if (number === game.secretNumber) {
    await configStore.stopGuessGame(guild.id);
    await maybeGrantAchievement(guild, user, "first-win", client.user);
    const content = renderGuessTemplate(config.guessNumberWinMessage, guild, {
      userId: user.id,
      username: user.username,
      number,
      attempts,
      min: game.min,
      max: game.max,
      channelId
    });
    const payload = await buildGuessNumberPayload(guild, config, {
      userId: user.id,
      username: user.username,
      number,
      attempts,
      min: game.min,
      max: game.max,
      channelId,
      footer: "Winner found. New game?",
      content
    });

    await respond(payload);
    return;
  }

  if (attempts >= game.maxAttempts) {
    await configStore.stopGuessGame(guild.id);
    const payload = await buildGuessNumberPayload(guild, config, {
      number: game.secretNumber,
      attempts,
      min: game.min,
      max: game.max,
      channelId,
      footer: "The game ended with no winner.",
      content: `No more guesses left. The number was **${game.secretNumber}**.`
    });

    await respond(payload);
    return;
  }

  const advancedGame = await configStore.advanceGuessTurn(guild.id);
  const nextPlayer = getCurrentGuessPlayer(advancedGame);
  const hint = number < game.secretNumber ? "higher" : "lower";
  const left = game.maxAttempts - attempts;
  const nextTurn = nextPlayer ? ` Next turn: <@${nextPlayer.userId}>.` : "";

  await respond({
    content: `${user} guessed **${number}**. Try **${hint}**. ${left} guess${left === 1 ? "" : "es"} left.${nextTurn}`,
    allowedMentions: { parse: [] }
  });
}

async function getPlayableGuessGame({ guild, channelId, config, respond }) {
  if (!config.guessNumberEnabled) {
    await respond({ content: "Guess-the-number is disabled in the dashboard." });
    return null;
  }

  const game = configStore.getGuessGame(guild.id);

  if (!game) {
    await respond({ content: "No guess-the-number game is running right now." });
    return null;
  }

  if (channelId !== game.channelId) {
    await respond({ content: `The active game is in <#${game.channelId}>.` });
    return null;
  }

  return game;
}

function parseGuessNumberMessage(content) {
  const trimmed = String(content ?? "").trim().toLowerCase();

  if (["join", "join game", "join guess", "join guessing"].includes(trimmed)) {
    return { type: "join" };
  }

  if (["leave", "leave game", "quit", "quit game"].includes(trimmed)) {
    return { type: "leave" };
  }

  if (/^-?\d+$/.test(trimmed)) {
    return { type: "guess", number: Number.parseInt(trimmed, 10) };
  }

  return null;
}

function hasGuessPlayer(game, userId) {
  return game.players.some((player) => player.userId === userId);
}

function getCurrentGuessPlayer(game) {
  if (!game?.players?.length) {
    return null;
  }

  return game.players[game.currentTurnIndex] ?? game.players[0];
}

async function handleGuessNumberStatus(interaction) {
  const game = configStore.getGuessGame(interaction.guild.id);

  if (!game) {
    await replySafely(interaction, { content: "No guess-the-number game is running right now." });
    return;
  }

  const guessesLeft = Math.max(0, game.maxAttempts - game.guesses.length);
  const currentPlayer = getCurrentGuessPlayer(game);
  const playerList = game.players.length
    ? game.players.map((player, index) => `${index + 1}. <@${player.userId}>`).join("\n")
    : "No players yet. Type `join` or send a number in the game channel.";

  await replySafely(interaction, {
    content: `Active game in <#${game.channelId}>: ${game.min}-${game.max}, ${game.guesses.length}/${game.maxAttempts} guesses used, ${guessesLeft} left.\nCurrent turn: ${currentPlayer ? `<@${currentPlayer.userId}>` : "waiting for players"}\nPlayers:\n${playerList}`
  });
}

async function handleGuessNumberStop(interaction) {
  const game = await configStore.stopGuessGame(interaction.guild.id);

  if (!game) {
    await replySafely(interaction, { content: "No guess-the-number game is running right now." });
    return;
  }

  await replySafely(interaction, {
    content: `Stopped the game in <#${game.channelId}>. The number was ${game.secretNumber}.`
  });
}

async function handleBirthdayCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "set") {
    const month = interaction.options.getInteger("month", true);
    const day = interaction.options.getInteger("day", true);

    if (!isValidMonthDay(month, day)) {
      await replySafely(interaction, { content: "That date is not valid." });
      return;
    }

    await configStore.setBirthday(interaction.guild.id, interaction.user.id, {
      month,
      day,
      updatedAt: Date.now()
    });
    await replySafely(interaction, {
      content: `Saved your birthday as ${formatBirthday(month, day)}.`
    });
    return;
  }

  if (subcommand === "clear") {
    const removed = await configStore.clearBirthday(interaction.guild.id, interaction.user.id);
    await replySafely(interaction, {
      content: removed ? "Removed your saved birthday." : "You did not have a saved birthday."
    });
    return;
  }

  if (subcommand === "view") {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const birthday = configStore.getBirthday(interaction.guild.id, user.id);
    await replySafely(interaction, {
      content: birthday
        ? `${user.tag}'s birthday is ${formatBirthday(birthday.month, birthday.day)}.`
        : `${user.tag} does not have a saved birthday.`
    });
    return;
  }

  if (subcommand === "test") {
    await handleBirthdayTest(interaction);
  }
}

async function handleBirthdayTest(interaction) {
  const config = configStore.get(interaction.guild.id);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const channel = interaction.options.getChannel("channel")
    ?? await fetchChannel(interaction.guild, config.birthdayChannelId)
    ?? interaction.channel;

  if (!member) {
    await replySafely(interaction, { content: "That user is not a member of this server." });
    return;
  }

  if (!channel?.isTextBased?.()) {
    await replySafely(interaction, { content: "Choose a valid birthday channel first." });
    return;
  }

  await channel.send(await buildBirthdayPayload(member, config));
  await replySafely(interaction, {
    content: `Sent a birthday preview for ${user.tag} in <#${channel.id}>.`
  });
}

async function handleAchievementCommand(interaction) {
  const config = configStore.get(interaction.guild.id);

  if (!config.achievementsEnabled) {
    await replySafely(interaction, { content: "Achievements are disabled in the dashboard." });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "catalog") {
    const enabled = config.achievements.filter((achievement) => achievement.enabled);
    await replySafely(interaction, {
      content: enabled.length
        ? `Available achievements:\n${enabled.map(formatCatalogAchievement).join("\n")}`
        : "No achievements are enabled right now."
    });
    return;
  }

  if (subcommand === "list") {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const achievements = configStore.getUserAchievements(interaction.guild.id, user.id);
    await replySafely(interaction, {
      content: achievements.length
        ? `${user.tag}'s achievements:\n${achievements.map(formatEarnedAchievement).join("\n")}`
        : `${user.tag} has no achievements yet.`
    });
    return;
  }

  if (subcommand === "grant") {
    const user = interaction.options.getUser("user", true);
    const key = interaction.options.getString("key", true);
    const achievement = findAchievement(config, key);

    if (!achievement) {
      await replySafely(interaction, { content: `No enabled achievement exists for key \`${key}\`.` });
      return;
    }

    const result = await configStore.grantAchievement(interaction.guild.id, user.id, achievement, interaction.user);

    if (result.created) {
      await announceAchievement(interaction.guild, config, user, result.achievement);
    }

    await replySafely(interaction, {
      content: result.created
        ? `Granted ${achievement.title} to ${user.tag}.`
        : `${user.tag} already has ${achievement.title}.`
    });
    return;
  }

  if (subcommand === "revoke") {
    const user = interaction.options.getUser("user", true);
    const key = normalizeAchievementKey(interaction.options.getString("key", true));
    const removed = await configStore.revokeAchievement(interaction.guild.id, user.id, key);

    await replySafely(interaction, {
      content: removed
        ? `Removed achievement \`${key}\` from ${user.tag}.`
        : `${user.tag} did not have achievement \`${key}\`.`
    });
  }
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

function requiresAdministrator(interaction) {
  const adminCommands = new Set([
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
    "warnings",
    "welcometest"
  ]);

  if (adminCommands.has(interaction.commandName)) {
    return true;
  }

  if (interaction.commandName === "guessnumber") {
    return ["start", "stop"].includes(interaction.options.getSubcommand());
  }

  if (interaction.commandName === "achievement") {
    return ["grant", "revoke"].includes(interaction.options.getSubcommand());
  }

  if (interaction.commandName === "birthday") {
    return interaction.options.getSubcommand() === "test";
  }

  return false;
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

async function startBirthdayScheduler(readyClient) {
  await checkBirthdays(readyClient).catch((error) => {
    console.warn(`Birthday check failed: ${error.message}`);
  });

  setInterval(() => {
    checkBirthdays(readyClient).catch((error) => {
      console.warn(`Birthday check failed: ${error.message}`);
    });
  }, 30 * 60 * 1000);
}

async function checkBirthdays(readyClient) {
  for (const guild of readyClient.guilds.cache.values()) {
    const config = configStore.get(guild.id);

    if (!config.birthdayEnabled || !config.birthdayChannelId) {
      continue;
    }

    const state = getBirthdayDateState(config);

    if (state.hour < config.birthdayCheckHour) {
      continue;
    }

    const birthdays = configStore.getBirthdaysForDate(guild.id, state.month, state.day);

    if (birthdays.length === 0) {
      continue;
    }

    const channel = await guild.channels.fetch(config.birthdayChannelId).catch(() => null);

    if (!channel?.isTextBased?.()) {
      continue;
    }

    for (const birthday of birthdays) {
      if (configStore.hasBirthdayDelivery(guild.id, birthday.userId, state.dateKey)) {
        continue;
      }

      const member = await guild.members.fetch(birthday.userId).catch(() => null);

      if (!member) {
        continue;
      }

      try {
        await channel.send(await buildBirthdayPayload(member, config));
        await configStore.markBirthdayDelivered(guild.id, birthday.userId, state.dateKey);
      } catch (error) {
        console.warn(`Could not send birthday message for ${birthday.userId}: ${error.message}`);
      }
    }
  }
}

async function maybeGrantAchievement(guild, user, key, grantedBy) {
  const config = configStore.get(guild.id);

  if (!config.achievementsEnabled) {
    return null;
  }

  const achievement = findAchievement(config, key);

  if (!achievement) {
    return null;
  }

  const result = await configStore.grantAchievement(guild.id, user.id, achievement, grantedBy);

  if (result.created) {
    await announceAchievement(guild, config, user, result.achievement);
  }

  return result;
}

async function announceAchievement(guild, config, user, achievement) {
  if (!config.achievementAnnounceEnabled) {
    return;
  }

  const channelId = config.achievementAnnounceChannelId || config.logChannelId;

  if (!channelId) {
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return;
  }

  await channel.send({
    content: `${user} earned **${achievement.title}** - ${achievement.description}`,
    allowedMentions: { parse: [] }
  });
}

function findAchievement(config, key) {
  const normalizedKey = normalizeAchievementKey(key);
  return config.achievements.find(
    (achievement) => achievement.enabled && achievement.key === normalizedKey
  ) ?? null;
}

function normalizeAchievementKey(key) {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCatalogAchievement(achievement) {
  return `\`${achievement.key}\` [${achievement.badge}] **${achievement.title}** - ${achievement.description}`;
}

function formatEarnedAchievement(achievement) {
  const timestamp = Math.floor(achievement.earnedAt / 1000);
  return `[${achievement.badge}] **${achievement.title}** - <t:${timestamp}:d>`;
}

function getBirthdayDateState(config) {
  const shifted = new Date(Date.now() + config.birthdayTimezoneOffsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, dateKey };
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

function formatBirthday(month, day) {
  const date = new Date(Date.UTC(2024, month - 1, day));
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

async function getBotMember(guild) {
  return guild.members.me ?? await guild.members.fetchMe();
}

async function fetchChannel(guild, channelId) {
  if (!channelId) {
    return null;
  }

  return guild.channels.fetch(channelId).catch(() => null);
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

async function replyPublic(interaction, payload) {
  const response = {
    ...payload,
    allowedMentions: payload.allowedMentions ?? { parse: [] }
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(response);
  } else {
    await interaction.reply(response);
  }
}
