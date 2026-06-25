# Discord Spam Guard

A Discord bot that watches server messages for spam and can automatically timeout users. It also includes admin slash commands for configuring anti-spam behavior and manually muting/unmuting members.

## Features

- Sends wholesome welcome messages when new members join.
- Generates custom welcome banner images with the new member's profile picture.
- Tracks which invite was used and can show the inviter in welcome messages and banners.
- Includes a password-protected web dashboard for server settings.
- Lets admins customize the bot's per-server profile from the dashboard.
- Detects flood spam, repeated messages, invite links, scam links, bad words, mention spam, emoji spam, zalgo text, ghost pings, and excessive caps.
- Uses an AutoMod warning ladder: first warning, second warning, third active warning mutes for 6 hours by default.
- Automatically resets active AutoMod strikes after 24 hours by default.
- DMs affected users about moderation actions when possible.
- Optional deletion of recent spam messages.
- Per-server configuration saved in `data/guilds.json`.
- Administrator-only slash commands:
  - `/antispam status`
  - `/antispam set`
  - `/antispam ignore-channel`
  - `/antispam ignore-role`
  - `/mute`
  - `/unmute`
  - `/timeout`
  - `/warn`
  - `/warnings`
  - `/clearwarnings`
  - `/kick`
  - `/ban`
  - `/unban`
  - `/softban`
  - `/purge`
  - `/clear`
  - `/slowmode`
  - `/lockdown`
  - `/unlockdown`
  - `/nickreset`
  - `/welcometest`

This is not a full Carl-bot clone. Carl-bot is a large hosted platform with reaction roles, custom commands, suggestions, starboard, autoroles, feeds, reminders, and more. This project covers a strong moderation and welcome core: automod, moderation logs, warning history, timed mutes, bans, kicks, softbans, purge/clear, slowmode, channel lockdown, nickname reset, welcome banners, and a web dashboard.

## Setup

1. Create an app and bot in the Discord Developer Portal.
2. In the bot settings, enable these privileged intents:
   - `Message Content Intent` for spam detection.
   - `Server Members Intent` for welcome messages when members join.
3. Copy `.env.example` to `.env` and fill in:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id_here
DISCORD_GUILD_ID=your_test_server_id_here
DASHBOARD_PASSWORD=choose_a_strong_password
```

4. Invite the bot with the `bot` and `applications.commands` scopes. Recommended bot permissions:
   - Administrator

If you do not want to give the bot Administrator, grant these permissions instead:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Attach Files
   - Manage Messages
   - Moderate Members
   - Kick Members
   - Ban Members
   - Manage Channels
   - Manage Nicknames
   - Manage Server

The matching non-Administrator permissions integer is `1099645971510`. The Administrator permissions integer is `8`.

5. Install dependencies and deploy commands:

```bash
npm install
npm run deploy
npm start
```

Use `DISCORD_GUILD_ID` for fast command updates while testing. Remove it later and rerun `npm run deploy` to register commands globally.

When `DASHBOARD_PASSWORD` is set, `npm start` also starts the dashboard at `http://127.0.0.1:3000`. Change `DASHBOARD_PORT` or `DASHBOARD_HOST` in `.env` if needed.

## Default Chat Protection Settings

- Enabled: yes
- Delete spam messages: yes
- Mute on strike threshold: yes
- Active warning reset: 24 hours
- Strike mute threshold: 3 warnings
- Strike mute duration: 6 hours
- Anti flood: 6 messages in 10 seconds
- Repeated message spam: 3 duplicates in the same window
- Invite links: off by default
- Scam links: on with configurable scam domains
- Bad words: off until you add words
- Mention spam: 5 mentions in one message
- Emoji spam: 12 emoji in one message
- Zalgo text: 8 combining marks
- Ghost ping detection: on
- Caps protection: 70% caps after at least 12 letters
- DM moderation notices: yes

Members with `Administrator`, `Manage Messages`, or `Moderate Members` are ignored by default so moderators do not get timed out while doing moderation work.

## Default Welcome Settings

- Enabled: no
- Invite tracking: yes
- Show inviter: yes
- Banner image: yes
- Message: `Welcome {mention} to {server}!`
- Banner title: `Welcome, {username}`
- Banner subtitle: `You are member #{memberCount} in {server}.`
- Banner invite line: `Invited by {inviterName} - {inviterInvites} invites`

Welcome placeholders:

- `{mention}`
- `{username}`
- `{displayName}`
- `{server}`
- `{memberCount}`
- `{inviterName}`
- `{inviterMention}`
- `{inviterInvites}`
- `{inviteCode}`

## Dashboard

The dashboard lets admins configure:

- Welcome channel, message, banner text, banner colors, and banner background URL.
- Invite tracking controls and welcome-banner inviter text.
- Bot server profile: server name/nickname, server bio, server avatar, and server banner.
- Flood limits, spam window, duplicate limit, mention limit, caps threshold, emoji threshold, zalgo threshold, ghost-ping window, AutoMod strike reset, strike mute duration, and strike threshold.
- Invite blocking, scam-domain blocking, bad-word blocking, and custom word/domain lists.
- Log channel, ignored channels, ignored roles, and user DM notices for moderation actions.
- Per-command on/off toggles for all admin slash commands.

Moderation DMs are best-effort. If a user has DMs closed or blocks the bot, the moderation action still completes.

The Bot Profile tab uses Discord's per-server bot profile fields. It does not change the bot's global username/profile for every server.

Invite tracking compares invite use counts when members join. It requires the bot to have `Manage Server`; if invites cannot be fetched, the welcome still sends with unknown inviter placeholders.

Set `DASHBOARD_PASSWORD` before exposing the dashboard beyond your own machine. By default it binds to `127.0.0.1`.

## Command Access

Every slash command is registered with Discord's `Administrator` default member permission. The bot also checks `Administrator` at runtime, so commands remain locked to server admins even if command permissions are changed later.

After changing commands, rerun:

```bash
npm run deploy
```

Use `/welcometest` after enabling welcome messages to send a preview immediately. If welcome is disabled or no channel is set, the command tells you what is missing.
