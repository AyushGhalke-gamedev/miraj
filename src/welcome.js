import { AttachmentBuilder } from "discord.js";

const BANNER_WIDTH = 1000;
const BANNER_HEIGHT = 360;
const BANNER_FILENAME = "welcome-banner.png";

export async function sendWelcome(member, store, inviteTracker = null) {
  const config = store.get(member.guild.id);

  if (!config.welcomeEnabled || !config.welcomeChannelId) {
    return false;
  }

  const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return false;
  }

  const inviteInfo = await resolveInviteInfo(member, config, inviteTracker);
  const payload = await buildWelcomePayload(member, config, inviteInfo);
  await channel.send(payload);
  return true;
}

export async function buildWelcomePayload(member, config, inviteInfo = null) {
  const content = renderWelcomeTemplate(config.welcomeMessage, member, inviteInfo);
  const files = [];

  if (config.welcomeBannerEnabled) {
    const banner = await createWelcomeBanner(member, config, inviteInfo);
    files.push(new AttachmentBuilder(banner, { name: BANNER_FILENAME }));
  }

  return {
    content,
    files,
    allowedMentions: {
      parse: [],
      users: [member.id, inviteInfo?.inviterId].filter(Boolean)
    }
  };
}

export async function createWelcomeBanner(member, config, inviteInfo = null) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
  const context = canvas.getContext("2d");

  await drawBackground(context, loadImage, config);
  await drawAvatar(context, loadImage, member);
  drawBannerText(context, member, config, inviteInfo);

  return canvas.toBuffer("image/png");
}

export function renderWelcomeTemplate(template, member, inviteInfo = null) {
  const replacements = {
    mention: `<@${member.id}>`,
    username: member.user?.username ?? "friend",
    displayName: member.displayName ?? member.user?.globalName ?? member.user?.username ?? "friend",
    server: member.guild?.name ?? "the server",
    memberCount: String(member.guild?.memberCount ?? "?"),
    inviterName: inviteInfo?.inviterUsername ?? inviteInfo?.inviterTag ?? "Unknown inviter",
    inviterMention: inviteInfo?.inviterMention ?? "Unknown inviter",
    inviterInvites: Number.isFinite(inviteInfo?.inviterInvites)
      ? String(inviteInfo.inviterInvites)
      : "?",
    inviteCode: inviteInfo?.code ?? "unknown"
  };

  return String(template).replace(
    /\{(mention|username|displayName|server|memberCount|inviterName|inviterMention|inviterInvites|inviteCode)\}/g,
    (_match, key) => replacements[key]
  );
}

async function drawBackground(context, loadImage, config) {
  const baseColor = config.welcomeBannerBackgroundColor;
  const accentColor = config.welcomeBannerAccentColor;

  context.fillStyle = baseColor;
  context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

  if (config.welcomeBannerBackgroundUrl) {
    const background = await loadRemoteImage(loadImage, config.welcomeBannerBackgroundUrl).catch(() => null);

    if (background) {
      drawCoverImage(context, background, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
      context.fillStyle = "rgba(0, 0, 0, 0.45)";
      context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    }
  }

  const gradient = context.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  gradient.addColorStop(0, withAlpha(accentColor, 0.2));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

  context.fillStyle = withAlpha(accentColor, 0.9);
  context.fillRect(0, BANNER_HEIGHT - 12, BANNER_WIDTH, 12);
}

async function drawAvatar(context, loadImage, member) {
  const avatarUrl = member.displayAvatarURL?.({ extension: "png", size: 256 })
    ?? member.user?.displayAvatarURL?.({ extension: "png", size: 256 });
  const avatar = avatarUrl ? await loadRemoteImage(loadImage, avatarUrl).catch(() => null) : null;
  const centerX = 188;
  const centerY = 180;
  const radius = 108;

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
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
    context.fillStyle = "#495057";
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  context.restore();
}

function drawBannerText(context, member, config, inviteInfo) {
  const title = renderWelcomeTemplate(config.welcomeBannerTitle, member, inviteInfo);
  const subtitle = renderWelcomeTemplate(config.welcomeBannerSubtitle, member, inviteInfo);
  const inviteLine = config.welcomeShowInviter
    ? renderWelcomeTemplate(config.welcomeBannerInviteLine, member, inviteInfo)
    : "";
  const textX = 340;
  const maxWidth = 600;

  context.fillStyle = config.welcomeBannerTextColor;
  context.textBaseline = "top";
  context.font = `800 ${fitFontSize(context, title, maxWidth, 56, 32, 800)}px Arial`;
  context.fillText(title, textX, inviteLine ? 84 : 118);

  context.font = `600 ${fitFontSize(context, subtitle, maxWidth, 32, 21, 600)}px Arial`;
  wrapText(context, subtitle, textX, inviteLine ? 164 : 202, maxWidth, 40, 2);

  if (inviteLine) {
    context.font = `700 ${fitFontSize(context, inviteLine, maxWidth, 28, 18, 700)}px Arial`;
    wrapText(context, inviteLine, textX, 260, maxWidth, 34, 1);
  }
}

async function resolveInviteInfo(member, config, inviteTracker) {
  if (!config.welcomeInviteTrackingEnabled || !config.welcomeShowInviter || !inviteTracker) {
    return null;
  }

  return inviteTracker.identifyInvite(member.guild).catch(() => null);
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
  const words = text.split(/\s+/);
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
