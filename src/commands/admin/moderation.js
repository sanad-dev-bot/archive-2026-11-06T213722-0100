const { outranks } = require('../../utils/rank');
const { reserve } = require('../../utils/nukeGuard');
const { SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const PROTECTED = new EmbedBuilder()
  .setDescription('🛡️ وصلت لحد الحماية. الأمر اترفض والموضوع اتبعت للأونر والكو أونر.')
  .setColor(Colors.Red);
const { addModlog } = require('../../utils/storage');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

function noPerms(i, perm) {
  return reply(i, new EmbedBuilder()
    .setDescription(`🚫 تحتاج صلاحية **${perm}**.`)
    .setColor(Colors.Red), true);
}

function fmtDuration(minutes) {
  if (minutes >= 1440) return `${Math.floor(minutes/1440)}d ${minutes%1440>0?(minutes%1440)+'m':''}`.trim();
  if (minutes >= 60)   return `${Math.floor(minutes/60)}h ${minutes%60>0?(minutes%60)+'m':''}`.trim();
  return `${minutes}m`;
}

async function logAction(i, target, action, reason) {
  addModlog(i.guild.id, target.id, {
    action, reason,
    mod:   i.user.tag,
    modId: i.user.id,
    time:  new Date().toISOString(),
  });
}

module.exports = [

  // ── /ban ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('🔨 حظر عضو من السيرفر نهائياً مع تحديد السبب')
      .addUserOption(o => o.setName('member').setDescription('العضو المراد حظره').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('سبب الحظر'))
      .addIntegerOption(o => o.setName('delete_days').setDescription('حذف رسائله (0–7 أيام)').setMinValue(0).setMaxValue(7)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return noPerms(i, 'Ban Members');
      const target = i.options.getMember('member');
      const reason = i.options.getString('reason') || 'لم يُذكر سبب';
      const days   = i.options.getInteger('delete_days') ?? 0;

      if (!target)             return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود في السيرفر.').setColor(Colors.Red), true);
      if (target.id === i.user.id) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك حظر نفسك.').setColor(Colors.Red), true);
      if (!target.bannable)    return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنني حظر هذا العضو — رتبته أعلى مني.').setColor(Colors.Red), true);
      if (target.roles.highest.comparePositionTo(i.member.roles.highest) >= 0 && i.user.id !== i.guild.ownerId)
        return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك حظر عضو برتبة أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);

      if (!reserve(i.guild, i.member, 'bans')) return reply(i, PROTECTED, true);
      await target.ban({ reason, deleteMessageSeconds: days * 86400 });
      await logAction(i, { id: target.id }, 'ban', reason);

      reply(i, new EmbedBuilder()
        .setTitle('🔨 تم الحظر')
        .setColor(0xed4245)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',           value: `${target.user.tag} \`(${target.id})\``, inline: true },
          { name: '📋 السبب',           value: reason,                                   inline: true },
          { name: '🗑️ الرسائل المحذوفة', value: `${days} أيام`,                          inline: true },
          { name: '🛡️ بواسطة',          value: `<@${i.user.id}>`,                        inline: true },
        )
        .setTimestamp());
    },
  },

  // ── /unban ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('✅ فك حظر عضو عن طريق الـ ID')
      .addStringOption(o => o.setName('user_id').setDescription('الـ ID الخاص بالعضو').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('سبب فك الحظر')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return noPerms(i, 'Ban Members');
      const userId = i.options.getString('user_id').trim();
      const reason = i.options.getString('reason') || 'لم يُذكر سبب';

      if (!/^\d{17,20}$/.test(userId))
        return reply(i, new EmbedBuilder().setDescription('❌ الـ ID غير صحيح.').setColor(Colors.Red), true);

      try {
        const ban = await i.guild.bans.fetch(userId);
        await i.guild.bans.remove(userId, reason);
        await logAction(i, { id: userId }, 'unban', reason);
        reply(i, new EmbedBuilder()
          .setTitle('✅ تم فك الحظر')
          .setColor(0x57f287)
          .setThumbnail(ban.user.displayAvatarURL())
          .addFields(
            { name: '👤 العضو',          value: `${ban.user.tag} \`(${userId})\``,       inline: true },
            { name: '📋 سبب الحظر القديم', value: ban.reason || 'لم يُذكر',             inline: true },
            { name: '📋 سبب الفك',        value: reason,                                 inline: true },
            { name: '🛡️ بواسطة',          value: `<@${i.user.id}>`,                      inline: true },
          )
          .setTimestamp());
      } catch {
        reply(i, new EmbedBuilder().setDescription(`❌ لم أجد عضواً محظوراً بالـ ID \`${userId}\`.`).setColor(Colors.Red), true);
      }
    },
  },


  // ── /kick ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('👢 طرد عضو من السيرفر مع ذكر السبب')
      .addUserOption(o => o.setName('member').setDescription('العضو المراد طرده').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('سبب الطرد')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) return noPerms(i, 'Kick Members');
      const target = i.options.getMember('member');
      const reason = i.options.getString('reason') || 'لم يُذكر سبب';
      if (!target)             return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
      if (target.id === i.user.id) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك طرد نفسك.').setColor(Colors.Red), true);
      if (!target.kickable)    return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنني طرد هذا العضو.').setColor(Colors.Red), true);
      if (target.roles.highest.comparePositionTo(i.member.roles.highest) >= 0 && i.user.id !== i.guild.ownerId)
        return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك طرد عضو برتبة أعلى أو مساوية.').setColor(Colors.Red), true);
      if (!reserve(i.guild, i.member, 'kicks')) return reply(i, PROTECTED, true);
      await target.kick(reason);
      addModlog(i.guild.id, target.id, { action:'kick', reason, mod:i.user.tag, modId:i.user.id, time:new Date().toISOString() });
      reply(i, new EmbedBuilder()
        .setTitle('👢 تم الطرد')
        .setColor(0xe67e22)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',  value: `${target.user.tag} \`(${target.id})\``, inline: true },
          { name: '📋 السبب',  value: reason,                                    inline: true },
          { name: '🛡️ بواسطة', value: `<@${i.user.id}>`,                         inline: true },
        )
        .setTimestamp());
    },
  },

  // ── /mute ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('mute')
      .setDescription('🔇 إسكات عضو لمدة محددة (Timeout)')
      .addUserOption(o => o.setName('member').setDescription('العضو المراد إسكاته').setRequired(true))
      .addIntegerOption(o => o.setName('duration').setDescription('المدة بالدقائق (1–40320)').setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(o => o.setName('reason').setDescription('سبب الإسكات')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return noPerms(i, 'Moderate Members');
      const target  = i.options.getMember('member');
      const minutes = i.options.getInteger('duration');
      const reason  = i.options.getString('reason') || 'لم يُذكر سبب';

      if (!target)              return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
      if (!outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      if (!target.moderatable)  return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنني إسكات هذا العضو.').setColor(Colors.Red), true);

      if (!reserve(i.guild, i.member, 'timeouts')) return reply(i, PROTECTED, true);
      const expiresAt = Math.floor((Date.now() + minutes * 60_000) / 1000);
      await target.timeout(minutes * 60_000, reason);
      await logAction(i, { id: target.id }, 'mute', `${fmtDuration(minutes)} — ${reason}`);

      reply(i, new EmbedBuilder()
        .setTitle('🔇 تم الإسكات')
        .setColor(0x99aab5)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',    value: `${target.user.tag}`,         inline: true },
          { name: '⏱️ المدة',    value: fmtDuration(minutes),          inline: true },
          { name: '⏰ ينتهي',    value: `<t:${expiresAt}:R>`,         inline: true },
          { name: '📋 السبب',    value: reason,                        inline: true },
          { name: '🛡️ بواسطة',   value: `<@${i.user.id}>`,            inline: true },
        )
        .setTimestamp());
    },
  },

  // ── /unmute ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('🔊 فك إسكات عضو وإعادة صلاحية الكتابة له')
      .addUserOption(o => o.setName('member').setDescription('العضو المراد فك إسكاته').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('سبب فك الإسكات')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return noPerms(i, 'Moderate Members');
      const target = i.options.getMember('member');
      const reason = i.options.getString('reason') || 'لم يُذكر سبب';

      if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
      if (!target.isCommunicationDisabled())
        return reply(i, new EmbedBuilder().setDescription('❌ هذا العضو غير مسكوت حالياً.').setColor(Colors.Red), true);

      if (!outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      await target.timeout(null, reason);
      await logAction(i, { id: target.id }, 'unmute', reason);

      reply(i, new EmbedBuilder()
        .setTitle('🔊 تم فك الإسكات')
        .setColor(0x57f287)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',  value: target.user.tag,    inline: true },
          { name: '📋 السبب',  value: reason,             inline: true },
          { name: '🛡️ بواسطة', value: `<@${i.user.id}>`,  inline: true },
        )
        .setTimestamp());
    },
  },

  // ── /banlist ──────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('banlist')
      .setDescription('📋 عرض قائمة الأعضاء المحظورين في السيرفر'),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return noPerms(i, 'Ban Members');
      await i.deferReply();
      const bans = await i.guild.bans.fetch();
      if (!bans.size) return i.editReply({ embeds: [new EmbedBuilder().setDescription('✅ لا يوجد أعضاء محظورين.').setColor(Colors.Green)] });

      const list = [...bans.values()].slice(0, 25)
        .map((b, idx) => `\`${idx+1}.\` **${b.user.tag}** — ${b.reason || 'بدون سبب'}`)
        .join('\n');

      i.editReply({ embeds: [new EmbedBuilder()
        .setTitle('📋 قائمة المحظورين')
        .setDescription(list)
        .setColor(0xed4245)
        .setFooter({ text: `يعرض ${Math.min(bans.size,25)} من ${bans.size} محظور` })
        .setTimestamp()
      ]});
    },
  },
];
