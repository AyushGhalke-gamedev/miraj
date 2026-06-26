import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCommandPrefix,
  parseMessageCommand,
  tokenizeCommandArgs
} from "../src/messageCommands.js";

test("parses symbol and word-prefixed message commands", () => {
  assert.deepEqual(parseMessageCommand("!warn <@123> stop that", "!"), {
    commandName: "warn",
    argsText: "<@123> stop that",
    prefix: "!"
  });

  assert.deepEqual(parseMessageCommand("mod warn <@123> stop that", "mod"), {
    commandName: "warn",
    argsText: "<@123> stop that",
    prefix: "mod"
  });

  assert.equal(parseMessageCommand("moderation warn <@123>", "mod"), null);
});

test("normalizes command prefixes and tokenizes quoted args", () => {
  assert.equal(normalizeCommandPrefix("  mod team  "), "mod team");
  assert.equal(normalizeCommandPrefix("   "), "!");
  assert.deepEqual(
    tokenizeCommandArgs('<@123> "quoted reason" plain').map((token) => token.value),
    ["<@123>", "quoted reason", "plain"]
  );
});
