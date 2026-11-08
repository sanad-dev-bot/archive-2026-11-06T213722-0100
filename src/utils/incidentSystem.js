const path = require('path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits: P,
} = require('discord.js');
const { getGuildConfig, getLogChannel, loadJSON, saveJSON } = require('./storage');
const { isTrusted, coOwnerIds } = require('./trust');
const { lockServer, unlockServer, isLocked } = require('./lockdown');
const jail = require('./jail');

const FILE = path.join(process.cwd(), 'data', 'incidents.json');
const RED = 0xED4245;
const GREEN = 0x57F287;

// Permissions a quarantined bot loses from its own (managed) role
const BOT_DANGER = P.Administrator | P.BanMembers | P.KickMembers | P.ManageGuild | P.ManageRoles
  | P.ManageChannels | P.ManageWebhooks | P.ManageMessages | P.ModerateMembers | P.ManageGuildExpressions
  | P.MentionEveryone | P.ManageNicknames;

const getRecord = (guildId, userId) => loadJSON(FILE)[guildId]?.[userId] || null;

function saveRecord(guildId, userId, record) {
  const data = loadJSON(FILE);
  data[guildId] = { ...data[guildId], [userId]: record };
  saveJSON(FILE, data);
}

// Stays true after a close without restore, so automatic systems cannot hand roles back
function isStripped(guildId, userId) {
  const record = getRecord(guildId, userId);
  return Boolean(record) && !['restored'].includes(record.status);
}

function buttons(guild, userId, record) {
  const open = record?.status === 'open';
  const rows = [];
  if (open) {
    const decide = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('incident_restore:' + userId).setLabel('رجّع الرتب').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('incident_close:' + userId).setLabel('ماترجعش الرتب').setEmoji('❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('incident_ban:' + userId).setLabel('احظره').setEmoji('🔨').setStyle(ButtonStyle.Danger),
    );
    if (record.kind !== 'bot' && !record.talking) {
      decide.addComponents(new ButtonBuilder().setCustomId('incident_talk:' + userId).setLabel('عايز أتكلم').setEmoji('💬').setStyle(ButtonStyle.Primary));
    }
    rows.push(decide);
  }
  const manage = new ActionRowBuilder();
  if (open && record.kind !== 'bot' && record.talking) {
    manage.addComponents(new ButtonBuilder().setCustomId('incident_endchat:' + userId).setLabel('اقفل المحادثة').setEmoji('🔇').setStyle(ButtonStyle.Secondary));
  }
  manage.addComponents(isLocked(guild.id)
    ? new ButtonBuilder().setCustomId('incident_unlock:' + userId).setLabel('افتح كل الرومات').setEmoji('🔓').setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId('incident_lockall:' + userId).setLabel('اقفل السيرفر كله').setEmoji('🔒').setStyle(ButtonStyle.Secondary));
  manage.addComponents(new ButtonBuilder().setCustomId('incident_delete:' + userId).setLabel('امسح التكت').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
  rows.push(manage);
  return rows;
}

function roomEmbed(member, reason, summary) {
  const isBot = member.user.bot;
  return new EmbedBuilder()
    .setTitle(isBot ? '🚨 بوت عمل حركة خطيرة' : '🚨 مراجعة حماية السيرفر')
    .setDescription([
      (isBot ? '**البوت:** ' : '**العضو:** ') + '<@' + member.id + '>',
      '**السبب:** ' + reason,
      ...summary,
      '',
      isBot ? '' : '<@' + member.id + '> اضغط **عايز أتكلم** عشان تقدر تكتب وتشرح اللي حصل.',
      '🙈 كل رومات السيرفر اتخفت عنه، والباقي شغال عادي.',
      'القرار (رجوع الرتب، الحظر، قفل المحادثة، مسح التكت) للأونر والكو أونر بس.',
    ].filter(Boolean).join('\n'))
    .setColor(RED)
    .setTimestamp();
}

async function createRoom(guild, member, parent) {
  const isBot = member.user.bot;
  const base = (isBot ? 'incident-bot-' : 'incident-') + member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18);
  const cfg = getGuildConfig(guild.id);
  const deciders = coOwnerIds(guild).filter(id => guild.members.cache.has(id));
  return guild.channels.create({
    name: /-$/.test(base) ? base + member.id : base,
    type: ChannelType.GuildText,
    parent,
    topic: 'مراجعة حماية | ' + member.id,
    permissionOverwrites: [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ManageChannels, P.ReadMessageHistory] },
      ...(isBot ? [] : [{ id: member.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AttachFiles, P.AddReactions] }]),
      ...deciders.map(id => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
      ...(cfg.incident_view_roles || []).filter(id => guild.roles.cache.has(id)).map(id => ({
        id,
        allow: [P.ViewChannel, P.ReadMessageHistory],
        deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads],
      })),
    ],
  });
}

// The review room. If the ticket category is full or gone it opens without a category; if even that fails,
// the decision buttons go to the log channel so the owner is never left without them.
async function openRoom(guild, member, reason, summary) {
  const cfg = getGuildConfig(guild.id);
  const channel = await createRoom(guild, member, cfg.ticket_category).catch(() => createRoom(guild, member, null)).catch(err => {
    console.error('[PROTECTION] Could not open incident room:', err.message);
    return null;
  });
  const pingRoles = (cfg.incident_ping_roles || cfg.apply_ping_roles || []).filter(id => guild.roles.cache.has(id));
  const target = channel || await getLogChannel(guild);
  if (!target) return null;
  const record = getRecord(guild.id, member.id);
  await target.send({
    content: [channel && !member.user.bot ? '<@' + member.id + '>' : '', ...pingRoles.map(id => '<@&' + id + '>')].join(' ').trim() || undefined,
    allowedMentions: { users: channel && !member.user.bot ? [member.id] : [], roles: pingRoles },
    embeds: [roomEmbed(member, reason, summary)],
    components: buttons(guild, member.id, record),
  }).catch(err => console.error('[PROTECTION] room message:', err.message));
  return channel;
}

async function logIncident(guild, title, text) {
  const log = await getLogChannel(guild);
  await log?.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(text).setColor(RED).setTimestamp()] }).catch(() => {});
}

async function notifyOwner(guild, text, channel) {
  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send({
    content: '🚨 **' + guild.name + '**: ' + text,
    components: channel ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('افتح روم المراجعة').setURL(channel.url),
    )] : [],
  }).catch(() => {});
}

// Takes every role, hides every room from them (quarantine role), and for a bot also strips the dangerous
// permissions of its own role. Then opens a review room only the owner and co-owner decide in.
async function stripMember(guild, member, reason) {
  const before = getRecord(guild.id, member.id);
  const jailId = await jail.prepare(guild).then(r => r.id).catch(err => {
    console.error('[PROTECTION] quarantine role:', err.message);
    return null;
  });
  const kept = member.roles.cache.filter(r => r.id !== guild.id && r.managed);
  const removed = member.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.id !== jailId);

  // Still under review and caught again (roles given back by hand, or a restart mid-way): strip again
  const reopening = before?.status === 'open';
  const record = reopening
    ? { ...before, roles: [...new Set([...(before.roles || []), ...removed.keys()])] }
    : { status: 'open', kind: member.user.bot ? 'bot' : 'member', roles: [...removed.keys()], reason, at: Date.now() };

  // Saved first, so the level and verify systems cannot give a role back mid-way
  saveRecord(guild.id, member.id, record);
  const summary = [];
  try {
    await member.roles.set([...kept.keys(), ...(jailId ? [jailId] : [])], 'Server protection: ' + reason);
    summary.push('**الرتب اللي اتشالت:** ' + removed.size);
    if (jailId) summary.push('🙈 **اتحجز:** مش شايف أي روم غير روم المراجعة.');
  } catch (err) {
    record.stripFailed = true;
    summary.push('⚠️ **ماقدرتش أشيل رتبه** (رتبته أعلى من رتبة سند). شيلها بإيدك فوراً.');
    console.error('[PROTECTION] strip failed:', err.message);
  }

  if (member.user.bot) {
    record.botPerms = record.botPerms || {};
    for (const role of kept.values()) {
      if (!role.editable || !(role.permissions.bitfield & BOT_DANGER)) continue;
      const bits = role.permissions.bitfield;
      const ok = await role.setPermissions(bits & ~BOT_DANGER, 'Server protection: ' + reason).then(() => true, () => false);
      if (ok && !record.botPerms[role.id]) record.botPerms[role.id] = bits.toString();
    }
    summary.push(Object.keys(record.botPerms).length ? '**اتشالت الصلاحيات الخطيرة من رتبة البوت.**' : '⚠️ رتبة البوت أعلى من سند، شيل صلاحياتها بإيدك.');
  }
  saveRecord(guild.id, member.id, record);

  // A room that still exists keeps being used; a lost one is opened again
  let channel = reopening && record.channel ? guild.channels.cache.get(record.channel) : null;
  if (!channel) {
    channel = await openRoom(guild, member, reason, summary);
    saveRecord(guild.id, member.id, { ...getRecord(guild.id, member.id), channel: channel?.id || null });
  } else {
    await channel.send({ embeds: [new EmbedBuilder().setDescription('🚨 اتمسك تاني: ' + reason + '\n' + summary.join('\n')).setColor(RED)] }).catch(() => {});
  }

  if (!member.user.bot && !reopening) {
    await member.user.send({
      embeds: [new EmbedBuilder()
        .setTitle('🚨 رتبك في السيرفر اتشالت')
        .setDescription(['**السبب:** ' + reason, '', 'حماية السيرفر شالت كل رتبك لحد ما الموضوع يتراجع.',
          'افتح روم المراجعة من الزرار تحت، واضغط **عايز أتكلم** عشان تقدر تكتب.'].join('\n'))
        .setColor(RED)],
      components: channel ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('افتح روم المراجعة').setURL(channel.url),
      )] : [],
    }).catch(() => {});
  }

  await logIncident(guild, '🚨 الحماية اشتغلت', [
    (member.user.bot ? '**البوت:** ' : '**العضو:** ') + '<@' + member.id + '>',
    '**السبب:** ' + reason,
    ...summary,
    channel ? '**روم المراجعة:** <#' + channel.id + '>' : '⚠️ روم المراجعة ماتفتحش، الزراير اتبعتت هنا في اللوق.',
  ].join('\n'));
  if (!reopening) {
    await notifyOwner(guild, (member.user.bot ? 'بوت ' : 'عضو ') + member.user.tag + ' عمل حركة خطيرة (' + reason + ') واتحجز.', channel);
  }
  return true;
}

// Someone under review who leaves and comes back is quarantined again
async function rejail(member) {
  if (getRecord(member.guild.id, member.id)?.status !== 'open') return false;
  const id = jail.jailRoleId(member.guild);
  if (id) await member.roles.add(id, 'Still under protection review').catch(() => {});
  return true;
}

async function refreshButtons(i, userId) {
  const record = getRecord(i.guild.id, userId);
  await i.message.edit({ components: buttons(i.guild, userId, record) }).catch(() => {});
}

async function decide(i, action, userId) {
  const record = getRecord(i.guild.id, userId);
  if (record?.status !== 'open') return i.reply({ content: 'ℹ️ المراجعة دي اتحسمت قبل كده.', ephemeral: true });
  await i.deferUpdate();

  const member = await i.guild.members.fetch(userId).catch(() => null);
  const jailId = jail.jailRoleId(i.guild);
  let result;
  if (action === 'ban') {
    await i.guild.bans.create(userId, { reason: 'Banned after protection review by ' + i.user.tag });
    result = '🔨 اتحظر بواسطة <@' + i.user.id + '>';
  } else {
    let restored = 0;
    if (member && jailId) await member.roles.remove(jailId, 'Protection review closed').catch(() => {});
    if (action === 'restore' && member) {
      const roles = (record.roles || []).filter(id => i.guild.roles.cache.get(id)?.editable);
      if (roles.length) await member.roles.add(roles, 'Roles restored after review by ' + i.user.tag);
      restored = roles.length;
      for (const [roleId, bits] of Object.entries(record.botPerms || {})) {
        const role = i.guild.roles.cache.get(roleId);
        if (role?.editable) await role.setPermissions(BigInt(bits), 'Restored after review').catch(() => {});
      }
    }
    result = action === 'restore'
      ? '✅ رجعت ' + restored + ' رتبة بواسطة <@' + i.user.id + '>'
      : '🔒 اتقفلت من غير رجوع الرتب بواسطة <@' + i.user.id + '>';
  }
  const status = { restore: 'restored', close: 'closed', ban: 'banned' }[action];
  saveRecord(i.guild.id, userId, { ...record, status, by: i.user.id, closedAt: Date.now() });
  // Loaded here, not at the top: nukeGuard itself loads this file
  if (action === 'restore') require('./nukeGuard').unfreeze(i.guild.id, userId);

  await i.message.edit({
    embeds: [EmbedBuilder.from(i.message.embeds[0]).addFields({ name: 'القرار', value: result }).setColor(action === 'restore' ? GREEN : RED)],
    components: buttons(i.guild, userId, getRecord(i.guild.id, userId)),
  });
  if (record.kind !== 'bot' && i.channel?.permissionOverwrites) {
    await i.channel.permissionOverwrites.edit(userId, { SendMessages: false, AttachFiles: false }).catch(() => {});
  }
  if (record.kind !== 'bot' && action !== 'ban') {
    await member?.send({ content: action === 'restore' ? '✅ المراجعة خلصت ورتبك رجعتلك.' : '🔒 المراجعة خلصت، ورتبك مارجعتش.' }).catch(() => {});
  }
  const titles = { restore: '✅ رتب اترجعت بعد المراجعة', close: '🔒 مراجعة اتقفلت من غير رجوع الرتب', ban: '🔨 اتحظر بعد المراجعة' };
  await logIncident(i.guild, titles[action], '**العضو:** <@' + userId + '>\n**بواسطة:** <@' + i.user.id + '>');
  return null;
}

async function allowTalking(i, userId) {
  if (i.user.id !== userId) return i.reply({ content: '🚫 الزرار ده لصاحب المراجعة بس.', ephemeral: true });
  const record = getRecord(i.guild.id, userId);
  if (record?.status !== 'open') return i.reply({ content: 'ℹ️ المراجعة دي اتحسمت قبل كده.', ephemeral: true });
  if (record.chatClosed) return i.reply({ content: '🔇 الأونر أو الكو أونر قفلوا المحادثة.', ephemeral: true });
  await i.channel.permissionOverwrites.edit(userId, { SendMessages: true, AttachFiles: true });
  saveRecord(i.guild.id, userId, { ...record, talking: true });
  return i.update({ components: buttons(i.guild, userId, getRecord(i.guild.id, userId)) });
}

async function endChat(i, userId) {
  const record = getRecord(i.guild.id, userId);
  await i.channel.permissionOverwrites.edit(userId, { SendMessages: false, AttachFiles: false }).catch(() => {});
  saveRecord(i.guild.id, userId, { ...record, talking: false, chatClosed: true });
  await i.update({ components: buttons(i.guild, userId, getRecord(i.guild.id, userId)) });
  return i.followUp({ content: '🔇 <@' + i.user.id + '> قفل المحادثة. القرار لسه مستني.', allowedMentions: { parse: [] } });
}

async function lockAll(i, userId) {
  await i.deferReply();
  const res = await lockServer(i.guild, 'Locked by ' + i.user.tag + ' from a review room', [i.channel.id]);
  await refreshButtons(i, userId);
  await logIncident(i.guild, '🔒 السيرفر اتقفل', '**بواسطة:** <@' + i.user.id + '>\n**عدد الرومات:** ' + res.locked);
  return i.editReply({ content: '🔒 <@' + i.user.id + '> قفل ' + res.locked + ' روم.', allowedMentions: { parse: [] } });
}

async function unlockAll(i, userId) {
  if (!isLocked(i.guild.id)) {
    await refreshButtons(i, userId);
    return i.reply({ content: 'ℹ️ الرومات مفتوحة بالفعل.', ephemeral: true });
  }
  await i.deferReply();
  const opened = await unlockServer(i.guild, i.user.tag);
  await refreshButtons(i, userId);
  await logIncident(i.guild, '🔓 الرومات اتفتحت', '**بواسطة:** <@' + i.user.id + '>\n**عدد الرومات:** ' + opened);
  return i.editReply({ content: '🔓 <@' + i.user.id + '> فتح ' + opened + ' روم ورجّعها زي ما كانت.', allowedMentions: { parse: [] } });
}

function askDelete(i, userId) {
  return i.reply({
    content: '🗑️ متأكد إنك عايز تمسح روم المراجعة؟' + (getRecord(i.guild.id, userId)?.status === 'open' ? ' لسه مفيش قرار، فهيفضل محجوز من غير رتب.' : ''),
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('incident_delyes:' + userId).setLabel('أيوه امسح').setStyle(ButtonStyle.Danger),
    )],
    ephemeral: true,
  });
}

async function deleteRoom(i, userId) {
  const record = getRecord(i.guild.id, userId);
  const ownRoom = record ? record.channel === i.channel.id : /^incident-/.test(i.channel.name);
  if (!ownRoom) return i.update({ content: '❌ الزرار ده مش بتاع الروم ده.', components: [] });
  await i.update({ content: '🗑️ الروم هيتمسح خلال 3 ثواني.', components: [] });
  await logIncident(i.guild, '🗑️ روم مراجعة اتمسح', '**العضو:** <@' + userId + '>\n**بواسطة:** <@' + i.user.id + '>'
    + (record?.status === 'open' ? '\n⚠️ مفيش قرار لسه: لسه محجوز من غير رتب.' : ''));
  const channel = i.channel;
  setTimeout(() => channel.delete('Incident room deleted by ' + i.user.tag).catch(err => console.error('[PROTECTION] delete room:', err.message)), 3000);
  return null;
}

async function handleIncidentInteraction(i) {
  if (!i.inCachedGuild() || !i.isButton()) return false;
  const match = i.customId.match(/^incident_(restore|close|ban|talk|endchat|lockall|unlock|delete|delyes):(\d+)$/);
  if (!match) return false;
  const [, action, userId] = match;
  try {
    if (action === 'talk') await allowTalking(i, userId);
    else if (!isTrusted(i.member)) await i.reply({ content: '🚫 القرار ده للأونر والكو أونر بس.', ephemeral: true });
    else if (action === 'endchat') await endChat(i, userId);
    else if (action === 'lockall') await lockAll(i, userId);
    else if (action === 'unlock') await unlockAll(i, userId);
    else if (action === 'delete') await askDelete(i, userId);
    else if (action === 'delyes') await deleteRoom(i, userId);
    else await decide(i, action, userId);
  } catch (err) {
    console.error('[PROTECTION ERROR]', err);
    const payload = { content: '❌ القرار ماكملش، جرب تاني.', ephemeral: true };
    if (i.replied || i.deferred) await i.followUp(payload).catch(() => {});
    else await i.reply(payload).catch(() => {});
  }
  return true;
}

module.exports = { isStripped, stripMember, rejail, handleIncidentInteraction };
