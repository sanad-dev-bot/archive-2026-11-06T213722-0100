// Deletes up to `amount` matching messages, walking back 100 at a time (Discord's bulk limit).
// Bulk delete only works on messages younger than 14 days; older ones are counted and left alone.
const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getLogChannel } = require('./storage');

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
const MAX_SCAN = 3000;

function botCanPurge(channel) {
  const me = channel.guild.members.me;
  const perms = channel.permissionsFor?.(me);
  if (!channel.isTextBased?.() || typeof channel.bulkDelete !== 'function') return 'الروم ده مايتمسحش منه رسايل.';
  if (!perms?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages])) return 'سند محتاج **Manage Messages** و **Read Message History** في الروم ده.';
  return null;
}

// filter(message) => boolean; skip = message ids never to delete (the command message stays out of the count)
async function purge(channel, amount, filter = () => true, { skip = [], keepPinned = true } = {}) {
  const cutoff = Date.now() - FOURTEEN_DAYS + 60_000;
  let before;
  let deleted = 0;
  let scanned = 0;
  let tooOld = 0;
  while (deleted < amount && scanned < MAX_SCAN) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    scanned += batch.size;
    before = batch.last().id;
    const wanted = batch.filter(m => !skip.includes(m.id) && !(keepPinned && m.pinned) && filter(m));
    const fresh = wanted.filter(m => m.createdTimestamp > cutoff);
    tooOld += wanted.size - fresh.size;
    const pick = fresh.first(amount - deleted);
    if (pick.length) {
      const res = await channel.bulkDelete(pick, true);
      deleted += res.size;
    }
    if (batch.last().createdTimestamp <= cutoff) break; // everything further back is too old anyway
  }
  return { deleted, tooOld, scanned };
}

// Discord's audit log names Sanad for these, so the log channel says who really did it
async function logPurge(guild, channel, user, result, filters) {
  const log = await getLogChannel(guild);
  await log?.send({
    embeds: [new EmbedBuilder()
      .setTitle('🧹 مسح رسايل')
      .setDescription(['**الروم:** <#' + channel.id + '>', '**العدد:** ' + result.deleted, filters ? '**فلتر:** ' + filters : '',
        '**بواسطة:** <@' + user.id + '>'].filter(Boolean).join('\n'))
      .setColor(0x5865F2).setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

module.exports = { purge, botCanPurge, logPurge };
