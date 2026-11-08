const { SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isTrusted } = require('../../utils/trust');
const { outranks } = require('../../utils/rank');
const { reserve } = require('../../utils/nukeGuard');

const P = PermissionFlagsBits;
// Roles carrying these can only be handed out by the owner or co-owner
const DANGER = P.Administrator | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.BanMembers | P.KickMembers
  | P.ModerateMembers | P.ManageWebhooks | P.MentionEveryone | P.ManageMessages;
const DANGER_DENIED = new EmbedBuilder()
  .setDescription('🚫 الرتبة دي فيها صلاحيات إدارية، والأونر والكو أونر بس يقدروا يدّوها.')
  .setColor(Colors.Red);

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('role')
      .setDescription('🎭 إدارة الرتب — إضافة، سحب، إنشاء، حذف، معلومات، أعضاء')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('➕ إعطاء رتبة لعضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('➖ سحب رتبة من عضو')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)))
      .addSubcommand(s => s
        .setName('create')
        .setDescription('✨ إنشاء رتبة جديدة')
        .addStringOption(o => o.setName('name').setDescription('اسم الرتبة').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('اللون hex مثال: ff0000'))
        .addBooleanOption(o => o.setName('hoist').setDescription('عرضها منفصلة في القائمة؟'))
        .addBooleanOption(o => o.setName('mentionable').setDescription('السماح بذكرها؟')))
      .addSubcommand(s => s
        .setName('delete')
        .setDescription('🗑️ حذف رتبة نهائياً')
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('السبب')))
      .addSubcommand(s => s
        .setName('all')
        .setDescription('👥 إعطاء رتبة لجميع الأعضاء')
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)))
      .addSubcommand(s => s
        .setName('info')
        .setDescription('📊 معلومات تفصيلية عن رتبة')
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true)))
      .addSubcommand(s => s
        .setName('members')
        .setDescription('📋 عرض الأعضاء الحاملين لرتبة')
        .addRoleOption(o => o.setName('role').setDescription('الرتبة').setRequired(true))),

    async execute(i) {
      const sub = i.options.getSubcommand();

      if (sub === 'add' || sub === 'remove') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Roles**.').setColor(Colors.Red), true);
        const target = i.options.getMember('member');
        const role   = i.options.getRole('role');
        if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
        if (role.managed) return reply(i, new EmbedBuilder().setDescription('❌ هذه الرتبة مُدارة من integration.').setColor(Colors.Red), true);
        if (role.comparePositionTo(i.guild.members.me.roles.highest) >= 0)
          return reply(i, new EmbedBuilder().setDescription('❌ الرتبة أعلى من أو تساوي أعلى رتبة للبوت.').setColor(Colors.Red), true);
        if (role.comparePositionTo(i.member.roles.highest) >= 0 && i.user.id !== i.guild.ownerId)
          return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التحكم برتبة أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
        if (!outranks(i.member, target))
          return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التحكم في رتب عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
        if (sub === 'add' && (role.permissions.bitfield & DANGER) && !isTrusted(i.member))
          return reply(i, DANGER_DENIED, true);
        if (!reserve(i.guild, i.member, 'roleEdits'))
          return reply(i, new EmbedBuilder().setDescription('🛡️ وصلت لحد الحماية. الأمر اترفض والموضوع اتبعت للأونر والكو أونر.').setColor(Colors.Red), true);

        if (sub === 'add') {
          if (target.roles.cache.has(role.id))
            return reply(i, new EmbedBuilder().setDescription(`❌ <@${target.id}> لديه <@&${role.id}> بالفعل.`).setColor(Colors.Red), true);
          await target.roles.add(role);
          reply(i, new EmbedBuilder()
            .setDescription(`✅ <@&${role.id}> أُعطيت لـ <@${target.id}>.\n**بواسطة:** <@${i.user.id}>`)
            .setColor(Colors.Green));
        } else {
          if (!target.roles.cache.has(role.id))
            return reply(i, new EmbedBuilder().setDescription(`❌ <@${target.id}> لا يملك <@&${role.id}>.`).setColor(Colors.Red), true);
          await target.roles.remove(role);
          reply(i, new EmbedBuilder()
            .setDescription(`✅ <@&${role.id}> سُحبت من <@${target.id}>.\n**بواسطة:** <@${i.user.id}>`)
            .setColor(Colors.Orange));
        }
      }

      else if (sub === 'create') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Roles**.').setColor(Colors.Red), true);
        if (!reserve(i.guild, i.member, 'roleCreate'))
          return reply(i, new EmbedBuilder().setDescription('🛡️ وصلت لحد الحماية. الأمر اترفض والموضوع اتبعت للأونر والكو أونر.').setColor(Colors.Red), true);
        const name        = i.options.getString('name');
        const colorHex    = i.options.getString('color');
        const hoist       = i.options.getBoolean('hoist')       ?? false;
        const mentionable = i.options.getBoolean('mentionable') ?? false;
        let color;
        if (colorHex) {
          const hex = colorHex.replace('#', '');
          if (!/^[0-9a-fA-F]{6}$/.test(hex))
            return reply(i, new EmbedBuilder().setDescription('❌ لون غير صحيح. مثال: `ff0000`').setColor(Colors.Red), true);
          color = parseInt(hex, 16);
        }
        const role = await i.guild.roles.create({ name, color, hoist, mentionable });
        reply(i, new EmbedBuilder()
          .setTitle('✨ رتبة جديدة')
          .setColor(role.color || Colors.Blue)
          .addFields(
            { name: '🎭 الرتبة',         value: `<@&${role.id}>`,            inline: true },
            { name: '🎨 اللون',           value: role.hexColor,               inline: true },
            { name: '🔝 معروضة منفصلة',   value: hoist       ? 'نعم' : 'لا', inline: true },
            { name: '📢 قابلة للذكر',     value: mentionable ? 'نعم' : 'لا', inline: true },
            { name: '🛡️ بواسطة',          value: `<@${i.user.id}>`,          inline: true },
          ).setTimestamp());
      }

      else if (sub === 'delete') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Roles**.').setColor(Colors.Red), true);
        const role   = i.options.getRole('role');
        const reason = i.options.getString('reason') || 'لم يُذكر سبب';
        if (role.managed) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكن حذف رتبة مُدارة.').setColor(Colors.Red), true);
        if (role.comparePositionTo(i.guild.members.me.roles.highest) >= 0)
          return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنني حذف رتبة أعلى من رتبتي.').setColor(Colors.Red), true);
        if (role.comparePositionTo(i.member.roles.highest) >= 0 && i.user.id !== i.guild.ownerId)
          return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك حذف رتبة أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
        const name = role.name;
        await role.delete(reason);
        reply(i, new EmbedBuilder()
          .setDescription(`🗑️ رتبة **${name}** حُذفت.\n**السبب:** ${reason}\n**بواسطة:** <@${i.user.id}>`)
          .setColor(Colors.Red));
      }

      else if (sub === 'all') {
        if (!isTrusted(i.member))
          return reply(i, new EmbedBuilder().setDescription('🚫 إعطاء رتبة لكل الأعضاء للأونر والكو أونر بس.').setColor(Colors.Red), true);
        const role = i.options.getRole('role');
        if (role.managed || (role.permissions.bitfield & DANGER))
          return reply(i, DANGER_DENIED, true);
        if (role.comparePositionTo(i.guild.members.me.roles.highest) >= 0)
          return reply(i, new EmbedBuilder().setDescription('❌ الرتبة أعلى من أو تساوي أعلى رتبة للبوت.').setColor(Colors.Red), true);
        await i.deferReply();
        const members = await i.guild.members.fetch();
        let success = 0, skipped = 0, failed = 0;
        for (const [, m] of members) {
          if (m.roles.cache.has(role.id)) { skipped++; continue; }
          try { await m.roles.add(role); success++; } catch { failed++; }
        }
        i.editReply({ embeds: [new EmbedBuilder()
          .setTitle('✅ رتبة للكل')
          .setColor(Colors.Green)
          .addFields(
            { name: '🎭 الرتبة',   value: `<@&${role.id}>`, inline: true },
            { name: '✅ أُعطيت',   value: `${success}`,     inline: true },
            { name: '⏭️ متجاوز',  value: `${skipped}`,     inline: true },
            { name: '❌ فشل',      value: `${failed}`,      inline: true },
          ).setTimestamp()
        ]});
      }

      else if (sub === 'info') {
        const role = i.options.getRole('role');
        reply(i, new EmbedBuilder()
          .setTitle(`📊 ${role.name}`)
          .setColor(role.color || Colors.Blue)
          .addFields(
            { name: '🆔 ID',            value: `\`${role.id}\``,                                       inline: true },
            { name: '🎨 اللون',          value: role.hexColor,                                          inline: true },
            { name: '👥 الأعضاء',        value: `${role.members.size}`,                                inline: true },
            { name: '📊 الموقع',         value: `#${role.position}`,                                   inline: true },
            { name: '🔝 معروضة منفصلة',  value: role.hoist       ? '✅' : '❌',                       inline: true },
            { name: '📢 قابلة للذكر',    value: role.mentionable ? '✅' : '❌',                       inline: true },
            { name: '🤖 مُدارة',         value: role.managed     ? '✅' : '❌',                       inline: true },
            { name: '📅 تاريخ الإنشاء',  value: `<t:${Math.floor(role.createdTimestamp/1000)}:D>`,    inline: true },
          ).setTimestamp());
      }

      else if (sub === 'members') {
        const role = i.options.getRole('role');
        if (!role.members.size)
          return reply(i, new EmbedBuilder().setDescription(`❌ لا يوجد أعضاء يملكون <@&${role.id}>.`).setColor(Colors.Red), true);
        const list = [...role.members.values()].slice(0, 30).map((m, idx) => `\`${idx+1}.\` <@${m.id}>`).join('\n');
        const more = role.members.size > 30 ? `\n*...و ${role.members.size - 30} آخرون*` : '';
        reply(i, new EmbedBuilder()
          .setTitle(`👥 أعضاء رتبة ${role.name}`)
          .setDescription(list + more)
          .setColor(role.color || Colors.Blue)
          .setFooter({ text: `الإجمالي: ${role.members.size} عضو` }));
      }
    },
  },
];
