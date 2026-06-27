import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import multer from "multer";
import { ChannelType } from "discord.js";
import { BANNER_THEMES, COMMAND_TOGGLE_KEYS, NUMERIC_LIMITS } from "./config.js";
import {
  createBirthdayBanner,
  createGuessNumberBanner
} from "./funBanners.js";
import { createWelcomeBanner } from "./welcome.js";

let server = null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 2
  }
});

export function startDashboard(client, store) {
  if (server) {
    return server;
  }

  const password = process.env.DASHBOARD_PASSWORD;
  const app = express();
  const port = readPort(process.env.PORT ?? process.env.DASHBOARD_PORT, 3000);
  const host = process.env.DASHBOARD_HOST
    || (process.env.RENDER || process.env.PORT ? "0.0.0.0" : "127.0.0.1");

  app.disable("x-powered-by");
  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  if (!password) {
    app.get("/", (_request, response) => {
      response.type("text/plain").send("Discord bot is alive.");
    });

    console.warn("Dashboard disabled. Only the public health endpoint is available.");
    server = app.listen(port, host, () => {
      console.log(`Health server running at http://${host}:${port}`);
    });
    return server;
  }

  const secret = process.env.DASHBOARD_SECRET || crypto
    .createHash("sha256")
    .update(`${password}:${process.env.DISCORD_TOKEN ?? ""}`)
    .digest("hex");

  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use("/assets", express.static(path.join(process.cwd(), "public"), {
    etag: true,
    maxAge: "1h"
  }));
  app.use((_request, response, next) => {
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'self'"
    );
    next();
  });

  app.get("/login", (request, response) => {
    if (isAuthenticated(request, secret)) {
      response.redirect("/");
      return;
    }

    response.send(renderLogin(Boolean(request.query.error)));
  });

  app.post("/login", (request, response) => {
    if (String(request.body.password ?? "") !== password) {
      response.redirect("/login?error=1");
      return;
    }

    response.setHeader("Set-Cookie", createAuthCookie(secret));
    response.redirect("/");
  });

  app.post("/logout", (_request, response) => {
    response.setHeader("Set-Cookie", "dashboard=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    response.redirect("/login");
  });

  app.use((request, response, next) => {
    if (!isAuthenticated(request, secret)) {
      response.redirect("/login");
      return;
    }

    next();
  });

  app.get("/", async (_request, response) => {
    const guilds = getGuilds(client);
    const firstGuild = guilds[0];

    if (firstGuild) {
      response.redirect(`/guild/${firstGuild.id}`);
      return;
    }

    response.send(renderLayout({
      title: "Dashboard",
      guilds,
      activeGuildId: null,
      content: renderEmptyState()
    }));
  });

  app.get("/guild/:guildId", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).send("Guild not found.");
      return;
    }

    const [channels, roles] = await Promise.all([
      getTextChannels(guild),
      getRoles(guild)
    ]);
    const config = store.get(guild.id);
    const botMember = guild.members.me ?? await guild.members.fetchMe();

    response.send(renderLayout({
      title: `${guild.name} Dashboard`,
      guilds: getGuilds(client),
      activeGuildId: guild.id,
      content: renderGuildSettings({
        guild,
        config,
        botMember,
        channels,
        roles,
        saved: request.query.saved === "1"
      })
    }));
  });

  app.post(
    "/guild/:guildId/settings",
    upload.fields([
      { name: "bot_avatar_file", maxCount: 1 },
      { name: "bot_banner_file", maxCount: 1 }
    ]),
    async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).send("Guild not found.");
      return;
    }

    try {
      const currentConfig = store.get(guild.id);
      const profilePatch = await applyBotProfileUpdate(
        guild,
        currentConfig,
        request.body,
        request.files
      );
      const patch = { ...readSettingsPatch(request.body), ...profilePatch };
      await store.update(guild.id, patch);
      response.redirect(`/guild/${guild.id}?saved=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(400).send(`Could not update settings: ${escapeHtml(message)}`);
    }
  }
  );

  app.get("/guild/:guildId/welcome-preview.png", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).end();
      return;
    }

    const member = guild.members.me ?? await guild.members.fetchMe();
    const config = store.get(guild.id);
    const banner = await createWelcomeBanner(member, config, previewInviteInfo());

    response.type("png").send(banner);
  });

  app.get("/guild/:guildId/guess-preview.png", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).end();
      return;
    }

    const config = store.get(guild.id);
    const banner = await createGuessNumberBanner(guild, config, {
      min: config.guessNumberMin,
      max: config.guessNumberMax,
      maxAttempts: config.guessNumberMaxAttempts,
      attempts: 4,
      channelId: config.guessNumberChannelId,
      footer: "Preview game banner"
    });

    response.type("png").send(banner);
  });

  app.get("/guild/:guildId/birthday-preview.png", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).end();
      return;
    }

    const member = guild.members.me ?? await guild.members.fetchMe();
    const config = store.get(guild.id);
    const banner = await createBirthdayBanner(member, config);

    response.type("png").send(banner);
  });

  server = app.listen(port, host, () => {
    console.log(`Dashboard running at http://${host}:${port}`);
  });

  return server;
}

function renderLogin(hasError) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Dashboard Login</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body class="login-page">
  <main class="login-shell">
    <form class="login-panel" method="post" action="/login">
      <h1>Bot Dashboard</h1>
      <label>
        <span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required autofocus>
      </label>
      ${hasError ? "<p class=\"form-error\">Incorrect password.</p>" : ""}
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

function renderLayout({ title, guilds, activeGuildId, content }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
  <script src="/assets/dashboard.js" defer></script>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">SG</span>
        <span>Spam Guard</span>
      </div>
      <nav class="guild-list" aria-label="Servers">
        ${guilds.map((guild) => renderGuildLink(guild, activeGuildId)).join("")}
      </nav>
      <form method="post" action="/logout">
        <button class="ghost-button" type="submit">Sign out</button>
      </form>
    </aside>
    <main class="main-content">
      ${content}
    </main>
  </div>
</body>
</html>`;
}

function renderGuildLink(guild, activeGuildId) {
  const active = guild.id === activeGuildId ? " active" : "";
  const initials = guild.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return `<a class="guild-link${active}" href="/guild/${guild.id}">
    <span class="guild-initials">${escapeHtml(initials || "S")}</span>
    <span>
      <strong>${escapeHtml(guild.name)}</strong>
      <small>${guild.memberCount ?? 0} members</small>
    </span>
  </a>`;
}

function renderEmptyState() {
  return `<section class="page-header">
    <h1>No servers found</h1>
    <p>The bot is not connected to any Discord servers.</p>
  </section>`;
}

function renderGuildSettings({ guild, config, botMember, channels, roles, saved }) {
  const botAvatarUrl = botMember.displayAvatarURL({ extension: "png", size: 128 });
  const botBannerUrl = botMember.displayBannerURL?.({ extension: "png", size: 512 }) ?? null;

  return `<section class="page-header">
    <div>
      <p class="eyebrow">Server dashboard</p>
      <h1>${escapeHtml(guild.name)}</h1>
    </div>
    ${saved ? "<p class=\"save-pill\">Saved</p>" : ""}
  </section>

  <form class="settings-form" method="post" action="/guild/${guild.id}/settings" enctype="multipart/form-data">
    <div class="tab-bar" role="tablist" aria-label="Settings sections">
      <button class="tab-button active" type="button" data-tab="welcome">Welcome</button>
      <button class="tab-button" type="button" data-tab="games">Games</button>
      <button class="tab-button" type="button" data-tab="birthdays">Birthdays</button>
      <button class="tab-button" type="button" data-tab="achievements">Achievements</button>
      <button class="tab-button" type="button" data-tab="profile">Bot Profile</button>
      <button class="tab-button" type="button" data-tab="automod">Automod</button>
      <button class="tab-button" type="button" data-tab="moderation">Moderation</button>
      <button class="tab-button" type="button" data-tab="commands">Commands</button>
    </div>

    <section class="panel active" data-tab-panel="welcome">
      <div class="panel-heading">
        <h2>Welcome</h2>
        ${renderToggle("welcome_enabled", config.welcomeEnabled)}
      </div>
      <div class="two-column">
        <div class="field-stack">
          ${renderChannelSelect("welcome_channel_id", "Welcome channel", channels, config.welcomeChannelId)}
          ${renderToggle("welcome_invite_tracking_enabled", config.welcomeInviteTrackingEnabled, "Track invite source")}
          ${renderToggle("welcome_show_inviter", config.welcomeShowInviter, "Show inviter in welcome")}
          <label>
            <span>Welcome message</span>
            <textarea name="welcome_message" rows="5" maxlength="1000">${escapeHtml(config.welcomeMessage)}</textarea>
          </label>
          <label>
            <span>Banner title</span>
            <input name="welcome_banner_title" maxlength="120" value="${escapeHtml(config.welcomeBannerTitle)}">
          </label>
          <label>
            <span>Banner subtitle</span>
            <input name="welcome_banner_subtitle" maxlength="180" value="${escapeHtml(config.welcomeBannerSubtitle)}">
          </label>
          <label>
            <span>Banner invite line</span>
            <input name="welcome_banner_invite_line" maxlength="180" value="${escapeHtml(config.welcomeBannerInviteLine)}">
          </label>
          ${renderThemeSelect("welcome_banner_theme", "Banner theme", config.welcomeBannerTheme)}
        </div>
        <div class="field-stack">
          <div class="banner-preview">
            <img src="/guild/${guild.id}/welcome-preview.png?${Date.now()}" alt="Welcome banner preview">
          </div>
          ${renderToggle("welcome_banner_enabled", config.welcomeBannerEnabled, "Banner image")}
          <label>
            <span>Background image URL</span>
            <input name="welcome_banner_background_url" type="url" value="${escapeHtml(config.welcomeBannerBackgroundUrl ?? "")}">
          </label>
          <div class="color-grid">
            ${renderColor("welcome_banner_background_color", "Background", config.welcomeBannerBackgroundColor)}
            ${renderColor("welcome_banner_accent_color", "Accent", config.welcomeBannerAccentColor)}
            ${renderColor("welcome_banner_text_color", "Text", config.welcomeBannerTextColor)}
          </div>
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="games">
      <div class="panel-heading">
        <div>
          <h2>Guess Number</h2>
        </div>
        ${renderToggle("guess_number_enabled", config.guessNumberEnabled)}
      </div>
      <div class="two-column">
        <div class="field-stack">
          ${renderChannelSelect("guess_number_channel_id", "Default game channel", channels, config.guessNumberChannelId)}
          <div class="controls-grid compact">
            ${renderNumber("guess_number_min", "Min", config.guessNumberMin, NUMERIC_LIMITS.guessNumberMin)}
            ${renderNumber("guess_number_max", "Max", config.guessNumberMax, NUMERIC_LIMITS.guessNumberMax)}
            ${renderNumber("guess_number_max_attempts", "Attempts", config.guessNumberMaxAttempts, NUMERIC_LIMITS.guessNumberMaxAttempts)}
          </div>
          <label>
            <span>Banner title</span>
            <input name="guess_number_banner_title" maxlength="120" value="${escapeHtml(config.guessNumberBannerTitle)}">
          </label>
          <label>
            <span>Banner subtitle</span>
            <input name="guess_number_banner_subtitle" maxlength="180" value="${escapeHtml(config.guessNumberBannerSubtitle)}">
          </label>
          <label>
            <span>Winner message</span>
            <input name="guess_number_win_message" maxlength="300" value="${escapeHtml(config.guessNumberWinMessage)}">
          </label>
          ${renderThemeSelect("guess_number_banner_theme", "Banner theme", config.guessNumberBannerTheme)}
        </div>
        <div class="field-stack">
          <div class="banner-preview">
            <img src="/guild/${guild.id}/guess-preview.png?${Date.now()}" alt="Guess number banner preview">
          </div>
          ${renderToggle("guess_number_banner_enabled", config.guessNumberBannerEnabled, "Banner image")}
          <label>
            <span>Background image URL</span>
            <input name="guess_number_banner_background_url" type="url" value="${escapeHtml(config.guessNumberBannerBackgroundUrl ?? "")}">
          </label>
          <div class="color-grid">
            ${renderColor("guess_number_banner_background_color", "Background", config.guessNumberBannerBackgroundColor)}
            ${renderColor("guess_number_banner_accent_color", "Accent", config.guessNumberBannerAccentColor)}
            ${renderColor("guess_number_banner_text_color", "Text", config.guessNumberBannerTextColor)}
          </div>
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="birthdays">
      <div class="panel-heading">
        <div>
          <h2>Birthdays</h2>
        </div>
        ${renderToggle("birthday_enabled", config.birthdayEnabled)}
      </div>
      <div class="two-column">
        <div class="field-stack">
          ${renderChannelSelect("birthday_channel_id", "Birthday channel", channels, config.birthdayChannelId)}
          <div class="controls-grid compact">
            ${renderNumber("birthday_check_hour", "Send hour", config.birthdayCheckHour, NUMERIC_LIMITS.birthdayCheckHour)}
            ${renderNumber("birthday_timezone_offset_minutes", "Timezone offset minutes", config.birthdayTimezoneOffsetMinutes, NUMERIC_LIMITS.birthdayTimezoneOffsetMinutes)}
          </div>
          <label>
            <span>Birthday message</span>
            <textarea name="birthday_message" rows="5" maxlength="1000">${escapeHtml(config.birthdayMessage)}</textarea>
          </label>
          <label>
            <span>Banner title</span>
            <input name="birthday_banner_title" maxlength="120" value="${escapeHtml(config.birthdayBannerTitle)}">
          </label>
          <label>
            <span>Banner subtitle</span>
            <input name="birthday_banner_subtitle" maxlength="180" value="${escapeHtml(config.birthdayBannerSubtitle)}">
          </label>
          ${renderThemeSelect("birthday_banner_theme", "Banner theme", config.birthdayBannerTheme)}
        </div>
        <div class="field-stack">
          <div class="banner-preview">
            <img src="/guild/${guild.id}/birthday-preview.png?${Date.now()}" alt="Birthday banner preview">
          </div>
          ${renderToggle("birthday_banner_enabled", config.birthdayBannerEnabled, "Banner image")}
          <label>
            <span>Background image URL</span>
            <input name="birthday_banner_background_url" type="url" value="${escapeHtml(config.birthdayBannerBackgroundUrl ?? "")}">
          </label>
          <div class="color-grid">
            ${renderColor("birthday_banner_background_color", "Background", config.birthdayBannerBackgroundColor)}
            ${renderColor("birthday_banner_accent_color", "Accent", config.birthdayBannerAccentColor)}
            ${renderColor("birthday_banner_text_color", "Text", config.birthdayBannerTextColor)}
          </div>
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="achievements">
      <div class="panel-heading">
        <div>
          <h2>Achievements</h2>
        </div>
        ${renderToggle("achievements_enabled", config.achievementsEnabled)}
      </div>
      <div class="two-column">
        <div class="field-stack">
          ${renderToggle("achievement_announce_enabled", config.achievementAnnounceEnabled, "Announce earned achievements")}
          ${renderChannelSelect("achievement_announce_channel_id", "Announce channel", channels, config.achievementAnnounceChannelId)}
        </div>
        <div class="field-stack">
          <label>
            <span>Achievement catalog</span>
            <textarea name="achievements_catalog" rows="12">${escapeHtml(formatAchievementsCatalog(config.achievements))}</textarea>
          </label>
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="profile">
      <div class="panel-heading">
        <div>
          <h2>Bot Profile</h2>
          <p>Customize this bot's server profile. These settings apply only in ${escapeHtml(guild.name)}.</p>
        </div>
      </div>
      <div class="two-column">
        <div class="field-stack">
          <label>
            <span>Server name</span>
            <input name="bot_profile_nick" maxlength="32" placeholder="${escapeHtml(botMember.user.username)}" value="${escapeHtml(config.botProfileNick ?? botMember.nickname ?? "")}">
          </label>
          <label>
            <span>Server bio</span>
            <textarea name="bot_profile_bio" rows="5" maxlength="190">${escapeHtml(config.botProfileBio ?? "")}</textarea>
          </label>
          <label>
            <span>Avatar image URL</span>
            <input name="bot_avatar_url" type="url" placeholder="https://example.com/avatar.png">
          </label>
          <label>
            <span>Upload avatar image</span>
            <input name="bot_avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          </label>
          ${renderToggle("clear_bot_avatar", false, "Clear server avatar")}
        </div>
        <div class="field-stack">
          <div class="profile-preview">
            <img class="profile-avatar" src="${escapeHtml(botAvatarUrl)}" alt="Current bot avatar">
            <div>
              <h3>${escapeHtml(botMember.displayName)}</h3>
              <p>${escapeHtml(config.botProfileBio ?? "No server bio set yet.")}</p>
            </div>
          </div>
          ${botBannerUrl ? `<div class="banner-preview compact"><img src="${escapeHtml(botBannerUrl)}" alt="Current bot banner"></div>` : ""}
          <label>
            <span>Banner image URL</span>
            <input name="bot_banner_url" type="url" placeholder="https://example.com/banner.png">
          </label>
          <label>
            <span>Upload banner image</span>
            <input name="bot_banner_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          </label>
          ${renderToggle("clear_bot_banner", false, "Clear server banner")}
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="automod">
      <div class="panel-heading">
        <div>
          <h2>Automod</h2>
          <p>Chat protection rules and the warning ladder.</p>
        </div>
        ${renderToggle("spam_enabled", config.enabled)}
      </div>
      <div class="settings-block">
        <h3>Actions</h3>
        <div class="controls-grid">
          ${renderToggle("auto_mute", config.autoMute, "Mute on strike threshold")}
          ${renderToggle("delete_spam", config.deleteSpam, "Delete violating messages")}
          ${renderNumber("strike_mute_threshold", "Mute after warnings", config.strikeMuteThreshold, NUMERIC_LIMITS.strikeMuteThreshold)}
          ${renderNumber("strike_mute_minutes", "Mute minutes", config.strikeMuteMinutes, NUMERIC_LIMITS.strikeMuteMinutes)}
          ${renderNumber("strike_reset_hours", "Reset after hours", config.strikeResetHours, NUMERIC_LIMITS.strikeResetHours)}
        </div>
      </div>
      <div class="settings-block">
        <h3>Rules</h3>
        <div class="controls-grid">
          ${renderToggle("anti_flood_enabled", config.antiFloodEnabled, "Anti flood")}
          ${renderNumber("message_limit", "Messages", config.messageLimit, NUMERIC_LIMITS.messageLimit)}
          ${renderNumber("window_seconds", "Window seconds", config.windowSeconds, NUMERIC_LIMITS.windowSeconds)}
          ${renderToggle("anti_spam_enabled", config.antiSpamEnabled, "Repeated text spam")}
          ${renderNumber("duplicate_limit", "Duplicate limit", config.duplicateLimit, NUMERIC_LIMITS.duplicateLimit)}
          ${renderToggle("anti_invite_enabled", config.antiInviteEnabled || config.blockInvites, "Invite links")}
          ${renderToggle("anti_scam_enabled", config.antiScamEnabled, "Scam links")}
          ${renderToggle("anti_bad_words_enabled", config.antiBadWordsEnabled, "Bad words")}
          ${renderToggle("anti_mention_spam_enabled", config.antiMentionSpamEnabled, "Mention spam")}
          ${renderNumber("mention_limit", "Mention limit", config.mentionLimit, NUMERIC_LIMITS.mentionLimit)}
          ${renderToggle("anti_emoji_spam_enabled", config.antiEmojiSpamEnabled, "Emoji spam")}
          ${renderNumber("emoji_limit", "Emoji limit", config.emojiLimit, NUMERIC_LIMITS.emojiLimit)}
          ${renderToggle("anti_zalgo_enabled", config.antiZalgoEnabled, "Zalgo text")}
          ${renderNumber("zalgo_mark_limit", "Zalgo marks", config.zalgoMarkLimit, NUMERIC_LIMITS.zalgoMarkLimit)}
          ${renderToggle("caps_protection_enabled", config.capsProtectionEnabled, "Caps protection")}
          ${renderNumber("caps_min_length", "Caps min letters", config.capsMinLength, NUMERIC_LIMITS.capsMinLength)}
          ${renderNumber("caps_percentage", "Caps percent", config.capsPercentage, NUMERIC_LIMITS.capsPercentage)}
          ${renderToggle("anti_ghost_ping_enabled", config.antiGhostPingEnabled, "Ghost ping")}
          ${renderNumber("ghost_ping_window_seconds", "Ghost ping seconds", config.ghostPingWindowSeconds, NUMERIC_LIMITS.ghostPingWindowSeconds)}
        </div>
      </div>
      <div class="two-column">
        <label>
          <span>Bad words</span>
          <textarea name="bad_words" rows="8">${escapeHtml(config.badWords.join("\n"))}</textarea>
        </label>
        <label>
          <span>Scam domains</span>
          <textarea name="scam_domains" rows="8">${escapeHtml(config.scamDomains.join("\n"))}</textarea>
        </label>
      </div>
    </section>

    <section class="panel" data-tab-panel="moderation">
      <div class="panel-heading">
        <h2>Moderation</h2>
      </div>
      <div class="two-column">
        <div class="field-stack">
          ${renderToggle("dm_moderation_enabled", config.dmModerationEnabled, "DM users about moderation actions")}
          ${renderChannelSelect("log_channel_id", "Log channel", channels, config.logChannelId)}
          ${renderMultiSelect("ignored_channel_ids", "Ignored channels", channels, config.ignoredChannelIds)}
        </div>
        <div class="field-stack">
          ${renderMultiSelect("ignored_role_ids", "Ignored roles", roles, config.ignoredRoleIds)}
        </div>
      </div>
    </section>

    <section class="panel" data-tab-panel="commands">
      <div class="panel-heading">
        <div>
          <h2>Commands</h2>
          <p>Set a message-command prefix and turn individual commands on or off for this server.</p>
        </div>
      </div>
      <div class="field-stack command-prefix-block">
        <label>
          <span>Message command prefix</span>
          <input name="command_prefix" maxlength="20" value="${escapeHtml(config.commandPrefix)}">
        </label>
        <p class="field-note">Examples: <code>!</code> makes <code>!warn @user reason</code>; <code>mod</code> makes <code>mod warn @user reason</code>. Slash commands still work.</p>
      </div>
      <div class="command-grid">
        ${COMMAND_TOGGLE_KEYS.map((command) => renderToggle(`command_${command}`, config.commandToggles[command], `/${command}`)).join("")}
      </div>
    </section>

    <footer class="form-actions">
      <button type="submit">Save settings</button>
    </footer>
  </form>`;
}

function renderToggle(name, checked, label = "Enabled") {
  return `<label class="toggle">
    <input type="checkbox" name="${name}" ${checked ? "checked" : ""}>
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function renderNumber(name, label, value, limits) {
  return `<label>
    <span>${escapeHtml(label)}</span>
    <input type="number" name="${name}" value="${value}" min="${limits.min}" max="${limits.max}">
  </label>`;
}

function renderColor(name, label, value) {
  return `<label>
    <span>${escapeHtml(label)}</span>
    <input type="color" name="${name}" value="${escapeHtml(value)}">
  </label>`;
}

function renderThemeSelect(name, label, selectedTheme) {
  return `<label>
    <span>${escapeHtml(label)}</span>
    <select name="${name}">
      ${BANNER_THEMES.map((theme) => renderOption(theme, formatThemeName(theme), selectedTheme)).join("")}
    </select>
  </label>`;
}

function renderChannelSelect(name, label, channels, selectedId) {
  const hasSelectedChannel = selectedId && channels.some((channel) => channel.id === selectedId);
  const savedOption = selectedId && !hasSelectedChannel
    ? renderOption(selectedId, `Saved channel (${selectedId})`, selectedId)
    : "";

  return `<label>
    <span>${escapeHtml(label)}</span>
    <select name="${name}">
      <option value="">Not set</option>
      ${savedOption}
      ${channels.map((channel) => renderOption(channel.id, `#${channel.name}`, selectedId)).join("")}
    </select>
  </label>`;
}

function renderMultiSelect(name, label, items, selectedIds) {
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const missingItems = [...selectedSet].filter(
    (selectedId) => !items.some((item) => item.id === selectedId)
  );

  return `<label>
    <span>${escapeHtml(label)}</span>
    <select name="${name}" multiple size="8">
      ${missingItems.map((selectedId) => renderOption(selectedId, `Saved item (${selectedId})`, selectedIds)).join("")}
      ${items.map((item) => renderOption(item.id, item.name, selectedIds)).join("")}
    </select>
  </label>`;
}

function renderOption(value, label, selected) {
  const selectedIds = Array.isArray(selected) ? selected : [selected];
  const isSelected = selectedIds.includes(value);
  return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formatThemeName(theme) {
  return theme
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function applyBotProfileUpdate(guild, currentConfig, body, files = {}) {
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const desiredNick = readOptionalProfileText(body.bot_profile_nick, 32);
  const desiredBio = readOptionalProfileText(body.bot_profile_bio, 190);
  const options = {};
  const patch = {};

  if (desiredNick !== (botMember.nickname ?? null)) {
    options.nick = desiredNick;
    patch.botProfileNick = desiredNick;
  }

  if (desiredBio !== currentConfig.botProfileBio) {
    options.bio = desiredBio;
    patch.botProfileBio = desiredBio;
  }

  if (body.clear_bot_avatar === "on") {
    options.avatar = null;
  } else {
    const avatar = await readProfileImage(files.bot_avatar_file?.[0], body.bot_avatar_url);

    if (avatar) {
      options.avatar = avatar;
    }
  }

  if (body.clear_bot_banner === "on") {
    options.banner = null;
  } else {
    const banner = await readProfileImage(files.bot_banner_file?.[0], body.bot_banner_url);

    if (banner) {
      options.banner = banner;
    }
  }

  if (Object.keys(options).length > 0) {
    await guild.members.editMe({
      ...options,
      reason: "Updated from bot dashboard"
    });
  }

  return patch;
}

function readSettingsPatch(body) {
  const commandToggles = Object.fromEntries(
    COMMAND_TOGGLE_KEYS.map((command) => [command, body[`command_${command}`] === "on"])
  );

  return {
    enabled: body.spam_enabled === "on",
    autoMute: body.auto_mute === "on",
    messageLimit: body.message_limit,
    windowSeconds: body.window_seconds,
    duplicateLimit: body.duplicate_limit,
    mentionLimit: body.mention_limit,
    deleteSpam: body.delete_spam === "on",
    blockInvites: body.anti_invite_enabled === "on",
    antiSpamEnabled: body.anti_spam_enabled === "on",
    antiFloodEnabled: body.anti_flood_enabled === "on",
    antiInviteEnabled: body.anti_invite_enabled === "on",
    antiScamEnabled: body.anti_scam_enabled === "on",
    antiBadWordsEnabled: body.anti_bad_words_enabled === "on",
    antiMentionSpamEnabled: body.anti_mention_spam_enabled === "on",
    antiEmojiSpamEnabled: body.anti_emoji_spam_enabled === "on",
    antiZalgoEnabled: body.anti_zalgo_enabled === "on",
    antiGhostPingEnabled: body.anti_ghost_ping_enabled === "on",
    capsProtectionEnabled: body.caps_protection_enabled === "on",
    emojiLimit: body.emoji_limit,
    zalgoMarkLimit: body.zalgo_mark_limit,
    capsMinLength: body.caps_min_length,
    capsPercentage: body.caps_percentage,
    ghostPingWindowSeconds: body.ghost_ping_window_seconds,
    strikeMuteMinutes: body.strike_mute_minutes,
    strikeResetHours: body.strike_reset_hours,
    strikeMuteThreshold: body.strike_mute_threshold,
    badWords: body.bad_words,
    scamDomains: body.scam_domains,
    commandPrefix: body.command_prefix,
    commandToggles,
    dmModerationEnabled: body.dm_moderation_enabled === "on",
    logChannelId: body.log_channel_id || null,
    welcomeEnabled: body.welcome_enabled === "on",
    welcomeChannelId: body.welcome_channel_id || null,
    welcomeInviteTrackingEnabled: body.welcome_invite_tracking_enabled === "on",
    welcomeShowInviter: body.welcome_show_inviter === "on",
    welcomeMessage: body.welcome_message,
    welcomeBannerEnabled: body.welcome_banner_enabled === "on",
    welcomeBannerTitle: body.welcome_banner_title,
    welcomeBannerSubtitle: body.welcome_banner_subtitle,
    welcomeBannerInviteLine: body.welcome_banner_invite_line,
    welcomeBannerTheme: body.welcome_banner_theme,
    welcomeBannerBackgroundUrl: body.welcome_banner_background_url || null,
    welcomeBannerBackgroundColor: body.welcome_banner_background_color,
    welcomeBannerAccentColor: body.welcome_banner_accent_color,
    welcomeBannerTextColor: body.welcome_banner_text_color,
    guessNumberEnabled: body.guess_number_enabled === "on",
    guessNumberChannelId: body.guess_number_channel_id || null,
    guessNumberMin: body.guess_number_min,
    guessNumberMax: body.guess_number_max,
    guessNumberMaxAttempts: body.guess_number_max_attempts,
    guessNumberBannerEnabled: body.guess_number_banner_enabled === "on",
    guessNumberBannerTheme: body.guess_number_banner_theme,
    guessNumberBannerTitle: body.guess_number_banner_title,
    guessNumberBannerSubtitle: body.guess_number_banner_subtitle,
    guessNumberWinMessage: body.guess_number_win_message,
    guessNumberBannerBackgroundUrl: body.guess_number_banner_background_url || null,
    guessNumberBannerBackgroundColor: body.guess_number_banner_background_color,
    guessNumberBannerAccentColor: body.guess_number_banner_accent_color,
    guessNumberBannerTextColor: body.guess_number_banner_text_color,
    birthdayEnabled: body.birthday_enabled === "on",
    birthdayChannelId: body.birthday_channel_id || null,
    birthdayMessage: body.birthday_message,
    birthdayBannerEnabled: body.birthday_banner_enabled === "on",
    birthdayBannerTheme: body.birthday_banner_theme,
    birthdayBannerTitle: body.birthday_banner_title,
    birthdayBannerSubtitle: body.birthday_banner_subtitle,
    birthdayBannerBackgroundUrl: body.birthday_banner_background_url || null,
    birthdayBannerBackgroundColor: body.birthday_banner_background_color,
    birthdayBannerAccentColor: body.birthday_banner_accent_color,
    birthdayBannerTextColor: body.birthday_banner_text_color,
    birthdayCheckHour: body.birthday_check_hour,
    birthdayTimezoneOffsetMinutes: body.birthday_timezone_offset_minutes,
    achievementsEnabled: body.achievements_enabled === "on",
    achievementAnnounceEnabled: body.achievement_announce_enabled === "on",
    achievementAnnounceChannelId: body.achievement_announce_channel_id || null,
    achievements: body.achievements_catalog,
    ignoredChannelIds: toArray(body.ignored_channel_ids),
    ignoredRoleIds: toArray(body.ignored_role_ids)
  };
}

async function getTextChannels(guild) {
  const channels = await guild.channels.fetch();
  return [...channels.values()]
    .filter(Boolean)
    .filter((channel) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type))
    .sort((a, b) => a.rawPosition - b.rawPosition || a.name.localeCompare(b.name));
}

async function getRoles(guild) {
  await guild.roles.fetch().catch(() => null);
  return [...guild.roles.cache.values()]
    .filter((role) => !role.managed && role.id !== guild.id)
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
}

function getGuilds(client) {
  return [...client.guilds.cache.values()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

function previewInviteInfo() {
  return {
    code: "welcome",
    inviterId: null,
    inviterTag: "im_mercyxx",
    inviterUsername: "im_mercyxx",
    inviterMention: "im_mercyxx",
    inviterInvites: 1
  };
}

function formatAchievementsCatalog(achievements) {
  return achievements
    .map((achievement) => [
      achievement.key,
      achievement.title,
      achievement.description,
      achievement.badge,
      achievement.enabled ? "true" : "false"
    ].join(" | "))
    .join("\n");
}

function isAuthenticated(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.dashboard;

  if (!token) {
    return false;
  }

  const [value, signature] = token.split(".");

  if (value !== "admin" || !signature) {
    return false;
  }

  const expected = sign(value, secret);
  return safeEqual(signature, expected);
}

function createAuthCookie(secret) {
  const value = "admin";
  const signature = sign(value, secret);
  return `dashboard=${value}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [
          decodeURIComponent(cookie.slice(0, index)),
          decodeURIComponent(cookie.slice(index + 1))
        ];
      })
  );
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  return value ? [String(value)] : [];
}

function readOptionalProfileText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function readProfileImage(file, urlValue) {
  if (file?.buffer?.length) {
    return file.buffer;
  }

  if (!urlValue || !String(urlValue).trim()) {
    return null;
  }

  let url;

  try {
    url = new URL(String(urlValue).trim());
  } catch {
    throw new Error("Profile image URL is not valid.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Profile image URL must start with http:// or https://.");
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not download profile image: HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error("Profile image URL did not return an image.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length > 8 * 1024 * 1024) {
    throw new Error("Profile image must be 8 MB or smaller.");
  }

  return bytes;
}

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
