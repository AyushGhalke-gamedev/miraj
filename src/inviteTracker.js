export class InviteTracker {
  constructor() {
    this.snapshots = new Map();
  }

  async warmGuilds(guilds) {
    await Promise.allSettled([...guilds.values()].map((guild) => this.warmGuild(guild)));
  }

  async warmGuild(guild) {
    const invites = await fetchGuildInvites(guild);
    this.snapshots.set(guild.id, snapshotInvites(invites));
    return true;
  }

  rememberCreatedInvite(invite) {
    const guildId = invite.guild?.id ?? invite.guildId;

    if (!guildId) {
      return;
    }

    const snapshot = this.snapshots.get(guildId) ?? new Map();
    snapshot.set(invite.code, snapshotInvite(invite));
    this.snapshots.set(guildId, snapshot);
  }

  forgetDeletedInvite(invite) {
    const guildId = invite.guild?.id ?? invite.guildId;

    if (!guildId || !this.snapshots.has(guildId)) {
      return;
    }

    this.snapshots.get(guildId).delete(invite.code);
  }

  async identifyInvite(guild) {
    const previous = this.snapshots.get(guild.id);
    const currentInvites = await fetchGuildInvites(guild);
    const current = snapshotInvites(currentInvites);

    this.snapshots.set(guild.id, current);

    if (!previous) {
      return null;
    }

    const usedInvite = [...current.values()].find((invite) => {
      const oldUses = previous.get(invite.code)?.uses ?? 0;
      return invite.uses > oldUses;
    });

    if (!usedInvite) {
      return null;
    }

    const inviterInvites = [...current.values()]
      .filter((invite) => invite.inviterId && invite.inviterId === usedInvite.inviterId)
      .reduce((total, invite) => total + invite.uses, 0);

    return {
      code: usedInvite.code,
      inviterId: usedInvite.inviterId,
      inviterTag: usedInvite.inviterTag,
      inviterUsername: usedInvite.inviterUsername,
      inviterMention: usedInvite.inviterId ? `<@${usedInvite.inviterId}>` : "Unknown inviter",
      inviterInvites
    };
  }
}

async function fetchGuildInvites(guild) {
  return guild.invites.fetch({ cache: false });
}

function snapshotInvites(invites) {
  return new Map([...invites.values()].map((invite) => [invite.code, snapshotInvite(invite)]));
}

function snapshotInvite(invite) {
  return {
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id ?? null,
    inviterTag: invite.inviter?.tag ?? invite.inviter?.username ?? "Unknown inviter",
    inviterUsername: invite.inviter?.username ?? "Unknown inviter"
  };
}
