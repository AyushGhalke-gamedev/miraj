import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { commands, publicCommandNames } from "../src/commands.js";

test("moderation slash commands are administrator-only by default", () => {
  const administrator = String(PermissionFlagsBits.Administrator);

  assert.ok(commands.length > 0);

  for (const command of commands) {
    if (publicCommandNames.has(command.name)) {
      assert.equal(
        command.default_member_permissions,
        undefined,
        `${command.name} should be usable by members`
      );
      continue;
    }

    assert.equal(
      command.default_member_permissions,
      administrator,
      `${command.name} should require Administrator`
    );
  }
});
