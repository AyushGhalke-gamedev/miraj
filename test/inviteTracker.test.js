import assert from "node:assert/strict";
import test from "node:test";
import { InviteTracker } from "../src/inviteTracker.js";

test("identifies the invite whose use count increased", async () => {
  const tracker = new InviteTracker();
  const guild = fakeGuild("guild-1", [
    invite("aaa", 1, "100", "mercy"),
    invite("bbb", 3, "200", "zainu")
  ]);

  await tracker.warmGuild(guild);
  guild.setInvites([
    invite("aaa", 2, "100", "mercy"),
    invite("bbb", 3, "200", "zainu")
  ]);

  const result = await tracker.identifyInvite(guild);

  assert.equal(result.code, "aaa");
  assert.equal(result.inviterUsername, "mercy");
  assert.equal(result.inviterInvites, 2);
});

function fakeGuild(id, initialInvites) {
  let currentInvites = initialInvites;

  return {
    id,
    invites: {
      fetch: async () => new Map(currentInvites.map((item) => [item.code, item]))
    },
    setInvites(nextInvites) {
      currentInvites = nextInvites;
    }
  };
}

function invite(code, uses, inviterId, username) {
  return {
    code,
    uses,
    inviter: {
      id: inviterId,
      tag: username,
      username
    }
  };
}
