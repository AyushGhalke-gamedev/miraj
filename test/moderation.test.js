import assert from "node:assert/strict";
import test from "node:test";
import { buildModerationDmContent } from "../src/moderation.js";

test("builds moderation DM content with action details", () => {
  const content = buildModerationDmContent(
    { name: "Code Club" },
    {
      action: "Timeout",
      duration: "6 hours",
      reason: "AutoMod threshold reached",
      moderator: "AutoMod",
      extra: "Active AutoMod warnings: 3/3."
    }
  );

  assert.match(content, /Moderation notice from Code Club/);
  assert.match(content, /Action: Timeout/);
  assert.match(content, /Duration: 6 hours/);
  assert.match(content, /Reason: AutoMod threshold reached/);
  assert.match(content, /Moderator: AutoMod/);
});
