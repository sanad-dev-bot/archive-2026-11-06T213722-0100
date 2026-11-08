const { ChannelType, PermissionFlagsBits: P, Routes } = require('discord.js');
const { getGuildConfig, setGuildConfig, deleteGuildConfigKey } = require('./storage');

// What a lockdown takes away from @everyone in every room
const LOCK_BITS = P.SendMessages | P.SendMessagesInThreads | P.CreatePublicThreads
  | P.CreatePrivateThreads | P.AddReactions | P.Connect;

const LOCKABLE = new Set([
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice,
  ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia,
]);

const running = new Map(); // guildId -> promise of the lock/unlock in progress (one at a time per server)

function serial(guildId, job) {
  const prev = running.get(guildId) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  running.set(guildId, next.finally(() => { if (running.get(guildId) === next) running.delete(guildId); }));
  return next;
}

function isLocked(guildId) {
  return Boolean(getGuildConfig(guildId).lockdown?.active);
}

async function inBatches(items, size, fn) {
  let ok = 0;
  for (let n = 0; n < items.length; n += size) {
    const results = await Promise.allSettled(items.slice(n, n + size).map(fn));
    ok += results.filter(r => r.status === 'fulfilled').length;
  }
  return ok;
}

// Locks every room for @everyone and remembers the old overwrite of each.
// skipIds: rooms that must stay usable (the review room).
function lockServer(guild, reason, skipIds = []) {
  return serial(guild.id, async () => {
    const everyone = guild.id;
    const saved = getGuildConfig(guild.id).lockdown || { channels: {} };
    const targets = [...guild.channels.cache.values()].filter(ch => LOCKABLE.has(ch.type)
      && !skipIds.includes(ch.id) && !(ch.id in saved.channels));

    const state = { active: true, at: saved.at || Date.now(), reason: saved.reason || reason, channels: { ...saved.channels } };
    for (const ch of targets) {
      const old = ch.permissionOverwrites.cache.get(everyone);
      state.channels[ch.id] = old ? { allow: old.allow.bitfield.toString(), deny: old.deny.bitfield.toString() } : null;
    }
    // Saved before touching Discord, so a crash mid-way can still be undone with /protunlock
    setGuildConfig(guild.id, 'lockdown', state);

    const locked = await inBatches(targets, 8, ch => {
      const old = state.channels[ch.id];
      const allow = old ? BigInt(old.allow) & ~LOCK_BITS : 0n;
      const deny = (old ? BigInt(old.deny) : 0n) | LOCK_BITS;
      return guild.client.rest.put(Routes.channelPermission(ch.id, everyone), {
        body: { type: 0, allow: allow.toString(), deny: deny.toString() },
        reason: 'Lockdown: ' + reason,
      });
    });
    return { locked, total: targets.length };
  });
}

// Takes back only what the lock added, on top of the room's CURRENT overwrite, so changes the owner made
// while the server was locked are kept.
function unlockServer(guild, by) {
  return serial(guild.id, async () => {
    const everyone = guild.id;
    const cfg = getGuildConfig(guild.id);
    const state = cfg.lockdown;
    let opened = 0;

    if (state?.channels) {
      const entries = Object.entries(state.channels).filter(([id]) => guild.channels.cache.has(id));
      opened += await inBatches(entries, 8, ([id, old]) => {
        const now = guild.channels.cache.get(id).permissionOverwrites.cache.get(everyone);
        const oldAllow = old ? BigInt(old.allow) : 0n;
        const oldDeny = old ? BigInt(old.deny) : 0n;
        const curAllow = now ? now.allow.bitfield : 0n;
        const curDeny = now ? now.deny.bitfield : 0n;
        const deny = curDeny & ~(LOCK_BITS & ~oldDeny); // drop only the denies the lock added
        const allow = curAllow | (oldAllow & LOCK_BITS & ~deny); // give back allows the lock removed
        if (!old && !allow && !deny) {
          return guild.client.rest.delete(Routes.channelPermission(id, everyone), { reason: 'Lockdown lifted by ' + by });
        }
        return guild.client.rest.put(Routes.channelPermission(id, everyone), {
          body: { type: 0, allow: allow.toString(), deny: deny.toString() }, reason: 'Lockdown lifted by ' + by,
        });
      });
    }

    // Older Anti-Raid locks only stored the room ids
    for (const id of cfg.raid_locked_channels || []) {
      const ch = guild.channels.cache.get(id);
      if (ch && await ch.permissionOverwrites.edit(everyone, { SendMessages: null }).then(() => true, () => false)) opened++;
    }

    deleteGuildConfigKey(guild.id, 'lockdown');
    deleteGuildConfigKey(guild.id, 'raid_locked_channels');
    return opened;
  });
}

module.exports = { lockServer, unlockServer, isLocked, LOCK_BITS };
