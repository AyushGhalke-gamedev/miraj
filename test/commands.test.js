import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { commands } from "../src/commands.js";

test("all slash commands are administrator-only by default", () => {
  const administrator = String(PermissionFlagsBits.Administrator);

  assert.ok(commands.length > 0);

  for (const command of commands) {
    assert.equal(
      command.default_member_permissions,
      administrator,
      `${command.name} should require Administrator`
    );
  }
});
