const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getGuildConfig, getXP } = require('./storage');
const { XP_PER_LEVEL } = require('./rankCard');
const { isStripped } = require('./incidentSystem');

// A level role must never carry staff power, or farming XP would become a way to get it
const DANGER = P.Administrator | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.BanMembers | P.KickMembers
  | P.ModerateMembers | P.ManageMessages | P.ManageWebhooks | P.MentionEveryone;

// Earned level roles stack: reaching a new level adds its role and keeps every lower one.
// Tiers above the current level (after a reset or /setxp) are taken back.
async function syncLevelRole(member) {
  const cfg = getGuildConfig(member.guild.id);
  const tiers = (cfg.level_roles || []).filter(t => {
    const role = member.guild.roles.cache.get(t.id);
    return role && role.editable && !(role.permissions.bitfield & DANGER);
  });
  if (!tiers.length || member.user.bot || member.roles.cache.has(cfg.verify_role)) return null;
  if (isStripped(member.guild.id, member.id)) return null;

  const level = Math.floor(getXP(member.guild.id, member.id).xp / XP_PER_LEVEL) + 1;
  const earned = tiers.filter(t => level >= t.level).sort((a, b) => b.level - a.level);
  const above = tiers.filter(t => level < t.level && member.roles.cache.has(t.id)).map(t => t.id);
  if (above.length) await member.roles.remove(above, 'Level went down');

  const missing = earned.filter(t => !member.roles.cache.has(t.id));
  if (!missing.length) return null;
  await member.roles.add(missing.map(t => t.id), 'Reached level ' + earned[0].level);
  return missing[0].id; // the highest one that was just unlocked
}

async function rewardLevel(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const roleId = await syncLevelRole(member);
  const roomId = getGuildConfig(guild.id).levelup_room;
  if (!roleId || !roomId) return;
  const room = await guild.channels.fetch(roomId).catch(() => null);
  await room?.send({
    embeds: [new EmbedBuilder().setDescription('🏅 <@' + userId + '> فتح رتبة <@&' + roleId + '>!').setColor(0xFFD166)],
    allowedMentions: { users: [userId], roles: [] },
  }).catch(() => {});
}

module.exports = { syncLevelRole, rewardLevel };
