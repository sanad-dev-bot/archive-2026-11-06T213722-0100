const { SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getWarns, addWarn, clearWarns, removeWarn, addModlog, getModlogs, clearModlogs } = require('../../utils/storage');
const { outranks } = require('../../utils/rank');
const { reserve } = require('../../utils/nukeGuard');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

module.exports = [

  // ── /warn ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('⚠️ نظام التحذيرات — إضافة، عرض، مسح، حذف')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('⚠️ إعطاء تحذير لعضو (3=ميوت، 5=حظر)')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('سبب التحذير')))
      .addSubcommand(s => s
        .setName('list')
        .setDescription('📋 عرض تحذيرات عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)))
      .addSubcommand(s => s
        .setName('clear')
        .setDescription('🗑️ مسح جميع تحذيرات عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('➖ حذف تحذير محدد برقمه')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addIntegerOption(o => o.setName('number').setDescription('رقم التحذير').setRequired(true).setMinValue(1))),

    async execute(i) {
      const sub    = i.options.getSubcommand();
      const target = i.options.getMember('member');
      if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);

      if (sub === 'add') {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Administrator**.').setColor(Colors.Red), true);
        if (target.user.bot)        return reply(i, new EmbedBuilder().setDescription('❌ لا يمكن تحذير بوت.').setColor(Colors.Red), true);
        if (target.id === i.user.id) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك تحذير نفسك.').setColor(Colors.Red), true);
        if (!outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك تحذير عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);

        const reason = i.options.getString('reason') || 'لم يُذكر سبب';
        const count  = addWarn(i.guild.id, target.id, { reason, mod: i.user.tag, modId: i.user.id, time: new Date().toISOString() });
        addModlog(i.guild.id, target.id, { action: 'warn', reason, mod: i.user.tag, modId: i.user.id, time: new Date().toISOString() });

        const bar = '█'.repeat(Math.min(count, 5)) + '░'.repeat(Math.max(0, 5 - count));
        await reply(i, new EmbedBuilder()
          .setTitle('⚠️ تحذير')
          .setColor(0xfee75c)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: '👤 العضو',  value: `<@${target.id}> \`${target.user.tag}\``, inline: true },
            { name: '📋 السبب',  value: reason,                                   inline: true },
            { name: '🛡️ بواسطة', value: `<@${i.user.id}>`,                        inline: true },
            { name: `📊 \`[${bar}]\``, value: `**${count}/5 تحذيرات**`,           inline: false },
          ).setTimestamp());

        if (count === 3) {
          try { await target.timeout(3_600_000, 'Auto-mute: 3 تحذيرات'); } catch {}
          await i.channel.send({ embeds: [new EmbedBuilder().setDescription(`🔇 <@${target.id}> أُسكت ساعة — وصل 3 تحذيرات.`).setColor(0x99aab5)] });
        }
        if (count >= 5 && target.bannable && reserve(i.guild, i.member, 'bans')) {
          try { await target.ban({ reason: 'Auto-ban: 5 تحذيرات' }); } catch {}
          await i.channel.send({ embeds: [new EmbedBuilder().setDescription(`🔨 <@${target.id}> حُظر — وصل 5 تحذيرات.`).setColor(Colors.Red)] });
        }
      }

      else if (sub === 'list') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Messages**.').setColor(Colors.Red), true);

        const list = getWarns(i.guild.id, target.id);
        if (!list.length)
          return reply(i, new EmbedBuilder()
            .setDescription(`✅ **${target.user.tag}** ليس لديه تحذيرات.`)
            .setColor(Colors.Green).setThumbnail(target.user.displayAvatarURL()));

        const bar   = '█'.repeat(Math.min(list.length, 5)) + '░'.repeat(Math.max(0, 5 - list.length));
        const embed = new EmbedBuilder()
          .setTitle(`📋 تحذيرات ${target.user.tag}`)
          .setDescription(`**\`[${bar}]\` ${list.length}/5**`)
          .setColor(0xfee75c).setThumbnail(target.user.displayAvatarURL()).setTimestamp();
        list.forEach((w, idx) => embed.addFields({
          name:  `⚠️ #${idx + 1}`,
          value: `> **السبب:** ${w.reason}\n> **بواسطة:** <@${w.modId}>\n> **التاريخ:** <t:${Math.floor(new Date(w.time).getTime()/1000)}:R>`,
          inline: false,
        }));
        reply(i, embed);
      }

      else if (sub === 'clear') {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Administrator**.').setColor(Colors.Red), true);
        const count = getWarns(i.guild.id, target.id).length;
        if (!count) return reply(i, new EmbedBuilder().setDescription(`❌ **${target.user.tag}** ليس لديه تحذيرات.`).setColor(Colors.Red), true);
        clearWarns(i.guild.id, target.id);
        reply(i, new EmbedBuilder()
          .setDescription(`🗑️ تم مسح **${count}** تحذير من <@${target.id}>.\n**بواسطة:** <@${i.user.id}>`)
          .setColor(Colors.Green));
      }

      else if (sub === 'remove') {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Administrator**.').setColor(Colors.Red), true);
        const num  = i.options.getInteger('number');
        const list = getWarns(i.guild.id, target.id);
        if (!list.length) return reply(i, new EmbedBuilder().setDescription(`❌ **${target.user.tag}** ليس لديه تحذيرات.`).setColor(Colors.Red), true);
        if (num > list.length) return reply(i, new EmbedBuilder().setDescription(`❌ التحذير #${num} غير موجود — لديه ${list.length} فقط.`).setColor(Colors.Red), true);
        const removed = list[num - 1];
        removeWarn(i.guild.id, target.id, num - 1);
        reply(i, new EmbedBuilder()
          .setDescription([`✅ حُذف التحذير #${num} من <@${target.id}>.`, `**السبب المحذوف:** ${removed.reason}`, `**المتبقي:** ${list.length - 1} تحذير`].join('\n'))
          .setColor(Colors.Green));
      }
    },
  },

  // ── /modlog ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('modlog')
      .setDescription('📋 سجل إجراءات المشرفين — عرض، ملاحظة، مسح')
      .addSubcommand(s => s
        .setName('view')
        .setDescription('📋 عرض سجل إجراءات عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addIntegerOption(o => o.setName('page').setDescription('الصفحة').setMinValue(1)))
      .addSubcommand(s => s
        .setName('note')
        .setDescription('📝 إضافة ملاحظة لسجل عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('نص الملاحظة').setRequired(true)))
      .addSubcommand(s => s
        .setName('clear')
        .setDescription('🗑️ مسح سجل إجراءات عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Messages**.').setColor(Colors.Red), true);
      const sub    = i.options.getSubcommand();
      const target = i.options.getMember('member');
      if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);

      if (sub === 'view') {
        const logs    = getModlogs(i.guild.id, target.id);
        const page    = i.options.getInteger('page') || 1;
        const perPage = 5;
        const pages   = Math.max(1, Math.ceil(logs.length / perPage));
        const slice   = logs.slice((page-1)*perPage, page*perPage).reverse();
        if (!logs.length)
          return reply(i, new EmbedBuilder().setDescription(`✅ لا توجد إجراءات مسجلة على **${target.user.tag}**.`).setColor(Colors.Green));
        const emojis = { warn:'⚠️', ban:'🔨', kick:'👢', mute:'🔇', unmute:'🔊', unban:'✅', note:'📝' };
        const embed = new EmbedBuilder()
          .setTitle(`📋 سجل الإجراءات — ${target.user.tag}`)
          .setColor(0x5865f2).setThumbnail(target.user.displayAvatarURL())
          .setFooter({ text: `صفحة ${page}/${pages} • ${logs.length} إجراء` }).setTimestamp();
        slice.forEach(log => embed.addFields({
          name:  `${emojis[log.action]||'📋'} #${log.id} — ${log.action.toUpperCase()}`,
          value: `> **السبب:** ${log.reason||'لم يُذكر'}\n> **بواسطة:** <@${log.modId}>\n> **التاريخ:** <t:${Math.floor(new Date(log.time).getTime()/1000)}:R>`,
          inline: false,
        }));
        reply(i, embed);
      }

      else if (sub === 'note') {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Administrator**.').setColor(Colors.Red), true);
        const text = i.options.getString('text');
        const id   = addModlog(i.guild.id, target.id, { action:'note', reason:text, mod:i.user.tag, modId:i.user.id, time:new Date().toISOString() });
        reply(i, new EmbedBuilder()
          .setTitle('📝 ملاحظة مضافة')
          .setDescription([`**العضو:** <@${target.id}>`, `**الملاحظة:** ${text}`, `**رقم الإجراء:** #${id}`].join('\n'))
          .setColor(0x5865f2));
      }

      else if (sub === 'clear') {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Administrator**.').setColor(Colors.Red), true);
        const count = getModlogs(i.guild.id, target.id).length;
        if (!count) return reply(i, new EmbedBuilder().setDescription(`❌ لا يوجد سجل لـ **${target.user.tag}**.`).setColor(Colors.Red), true);
        clearModlogs(i.guild.id, target.id);
        reply(i, new EmbedBuilder()
          .setDescription(`🗑️ تم مسح **${count}** إجراء من سجل <@${target.id}>.\n**بواسطة:** <@${i.user.id}>`)
          .setColor(Colors.Green));
      }
    },
  },
];
