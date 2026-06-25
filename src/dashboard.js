import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import { ChannelType } from "discord.js";
import { COMMAND_TOGGLE_KEYS, NUMERIC_LIMITS } from "./config.js";
import { createWelcomeBanner } from "./welcome.js";

let server = null;

export function startDashboard(client, store) {
  if (server) {
    return server;
  }

  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    console.warn("Dashboard disabled. Set DASHBOARD_PASSWORD to enable the web admin dashboard.");
    return null;
  }

  const app = express();
  const port = readPort(process.env.DASHBOARD_PORT, 3000);
  const host = process.env.DASHBOARD_HOST || "127.0.0.1";
  const secret = process.env.DASHBOARD_SECRET || crypto
    .createHash("sha256")
    .update(`${password}:${process.env.DISCORD_TOKEN ?? ""}`)
    .digest("hex");

  app.disable("x-powered-by");
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

    response.send(renderLayout({
      title: `${guild.name} Dashboard`,
      guilds: getGuilds(client),
      activeGuildId: guild.id,
      content: renderGuildSettings({
        guild,
        config,
        channels,
        roles,
        saved: request.query.saved === "1"
      })
    }));
  });

  app.post("/guild/:guildId/settings", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).send("Guild not found.");
      return;
    }

    const patch = readSettingsPatch(request.body);
    await store.update(guild.id, patch);
    response.redirect(`/guild/${guild.id}?saved=1`);
  });

  app.get("/guild/:guildId/welcome-preview.png", async (request, response) => {
    const guild = client.guilds.cache.get(request.params.guildId);

    if (!guild) {
      response.status(404).end();
      return;
    }

    const member = guild.members.me ?? await guild.members.fetchMe();
    const config = store.get(guild.id);
    const banner = await createWelcomeBanner(member, config);

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

function renderGuildSettings({ guild, config, channels, roles, saved }) {
  return `<section class="page-header">
    <div>
      <p class="eyebrow">Server dashboard</p>
      <h1>${escapeHtml(guild.name)}</h1>
    </div>
    ${saved ? "<p class=\"save-pill\">Saved</p>" : ""}
  </section>

  <form class="settings-form" method="post" action="/guild/${guild.id}/settings">
    <div class="tab-bar" role="tablist" aria-label="Settings sections">
      <button class="tab-button active" type="button" data-tab="welcome">Welcome</button>
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
          <p>Turn individual admin commands on or off for this server.</p>
        </div>
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

function renderChannelSelect(name, label, channels, selectedId) {
  return `<label>
    <span>${escapeHtml(label)}</span>
    <select name="${name}">
      <option value="">Not set</option>
      ${channels.map((channel) => renderOption(channel.id, `#${channel.name}`, selectedId)).join("")}
    </select>
  </label>`;
}

function renderMultiSelect(name, label, items, selectedIds) {
  return `<label>
    <span>${escapeHtml(label)}</span>
    <select name="${name}" multiple size="8">
      ${items.map((item) => renderOption(item.id, item.name, selectedIds)).join("")}
    </select>
  </label>`;
}

function renderOption(value, label, selected) {
  const selectedIds = Array.isArray(selected) ? selected : [selected];
  const isSelected = selectedIds.includes(value);
  return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
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
    commandToggles,
    dmModerationEnabled: body.dm_moderation_enabled === "on",
    logChannelId: body.log_channel_id || null,
    welcomeEnabled: body.welcome_enabled === "on",
    welcomeChannelId: body.welcome_channel_id || null,
    welcomeMessage: body.welcome_message,
    welcomeBannerEnabled: body.welcome_banner_enabled === "on",
    welcomeBannerTitle: body.welcome_banner_title,
    welcomeBannerSubtitle: body.welcome_banner_subtitle,
    welcomeBannerBackgroundUrl: body.welcome_banner_background_url || null,
    welcomeBannerBackgroundColor: body.welcome_banner_background_color,
    welcomeBannerAccentColor: body.welcome_banner_accent_color,
    welcomeBannerTextColor: body.welcome_banner_text_color,
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
