const { outranks } = require('../utils/rank');
const { reserve, isFrozen } = require('../utils/nukeGuard');
const { purge, botCanPurge, logPurge } = require('../utils/purge');

const PROTECTED = '🛡️ وصلت لحد الحماية. الأمر اترفض والموضوع اتبعت للأونر والكو أونر.';
const {
  PermissionFlagsBits,
} = require('discord.js');
const { getShortcuts, addModlog, addWarn, getXP, getRankPosition, checkCmdRole, getGuildConfig, setGuildConfig } = require('../utils/storage');
const { isTrusted } = require('../utils/trust');
const { AttachmentBuilder } = require('discord.js');
const { createRankCard } = require('../utils/rankCard');
const { createProfileCard } = require('../utils/profileCard');
const { setStayVoice } = require('../utils/voiceStay');
const { buildTopComponents, buildTopRows, isTopTypeId, isTopPeriodId } = require('../utils/top');
const { ComponentType } = require('discord.js');

function parseUser(message, token) {
  const mention = message.mentions.members.first();
  if (mention) return mention;
  const id = String(token || '').replace(/[<@!>]/g, '');
  if (/^\d{17,20}$/.test(id)) return message.guild.members.cache.get(id) || null;
  return null;
}


function reasonAfterFirst(args) {
  const copy = [...args];
  if (copy[0] && /^<@!?\d{17,20}>$/.test(copy[0])) copy.shift();
  else if (copy[0] && /^\d{17,20}$/.test(copy[0])) copy.shift();
  return copy.join(' ').trim() || 'لم يُذكر سبب';
}

// Replies echo what the member typed, so they may ping users but never roles or @everyone
async function sendMessage(message, content) {
  return message.channel.send({ content, allowedMentions: { parse: ['users'] } });
}

async function sendRank(message, token) {
  const target = parseUser(message, token) || message.member;
  if (!target) return sendMessage(message, 'لم أجد العضو.');

  const xp = getXP(message.guild.id, target.id);
  const position = getRankPosition(message.guild.id, target.id);
  const buffer = await createRankCard({
    member: target,
    textXp: xp.textXp || 0,
    voiceXp: xp.voiceXp || 0,
    position,
  });

  return message.channel.send({
    files: [new AttachmentBuilder(buffer, { name: 'rank.png' })],
  });
}

async function sendTop(message) {
  let type = 'all';
  let period = 'all';
  const suffix = `:${message.author.id}:${message.id}`;
  const sent = await message.channel.send({
    flags: require('discord.js').MessageFlags.IsComponentsV2,
    components: await buildTopComponents(message.guild, message.author, type, period, suffix),
  });

  const collector = message.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 180_000,
    filter: s => s.user.id === message.author.id && (isTopTypeId(s.customId) || isTopPeriodId(s.customId)) && s.customId.endsWith(suffix),
  });
  collector.on('collect', async s => {
    if (isTopTypeId(s.customId)) type = s.values[0];
    if (isTopPeriodId(s.customId)) period = s.values[0];
    await s.update({
      flags: require('discord.js').MessageFlags.IsComponentsV2,
      components: await buildTopComponents(message.guild, message.author, type, period, suffix),
    });
  });
  collector.on('end', () => sent.edit({ components: [] }).catch(() => {}));
  return sent;
}

async function sendProfile(message, userArg) {
  const target = message.mentions.members.first() || (userArg ? await message.guild.members.fetch(userArg.replace(/[<@!>]/g, '')).catch(() => null) : message.member);
  if (!target) return sendMessage(message, 'لم أجد العضو.');
  const xp = getXP(message.guild.id, target.id);
  const position = getRankPosition(message.guild.id, target.id);
  const buffer = await createProfileCard({ member: target, xp, position });
  return message.channel.send({ files: [{ attachment: buffer, name: 'profile.png' }] });
}

async function runShortcut(message, command, args) {
  const member = message.member;
  const target = parseUser(message, args[0]);

  if (isFrozen(message.guild.id, member.id)) return sendMessage(message, '🛡️ الحماية وقفت أوامرك لحد ما الأونر أو الكو أونر يراجع.');
  // A shortcut must obey the same /cmdrole limits as the slash command it stands for
  const roleCheck = checkCmdRole(message.guild.id, member, command);
  if (!roleCheck.allowed) return sendMessage(message, '🔐 الأمر ده محتاج رتبة: ' + roleCheck.reason);

  switch (command) {
    case 'slowmode': {
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return sendMessage(message, 'تحتاج صلاحية **Manage Channels**.');
      const seconds = Number(args[0]);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return sendMessage(message, 'اكتب مدة السلو مود بالثواني من 0 إلى 21600.');
      if (!message.channel.isTextBased?.() || typeof message.channel.setRateLimitPerUser !== 'function') return sendMessage(message, 'لا يمكن تفعيل السلو مود في هذه القناة.');
      await message.channel.setRateLimitPerUser(seconds);
      return sendMessage(message, seconds > 0
        ? `تم تفعيل السلو مود لمدة ${seconds} ثانية في <#${message.channel.id}> بواسطة <@${message.author.id}>.`
        : `تم إيقاف السلو مود في <#${message.channel.id}> بواسطة <@${message.author.id}>.`);
    }

    case 'lock':
    case 'unlock':
    case 'hide':
    case 'unhide': {
      // Same rules as the slash commands: Manage Channels + Manage Permissions in this room, counted by the protection,
      // and only rooms hidden with hide can be shown again (unless the owner or co-owner does it)
      const perms = message.channel.permissionsFor(member);
      if (!isTrusted(member) && !perms?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
        return sendMessage(message, 'تحتاج صلاحية **Manage Channels** و **Manage Permissions** في الروم ده.');
      }
      const hidden = getGuildConfig(message.guild.id).hidden_channels || [];
      if (command === 'unhide' && !hidden.includes(message.channel.id) && !isTrusted(member)) {
        return sendMessage(message, 'الروم ده مخفي من الأول، الأونر والكو أونر بس يقدروا يظهروه.');
      }
      if (!reserve(message.guild, member, 'overwrites')) return sendMessage(message, PROTECTED);
      const change = { lock: { SendMessages: false }, unlock: { SendMessages: null }, hide: { ViewChannel: false }, unhide: { ViewChannel: null } }[command];
      await message.channel.permissionOverwrites.edit(message.guild.id, change);
      if (command === 'hide' && !hidden.includes(message.channel.id)) setGuildConfig(message.guild.id, 'hidden_channels', [...hidden, message.channel.id]);
      if (command === 'unhide') setGuildConfig(message.guild.id, 'hidden_channels', hidden.filter(id => id !== message.channel.id));
      const done = { lock: 'تم إقفال', unlock: 'تم فتح', hide: 'تم إخفاء', unhide: 'تم إظهار' }[command];
      return sendMessage(message, `${done} <#${message.channel.id}> بواسطة <@${message.author.id}>.`);
    }

    case 'ban':
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return sendMessage(message, 'تحتاج صلاحية **Ban Members**.');
      if (!target) return sendMessage(message, 'اكتب الاختصار ثم منشن العضو، مثال: `باند @العضو السبب`.');
      if (target.id === message.author.id) return sendMessage(message, 'لا يمكنك حظر نفسك.');
      if (!outranks(member, target)) return sendMessage(message, 'لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.');
      if (!target.bannable) return sendMessage(message, 'لا يمكنني حظر هذا العضو.');
      const banReason = reasonAfterFirst(args);
      if (!reserve(message.guild, member, 'bans')) return sendMessage(message, PROTECTED);
      await target.ban({ reason: banReason });
      addModlog(message.guild.id, target.id, { action: 'ban', reason: banReason, mod: message.author.tag, modId: message.author.id, time: new Date().toISOString() });
      return sendMessage(message, `تم الحظر\nالعضو: <@${target.id}>\nالسبب: ${banReason}\nبواسطة: <@${message.author.id}>`);

    case 'kick':
      if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return sendMessage(message, 'تحتاج صلاحية **Kick Members**.');
      if (!target) return sendMessage(message, 'اكتب الاختصار ثم منشن العضو والسبب.');
      if (!outranks(member, target)) return sendMessage(message, 'لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.');
      if (!target.kickable) return sendMessage(message, 'لا يمكنني طرد هذا العضو.');
      const kickReason = reasonAfterFirst(args);
      if (!reserve(message.guild, member, 'kicks')) return sendMessage(message, PROTECTED);
      await target.kick(kickReason);
      addModlog(message.guild.id, target.id, { action: 'kick', reason: kickReason, mod: message.author.tag, modId: message.author.id, time: new Date().toISOString() });
      return sendMessage(message, `تم الطرد\nالعضو: <@${target.id}>\nالسبب: ${kickReason}\nبواسطة: <@${message.author.id}>`);

    case 'mute': {
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return sendMessage(message, 'تحتاج صلاحية **Moderate Members**.');
      if (!target) return sendMessage(message, 'اكتب: الاختصار @العضو المدة_بالدقائق السبب');
      const minutes = Number(args[1]);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) return sendMessage(message, 'المدة بالدقائق من 1 إلى 40320.');
      if (!outranks(member, target)) return sendMessage(message, 'لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.');
      if (!target.moderatable) return sendMessage(message, 'لا يمكنني إسكات هذا العضو.');
      const muteReason = args.slice(2).join(' ').trim() || 'لم يُذكر سبب';
      if (!reserve(message.guild, member, 'timeouts')) return sendMessage(message, PROTECTED);
      await target.timeout(minutes * 60000, muteReason);
      addModlog(message.guild.id, target.id, { action: 'mute', reason: `${minutes}m — ${muteReason}`, mod: message.author.tag, modId: message.author.id, time: new Date().toISOString() });
      return sendMessage(message, `تم الإسكات\nالعضو: <@${target.id}>\nالمدة: ${minutes} دقيقة\nالسبب: ${muteReason}\nبواسطة: <@${message.author.id}>`);
    }

    case 'unmute':
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return sendMessage(message, 'تحتاج صلاحية **Moderate Members**.');
      if (!target) return sendMessage(message, 'اكتب الاختصار ثم منشن العضو.');
      if (!outranks(member, target)) return sendMessage(message, 'لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.');
      await target.timeout(null, 'Shortcut unmute');
      return sendMessage(message, `تم فك الإسكات عن <@${target.id}> بواسطة <@${message.author.id}>.`);

    case 'warn':
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return sendMessage(message, 'تحتاج صلاحية **Administrator**.');
      if (!target) return sendMessage(message, 'اكتب الاختصار ثم منشن العضو والسبب.');
      if (target.user.bot || target.id === message.author.id) return sendMessage(message, 'لا يمكن تحذير هذا العضو.');
      if (!outranks(member, target)) return sendMessage(message, 'لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.');
      const warnReason = reasonAfterFirst(args);
      const count = addWarn(message.guild.id, target.id, { reason: warnReason, mod: message.author.tag, modId: message.author.id, time: new Date().toISOString() });
      addModlog(message.guild.id, target.id, { action: 'warn', reason: warnReason, mod: message.author.tag, modId: message.author.id, time: new Date().toISOString() });
      if (count === 3 && target.moderatable) await target.timeout(3600000, 'Auto-mute: 3 تحذيرات').catch(() => {});
      if (count >= 5 && target.bannable && reserve(message.guild, member, 'bans')) await target.ban({ reason: 'Auto-ban: 5 تحذيرات' }).catch(() => {});
      return sendMessage(message, `تم التحذير\nالعضو: <@${target.id}>\nالسبب: ${warnReason}\nعدد التحذيرات: ${count}\nبواسطة: <@${message.author.id}>`);

    case 'clear': {
      if (!isTrusted(member)) return sendMessage(message, '🚫 الأمر ده للأونر والكو أونر بس عشان حماية السيرفر.');
      const amount = Number(args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 500) return sendMessage(message, 'اكتب عدد الرسائل من 1 إلى 500، مثال: مسح 20.');
      const problem = botCanPurge(message.channel);
      if (problem) return sendMessage(message, problem);
      // The command message goes too, but does not count toward the number asked for
      await message.delete().catch(() => {});
      const result = await purge(message.channel, amount, () => true, { skip: [message.id] });
      await logPurge(message.guild, message.channel, message.author, result, '');
      const note = await sendMessage(message, `تم حذف ${result.deleted} رسالة بواسطة <@${message.author.id}>.`
        + (result.tooOld ? `\n⚠️ ${result.tooOld} رسالة أقدم من 14 يوم ماينفعش تتمسح مرة واحدة.` : ''));
      setTimeout(() => note.delete().catch(() => {}), 5000);
      return note;
    }

    case 'rank':
      await sendRank(message, args[0]);
      return;

    case 'profile':
      await sendProfile(message, args[0]);
      return;

    case 'top':
      await sendTop(message);
      return;

    default:
      // Only commands with an explicit safe message-command adapter are executed.
      return sendMessage(message, `الأمر /${command} موجود، لكن لا توجد له صيغة اختصار نصية مفعّلة حالياً.`);
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (!message.guild || message.author.bot) return;
    const content = message.content.trim();
    if (!content) return;

    const shortcuts = getShortcuts(message.guild.id);
    const parts = content.split(/\s+/);
    const alias = parts[0];
    // Fixed voice-stay shortcut: "بوت". Admin only.
    if (alias === 'بوت') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await sendMessage(message, 'تحتاج صلاحية **Administrator**.').catch(() => {});
        return;
      }
      const mentionedChannel = message.mentions.channels.first();
      const voiceChannel = mentionedChannel?.isVoiceBased?.() ? mentionedChannel : message.member.voice?.channel;
      if (!voiceChannel) {
        await sendMessage(message, 'استخدم `بوت` وأنت داخل روم صوتي، أو منشن الروم الصوتي.').catch(() => {});
        return;
      }
      try {
        await setStayVoice(message.guild, voiceChannel.id);
        await sendMessage(message, `تم تثبيت البوت في <#${voiceChannel.id}>.`);
      } catch (err) {
        await sendMessage(message, `تعذر تثبيت البوت: ${err.message || 'تحقق من صلاحيات البوت.'}`).catch(() => {});
      }
      return;
    }
    // Fixed public rank shortcuts: anyone can use them without admin setup.
    if (['رانك', 'رنك', 'rank'].includes(alias.toLowerCase())) {
      try {
        await sendRank(message, parts[1]);
      } catch (err) {
        console.error('[RANK SHORTCUT ERROR]', err);
        await sendMessage(message, 'حدث خطأ أثناء عرض الرانك.').catch(() => {});
      }
      return;
    }
    // Fixed public top shortcut: anyone can use it.
    if (['توب', 'توبس', 'top'].includes(alias.toLowerCase())) {
      try {
        await sendTop(message);
      } catch (err) {
        console.error('[TOP SHORTCUT ERROR]', err);
        await sendMessage(message, 'حدث خطأ أثناء عرض التوب.').catch(() => {});
      }
      return;
    }
    // Fixed public profile shortcuts: anyone can use them.
    if (['بروفايل', 'بروف', 'profile'].includes(alias.toLowerCase())) {
      try {
        await sendProfile(message, parts[1]);
      } catch (err) {
        console.error('[PROFILE SHORTCUT ERROR]', err);
        await sendMessage(message, 'حدث خطأ أثناء عرض البروفايل.').catch(() => {});
      }
      return;
    }
    const command = Object.hasOwn(shortcuts, alias) ? shortcuts[alias] : null;
    if (typeof command !== 'string') return;
    try {
      await runShortcut(message, command, parts.slice(1));
    } catch (err) {
      console.error('[SHORTCUT ERROR]', err);
      await sendMessage(message, 'حدث خطأ أثناء تنفيذ الأمر. تأكد من صلاحيات البوت والعضو.').catch(() => {});
    }
  },
};
