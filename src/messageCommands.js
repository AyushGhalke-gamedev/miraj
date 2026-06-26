export const DEFAULT_COMMAND_PREFIX = "!";

export function normalizeCommandPrefix(value, fallback = DEFAULT_COMMAND_PREFIX) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 20);
}

export function parseMessageCommand(content, prefix = DEFAULT_COMMAND_PREFIX) {
  const commandPrefix = normalizeCommandPrefix(prefix);
  const text = String(content ?? "").trimStart();

  if (!text.startsWith(commandPrefix)) {
    return null;
  }

  const nextCharacter = text[commandPrefix.length];

  if (nextCharacter && isWordCharacter(commandPrefix.at(-1)) && !/\s/.test(nextCharacter)) {
    return null;
  }

  const remainder = text.slice(commandPrefix.length).trimStart();

  if (!remainder) {
    return null;
  }

  const firstToken = readFirstToken(remainder);

  if (!firstToken) {
    return null;
  }

  const commandName = firstToken.value.toLowerCase();

  if (!/^[a-z][a-z0-9-]{0,31}$/.test(commandName)) {
    return null;
  }

  return {
    commandName,
    argsText: remainder.slice(firstToken.end).trimStart(),
    prefix: commandPrefix
  };
}

export function tokenizeCommandArgs(input) {
  const text = String(input ?? "");
  const tokens = [];
  const matcher = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    const quotedValue = match[1] ?? match[2];
    tokens.push({
      value: quotedValue === undefined ? match[3] : unescapeQuotedToken(quotedValue),
      raw: match[0],
      start: match.index,
      end: matcher.lastIndex
    });
  }

  return tokens;
}

export function readFirstToken(input) {
  return tokenizeCommandArgs(input)[0] ?? null;
}

function unescapeQuotedToken(value) {
  return value.replace(/\\(["'\\])/g, "$1");
}

function isWordCharacter(value) {
  return /^[a-z0-9]$/i.test(value ?? "");
}
