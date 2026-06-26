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

test("builds warning DM content with warning metadata", () => {
  const content = buildModerationDmContent(
    { name: "Code Club" },
    {
      action: "Warning",
      target: "Member#0001 (123)",
      source: "Admin",
      warningId: "warn-1",
      reason: "Repeated rule break",
      moderator: "Mod#0001 (456)",
      moderatorLabel: "Warned by",
      totalWarnings: 2
    }
  );

  assert.match(content, /User: Member#0001 \(123\)/);
  assert.match(content, /Source: Admin/);
  assert.match(content, /Warning ID: warn-1/);
  assert.match(content, /Warned by: Mod#0001 \(456\)/);
  assert.match(content, /Total warnings: 2/);
});
