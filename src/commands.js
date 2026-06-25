import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";
import { MAX_TIMEOUT_MINUTES, NUMERIC_LIMITS } from "./config.js";

const ADMIN_ONLY = PermissionFlagsBits.Administrator;

const antispamCommand = new SlashCommandBuilder()
  .setName("antispam")
  .setDescription("Configure the server anti-spam system.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Show the current anti-spam settings.")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("set")
      .setDescription("Update anti-spam settings.")
      .addBooleanOption((option) =>
        option.setName("enabled").setDescription("Turn spam detection on or off.")
      )
      .addBooleanOption((option) =>
        option.setName("auto_mute").setDescription("Automatically timeout detected spammers.")
      )
      .addIntegerOption((option) =>
        option
          .setName("message_limit")
          .setDescription("Messages allowed inside the spam window.")
          .setMinValue(NUMERIC_LIMITS.messageLimit.min)
          .setMaxValue(NUMERIC_LIMITS.messageLimit.max)
      )
      .addIntegerOption((option) =>
        option
          .setName("window_seconds")
          .setDescription("How many seconds the burst detector watches.")
          .setMinValue(NUMERIC_LIMITS.windowSeconds.min)
          .setMaxValue(NUMERIC_LIMITS.windowSeconds.max)
      )
      .addIntegerOption((option) =>
        option
          .setName("duplicate_limit")
          .setDescription("Repeated copies of the same message before action.")
          .setMinValue(NUMERIC_LIMITS.duplicateLimit.min)
          .setMaxValue(NUMERIC_LIMITS.duplicateLimit.max)
      )
      .addIntegerOption((option) =>
        option
          .setName("mention_limit")
          .setDescription("Mentions allowed in one message.")
          .setMinValue(NUMERIC_LIMITS.mentionLimit.min)
          .setMaxValue(NUMERIC_LIMITS.mentionLimit.max)
      )
      .addIntegerOption((option) =>
        option
          .setName("mute_minutes")
          .setDescription("Timeout duration after the warning threshold.")
          .setMinValue(NUMERIC_LIMITS.strikeMuteMinutes.min)
          .setMaxValue(NUMERIC_LIMITS.strikeMuteMinutes.max)
      )
      .addBooleanOption((option) =>
        option.setName("delete_spam").setDescription("Delete messages that trigger spam detection.")
      )
      .addBooleanOption((option) =>
        option.setName("block_invites").setDescription("Treat Discord invite links as spam.")
      )
      .addChannelOption((option) =>
        option
          .setName("log_channel")
          .setDescription("Channel for anti-spam action logs.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addBooleanOption((option) =>
        option.setName("clear_log_channel").setDescription("Remove the configured log channel.")
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ignore-channel")
      .setDescription("Add or remove a channel from anti-spam checks.")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Whether to add or remove the channel.")
          .setRequired(true)
          .addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to ignore or watch again.")
          .setRequired(true)
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ignore-role")
      .setDescription("Add or remove a role from anti-spam checks.")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Whether to add or remove the role.")
          .setRequired(true)
          .addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" }
          )
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role to ignore or watch again.")
          .setRequired(true)
      )
  );

const muteCommand = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout a member.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to timeout.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setDescription("Timeout duration in minutes.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_TIMEOUT_MINUTES)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the timeout.")
      .setMaxLength(300)
  );

const unmuteCommand = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a member timeout.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to remove timeout from.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for removing the timeout.")
      .setMaxLength(300)
  );

const timeoutCommand = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Timeout a member.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to timeout.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("minutes")
      .setDescription("Timeout duration in minutes.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(MAX_TIMEOUT_MINUTES)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the timeout.")
      .setMaxLength(300)
  );

const warnCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member and save it to their server history.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to warn.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the warning.")
      .setRequired(true)
      .setMaxLength(500)
  );

const warningsCommand = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("Show a member's warning history.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to inspect.")
      .setRequired(true)
  );

const clearWarningsCommand = new SlashCommandBuilder()
  .setName("clearwarnings")
  .setDescription("Clear a member's warning history.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member whose warnings should be cleared.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("How many recent warnings to clear. Leave empty to clear all.")
      .setMinValue(1)
      .setMaxValue(100)
  );

const kickCommand = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to kick.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the kick.")
      .setMaxLength(300)
  );

const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a user from the server.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("User to ban.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("delete_message_days")
      .setDescription("Delete this many days of their messages.")
      .setMinValue(0)
      .setMaxValue(7)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the ban.")
      .setMaxLength(300)
  );

const unbanCommand = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Unban a user by Discord user ID.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addStringOption((option) =>
    option
      .setName("user_id")
      .setDescription("Discord user ID to unban.")
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for removing the ban.")
      .setMaxLength(300)
  );

const softbanCommand = new SlashCommandBuilder()
  .setName("softban")
  .setDescription("Ban then immediately unban a user to clear recent messages.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("User to softban.")
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("delete_message_days")
      .setDescription("Delete this many days of their messages.")
      .setMinValue(0)
      .setMaxValue(7)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the softban.")
      .setMaxLength(300)
  );

const purgeCommand = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Bulk-delete recent messages in this channel.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of recent messages to delete.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Only delete messages from this user.")
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the purge.")
      .setMaxLength(300)
  );

const clearCommand = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Bulk-delete recent messages in this channel.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of recent messages to delete.")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Only delete messages from this user.")
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the clear.")
      .setMaxLength(300)
  );

const slowmodeCommand = new SlashCommandBuilder()
  .setName("slowmode")
  .setDescription("Set this channel's slowmode delay.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addIntegerOption((option) =>
    option
      .setName("seconds")
      .setDescription("Slowmode delay in seconds. Use 0 to disable.")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(21600)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the slowmode change.")
      .setMaxLength(300)
  );

const lockdownCommand = new SlashCommandBuilder()
  .setName("lockdown")
  .setDescription("Stop @everyone from sending messages in a channel.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel to lock. Defaults to the current channel.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the lockdown.")
      .setMaxLength(300)
  );

const unlockdownCommand = new SlashCommandBuilder()
  .setName("unlockdown")
  .setDescription("Allow @everyone to send messages in a locked channel again.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel to unlock. Defaults to the current channel.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for unlocking the channel.")
      .setMaxLength(300)
  );

const nickresetCommand = new SlashCommandBuilder()
  .setName("nickreset")
  .setDescription("Reset a member's server nickname.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member whose nickname should be reset.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for resetting the nickname.")
      .setMaxLength(300)
  );

const welcomeTestCommand = new SlashCommandBuilder()
  .setName("welcometest")
  .setDescription("Send a test welcome message and banner.")
  .setDefaultMemberPermissions(ADMIN_ONLY)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel to send the test welcome in. Defaults to configured welcome channel.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Member to use in the preview. Defaults to you.")
  );

export const commandBuilders = [
  antispamCommand,
  muteCommand,
  unmuteCommand,
  timeoutCommand,
  warnCommand,
  warningsCommand,
  clearWarningsCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  softbanCommand,
  purgeCommand,
  clearCommand,
  slowmodeCommand,
  lockdownCommand,
  unlockdownCommand,
  nickresetCommand,
  welcomeTestCommand
];
export const commands = commandBuilders.map((command) => command.toJSON());
