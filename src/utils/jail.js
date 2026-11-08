// Quarantine: hides every room from ONE member (the one the protection caught) instead of locking the server.
// One role per server, denied in every channel; their review room gives them a member overwrite, which beats it.
const { ChannelType, PermissionFlagsBits: P, Routes } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('./storage');

const DENY = P.ViewChannel | P.SendMessages | P.SendMessagesInThreads | P.CreatePublicThreads
  | P.CreatePrivateThreads | P.AddReactions | P.Connect | P.Speak;

const preparing = new Map(); // guildId -> promise, so two incidents at once build the role only once

async function inBatches(items, size, fn) {
  for (let n = 0; n < items.length; n += size) await Promise.allSettled(items.slice(n, n + size).map(fn));
}

function denyIn(guild, channel, roleId) {
  const ow = channel.permissionOverwrites?.cache.get(roleId);
  if (ow && (ow.deny.bitfield & DENY) === DENY && !(ow.allow.bitfield & DENY)) return null;
  return guild.client.rest.put(Routes.channelPermission(channel.id, roleId), {
    body: { type: 0, allow: '0', deny: DENY.toString() }, reason: 'Quarantine role',
  });
}

// Creates the role the first time, then makes sure every channel hides from it (categories first, so synced
// children stay synced)
async function prepare(guild) {
  if (preparing.has(guild.id)) return preparing.get(guild.id);
  const job = (async () => {
    let role = guild.roles.cache.get(getGuildConfig(guild.id).jail_role);
    if (!role) {
      role = await guild.roles.create({ name: '🔒 Quarantine', permissions: [], reason: 'Sanad protection quarantine' });
      setGuildConfig(guild.id, 'jail_role', role.id);
    }
    const all = [...guild.channels.cache.values()].filter(c => c.permissionOverwrites);
    const cats = all.filter(c => c.type === ChannelType.GuildCategory);
    await inBatches(cats, 8, c => denyIn(guild, c, role.id));
    await inBatches(all.filter(c => c.type !== ChannelType.GuildCategory), 8, c => denyIn(guild, c, role.id));
    return role;
  })().finally(() => preparing.delete(guild.id));
  preparing.set(guild.id, job);
  return job;
}

function jailRoleId(guild) {
  const id = getGuildConfig(guild.id).jail_role;
  return id && guild.roles.cache.has(id) ? id : null;
}

// New channels hide from quarantined members too
async function onChannelCreate(channel) {
  if (!channel.guild || !channel.permissionOverwrites) return;
  const id = jailRoleId(channel.guild);
  if (id) await denyIn(channel.guild, channel, id)?.catch(err => console.error('[QUARANTINE] new channel:', err.message));
}

module.exports = { prepare, jailRoleId, onChannelCreate, DENY };
