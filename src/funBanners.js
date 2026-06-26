import { AttachmentBuilder } from "discord.js";

const BANNER_WIDTH = 1000;
const BANNER_HEIGHT = 360;

export async function createGuessNumberBanner(guild, config, details = {}) {
  return createThemedBanner({
    title: renderGuessTemplate(config.guessNumberBannerTitle, guild, details),
    subtitle: renderGuessTemplate(config.guessNumberBannerSubtitle, guild, details),
    footer: details.footer ?? "Use /guessnumber guess to play.",
    badge: "GAME",
    theme: config.guessNumberBannerTheme,
    backgroundUrl: config.guessNumberBannerBackgroundUrl,
    backgroundColor: config.guessNumberBannerBackgroundColor,
    accentColor: config.guessNumberBannerAccentColor,
    textColor: config.guessNumberBannerTextColor
  });
}

export async function createBirthdayBanner(member, config) {
  return createThemedBanner({
    title: renderBirthdayTemplate(config.birthdayBannerTitle, member),
    subtitle: renderBirthdayTemplate(config.birthdayBannerSubtitle, member),
    footer: "Today is their day.",
    badge: "BDAY",
    avatarUrl: member.displayAvatarURL?.({ extension: "png", size: 256 })
      ?? member.user?.displayAvatarURL?.({ extension: "png", size: 256 }),
    theme: config.birthdayBannerTheme,
    backgroundUrl: config.birthdayBannerBackgroundUrl,
    backgroundColor: config.birthdayBannerBackgroundColor,
    accentColor: config.birthdayBannerAccentColor,
    textColor: config.birthdayBannerTextColor
  });
}

export function buildGuessNumberPayload(guild, config, details = {}) {
  const content = details.content ?? renderGuessTemplate(
    "A guess-the-number game started in {server}. Range: {min}-{max}.",
    guild,
    details
  );
  const files = [];

  return Promise.resolve()
    .then(async () => {
      if (config.guessNumberBannerEnabled) {
        const banner = await createGuessNumberBanner(guild, config, details);
        files.push(new AttachmentBuilder(banner, { name: "guess-number.png" }));
      }

      return {
        content,
        files,
        allowedMentions: { parse: [] }
      };
    });
}

export async function buildBirthdayPayload(member, config) {
  const content = renderBirthdayTemplate(config.birthdayMessage, member);
  const files = [];

  if (config.birthdayBannerEnabled) {
    const banner = await createBirthdayBanner(member, config);
    files.push(new AttachmentBuilder(banner, { name: "birthday-banner.png" }));
  }

  return {
    content,
    files,
    allowedMentions: {
      parse: [],
      users: [member.id]
    }
  };
}

export function renderBirthdayTemplate(template, member) {
  const replacements = {
    mention: `<@${member.id}>`,
    username: member.user?.username ?? "friend",
    displayName: member.displayName ?? member.user?.globalName ?? member.user?.username ?? "friend",
    server: member.guild?.name ?? "the server",
    memberCount: String(member.guild?.memberCount ?? "?")
  };

  return String(template).replace(
    /\{(mention|username|displayName|server|memberCount)\}/g,
    (_match, key) => replacements[key]
  );
}

export function renderGuessTemplate(template, guild, details = {}) {
  const replacements = {
    server: guild?.name ?? "the server",
    min: String(details.min ?? "?"),
    max: String(details.max ?? "?"),
    attempts: String(details.attempts ?? details.maxAttempts ?? "?"),
    number: String(details.number ?? "?"),
    mention: details.userId ? `<@${details.userId}>` : "Someone",
    username: details.username ?? "Someone",
    channel: details.channelId ? `<#${details.channelId}>` : "this channel"
  };

  return String(template).replace(
    /\{(server|min|max|attempts|number|mention|username|channel)\}/g,
    (_match, key) => replacements[key]
  );
}

async function createThemedBanner(options) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
  const context = canvas.getContext("2d");

  await drawBackground(context, loadImage, options);
  await drawBadgeOrAvatar(context, loadImage, options);
  drawText(context, options);

  return canvas.toBuffer("image/png");
}

async function drawBackground(context, loadImage, options) {
  const base = options.backgroundColor;
  const accent = options.accentColor;
  const theme = options.theme ?? "classic";

  context.fillStyle = base;
  context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

  if (options.backgroundUrl) {
    const background = await loadRemoteImage(loadImage, options.backgroundUrl).catch(() => null);

    if (background) {
      drawCoverImage(context, background, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
      context.fillStyle = "rgba(0, 0, 0, 0.48)";
      context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    }
  }

  if (theme === "pastel") {
    const gradient = context.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    gradient.addColorStop(0, withAlpha(accent, 0.72));
    gradient.addColorStop(0.52, withAlpha(base, 0.76));
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.24)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    drawConfetti(context, accent);
    return;
  }

  if (theme === "arcade") {
    context.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let x = -80; x < BANNER_WIDTH; x += 80) {
      context.fillRect(x, 0, 26, BANNER_HEIGHT);
    }
    context.fillStyle = withAlpha(accent, 0.8);
    context.fillRect(0, 0, BANNER_WIDTH, 10);
    context.fillRect(0, BANNER_HEIGHT - 10, BANNER_WIDTH, 10);
    return;
  }

  if (theme === "neon") {
    const gradient = context.createRadialGradient(760, 60, 40, 760, 60, 520);
    gradient.addColorStop(0, withAlpha(accent, 0.74));
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    drawNeonLines(context, accent);
    return;
  }

  if (theme === "midnight") {
    drawStars(context, accent);
    const gradient = context.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.04)");
    gradient.addColorStop(1, withAlpha(accent, 0.25));
    context.fillStyle = gradient;
    context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    return;
  }

  const gradient = context.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  gradient.addColorStop(0, withAlpha(accent, 0.22));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  context.fillStyle = withAlpha(accent, 0.9);
  context.fillRect(0, BANNER_HEIGHT - 12, BANNER_WIDTH, 12);
}

async function drawBadgeOrAvatar(context, loadImage, options) {
  const centerX = 190;
  const centerY = 180;
  const radius = 108;
  const avatar = options.avatarUrl
    ? await loadRemoteImage(loadImage, options.avatarUrl).catch(() => null)
    : null;

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();

  if (avatar) {
    context.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else {
    context.fillStyle = withAlpha(options.accentColor, 0.94);
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    context.fillStyle = options.textColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${fitFontSize(context, options.badge, 150, 54, 24, 900)}px Arial`;
    context.fillText(options.badge, centerX, centerY);
  }

  context.restore();
}

function drawText(context, options) {
  const textX = 340;
  const maxWidth = 600;

  context.fillStyle = options.textColor;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `900 ${fitFontSize(context, options.title, maxWidth, 58, 30, 900)}px Arial`;
  context.fillText(options.title, textX, 86);

  context.font = `700 ${fitFontSize(context, options.subtitle, maxWidth, 32, 20, 700)}px Arial`;
  wrapText(context, options.subtitle, textX, 166, maxWidth, 40, 2);

  if (options.footer) {
    context.font = `700 ${fitFontSize(context, options.footer, maxWidth, 26, 17, 700)}px Arial`;
    context.fillStyle = withAlpha(options.textColor, 0.88);
    wrapText(context, options.footer, textX, 270, maxWidth, 32, 1);
  }
}

function drawConfetti(context, accent) {
  const colors = [accent, "#ffffff", "#facc15", "#38bdf8", "#fb7185"];

  for (let index = 0; index < 46; index += 1) {
    context.fillStyle = withAlpha(colors[index % colors.length], 0.64);
    context.fillRect((index * 83) % BANNER_WIDTH, (index * 47) % BANNER_HEIGHT, 12, 6);
  }
}

function drawNeonLines(context, accent) {
  context.strokeStyle = withAlpha(accent, 0.64);
  context.lineWidth = 3;

  for (let index = 0; index < 7; index += 1) {
    context.beginPath();
    context.moveTo(520 + index * 74, 0);
    context.lineTo(350 + index * 74, BANNER_HEIGHT);
    context.stroke();
  }
}

function drawStars(context, accent) {
  for (let index = 0; index < 72; index += 1) {
    const size = index % 5 === 0 ? 3 : 2;
    context.fillStyle = index % 4 === 0 ? withAlpha(accent, 0.75) : "rgba(255, 255, 255, 0.55)";
    context.fillRect((index * 97) % BANNER_WIDTH, (index * 53) % BANNER_HEIGHT, size, size);
  }
}

async function loadRemoteImage(loadImage, url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error("URL did not return an image.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return loadImage(bytes);
}

function drawCoverImage(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function fitFontSize(context, text, maxWidth, startSize, minSize, weight) {
  for (let size = startSize; size >= minSize; size -= 2) {
    context.font = `${weight} ${size}px Arial`;

    if (context.measureText(text).width <= maxWidth) {
      return size;
    }
  }

  return minSize;
}

function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }

  for (let index = 0; index < Math.min(maxLines, lines.length); index += 1) {
    const suffix = index === maxLines - 1 && lines.length > maxLines ? "..." : "";
    context.fillText(`${lines[index]}${suffix}`, x, y + index * lineHeight);
  }
}

function withAlpha(hex, alpha) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
