const path = require('path');
const { getGuildConfig, getWarns, loadJSON, saveJSON } = require('../utils/storage');

const FILE = path.join(process.cwd(), 'data', 'statusroles.json');
const SWEEP_MS = 30_000;

// Only roles the bot added are removed, so a Muted role given by hand stays put
function track(guildId, userId, on, kind = 'mute') {
  const key = kind === 'warn' ? guildId + ':warn' : guildId;
  const data = loadJSON(FILE);
  const list = new Set(data[key] || []);
  if (on) list.add(userId); else list.delete(userId);
  data[key] = [...list];
  saveJSON(FILE, data);
}

async function syncMute(member, cfg) {
  if (!cfg.mute_role || !member.guild.roles.cache.has(cfg.mute_role)) return;
  const has = member.roles.cache.has(cfg.mute_role);
  const muted = member.isCommunicationDisabled();
  if (muted && !has) {
    await member.roles.add(cfg.mute_role, 'Timed out').then(() => track(member.guild.id, member.id, true)).catch(() => {});
  } else if (!muted && has && (loadJSON(FILE)[member.guild.id] || []).includes(member.id)) {
    await member.roles.remove(cfg.mute_role, 'Timeout ended').then(() => track(member.guild.id, member.id, false)).catch(() => {});
  }
}

async function syncWarn(member, cfg) {
  if (!cfg.warn_role || !member.guild.roles.cache.has(cfg.warn_role)) return;
  const has = member.roles.cache.has(cfg.warn_role);
  const warned = getWarns(member.guild.id, member.id).length > 0;
  const key = member.guild.id + ':warn';
  const tracked = (loadJSON(FILE)[key] || []).includes(member.id);
  if (warned) {
    if (!has) await member.roles.add(cfg.warn_role, 'Has warnings').catch(() => {});
    if (!tracked) track(member.guild.id, member.id, true, 'warn');
  } else if (has && tracked) {
    await member.roles.remove(cfg.warn_role, 'Warnings cleared').catch(() => {});
    track(member.guild.id, member.id, false, 'warn');
  }
}

module.exports = [
  {
    name: 'guildMemberUpdate',
    async execute(client, oldMember, newMember) {
      await syncMute(newMember, getGuildConfig(newMember.guild.id));
    },
  },
  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      const sweep = async () => {
        for (const [, guild] of client.guilds.cache) {
          const cfg = getGuildConfig(guild.id);
          if (!cfg.mute_role && !cfg.warn_role) continue;
          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;
            await syncMute(member, cfg);
            await syncWarn(member, cfg);
          }
        }
      };
      setInterval(() => sweep().catch(err => console.error('[STATUS ROLES]', err.message)), SWEEP_MS);
    },
  },
];
