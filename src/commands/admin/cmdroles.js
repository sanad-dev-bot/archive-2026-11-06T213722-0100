const {
  SlashCommandBuilder, Colors, EmbedBuilder,
  PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require('discord.js');
const {
  getCmdRoles, getCmdRole, setCmdRole, deleteCmdRole, clearCmdRoles,
} = require('../../utils/storage');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

// ── All available commands grouped by category ────────────────────────────
const CMD_GROUPS = {
  '🔨 الإشراف': ['ban','kick','mute','unmute','softban','banlist'],
  '⚠️ التحذيرات': ['warn','warnings','clearwarns','removewarn','modlog','note','clearmodlog'],
  '🧹 الرسائل': ['clear','clearuser','purge','snipe','editsnipe'],
  '📁 القنوات': ['lock','unlock','hide','unhide','slowmode','createchannel','createvc','deletechannel','createcategory','renamechannel','settopic'],
  '🎭 الرتب': ['addrole','removerole','createrole','deleterole','roleall','roleinfo','rolemembers'],
  '🔊 الصوت': ['vmove','vkick','vmuteall','vunmuteall'],
  '📊 المعلومات': ['serverinfo','userinfo','avatar','serveravatar','banner','servericon','serverbanner','membercount','invite','invites','ping','uptime','nick','resetnick'],
  '🛠️ الأدوات': ['poll','addemoji','delemoji','emojis','timestamp','calculator'],
  '⭐ XP': ['rank','profile','leaderboard','givexp','takexp','setxp','resetxp','xpsettings','setlevelup','setlevelrole','removelevelrole','levelroles'],
  '🎫 التذاكر': ['ticketpanel','addticketoption','removeticketoption','addtoticket','removefromticket','renameticket','closeticket','ticketstats'],
  '🎉 السحوبات': ['gstart','gend','greroll','gpause','gresume','gedit','glist','ginfo'],
  '📡 البرودكاست': ['bc','obc','bcspeed','bcreport','broadcastadd','broadcastremove','broadcastlist','broadcast'],
  '🛡️ الحماية': ['protection'],
  '⚙️ الإعدادات': ['setlog','disablelog','setwelcome','setwelcomemsg','testwelcome','disablewelcome','setautorole','disableautorole','setticketrole','setticketcategory','setticketlog'],
};

// Flat list for autocomplete / search
const ALL_CMDS = Object.values(CMD_GROUPS).flat();

// ── Color helpers ──────────────────────────────────────────────────────────
function statusColor(hasRoles) { return hasRoles ? 0x57f287 : 0x99aab5; }

// ── Build overview embed ───────────────────────────────────────────────────
function buildOverviewEmbed(guildId, guildName) {
  const cfg    = getCmdRoles(guildId);
  const locked = Object.keys(cfg);

  const lines = Object.entries(CMD_GROUPS).map(([group, cmds]) => {
    const withRoles = cmds.filter(c => cfg[c]?.length);
    const tag = withRoles.length ? ` — 🔐 ${withRoles.length} مقيّد` : '';
    return `**${group}**${tag}`;
  });

  return new EmbedBuilder()
    .setTitle('🔐 نظام صلاحيات الأوامر')
    .setDescription([
      'يمكنك تخصيص رتبة (أو أكثر) لكل أمر.',
      'أعضاء هذه الرتبة يستطيعون استخدام الأمر بغض النظر عن صلاحياتهم.',
      '> الـ Admin دائماً يتجاوز هذا النظام.',
      '',
      `📊 **الأوامر المقيّدة:** ${locked.length} من ${ALL_CMDS.length}`,
      '',
      lines.join('\n'),
    ].join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: guildName })
    .setTimestamp();
}

// ── Build command detail embed ─────────────────────────────────────────────
function buildCmdEmbed(guildId, cmdName, guildName) {
  const roles = getCmdRole(guildId, cmdName);
  return new EmbedBuilder()
    .setTitle(`🔐 صلاحيات الأمر: /${cmdName}`)
    .setDescription(roles.length
      ? `**الرتب المصرح لها:**\n${roles.map(id => `> <@&${id}>`).join('\n')}`
      : '> لا توجد قيود — الأمر يعمل بالصلاحيات الافتراضية.')
    .setColor(statusColor(roles.length))
    .setFooter({ text: guildName })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────
module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('cmdrole')
      .setDescription('🔐 إدارة الرتب المخصصة لأوامر البوت')

      // ── set ───────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('set')
        .setDescription('🔗 تعيين رتبة (أو أكثر) لأمر معين')
        .addStringOption(o => o
          .setName('command')
          .setDescription('اسم الأمر بدون /')
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption(o => o
          .setName('role1')
          .setDescription('الرتبة الأولى')
          .setRequired(true))
        .addRoleOption(o => o.setName('role2').setDescription('رتبة ثانية (اختياري)'))
        .addRoleOption(o => o.setName('role3').setDescription('رتبة ثالثة (اختياري)'))
        .addRoleOption(o => o.setName('role4').setDescription('رتبة رابعة (اختياري)'))
        .addRoleOption(o => o.setName('role5').setDescription('رتبة خامسة (اختياري)')))

      // ── add ───────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('add')
        .setDescription('➕ إضافة رتبة لأمر موجود (بدون حذف الرتب القديمة)')
        .addStringOption(o => o
          .setName('command')
          .setDescription('اسم الأمر')
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption(o => o
          .setName('role')
          .setDescription('الرتبة المراد إضافتها')
          .setRequired(true)))

      // ── remove ────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('➖ إزالة رتبة من أمر')
        .addStringOption(o => o
          .setName('command')
          .setDescription('اسم الأمر')
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption(o => o
          .setName('role')
          .setDescription('الرتبة المراد إزالتها')
          .setRequired(true)))

      // ── reset ─────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('reset')
        .setDescription('🗑️ إزالة جميع القيود من أمر معين')
        .addStringOption(o => o
          .setName('command')
          .setDescription('اسم الأمر')
          .setRequired(true)
          .setAutocomplete(true)))

      // ── resetall ──────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('resetall')
        .setDescription('🗑️ مسح جميع قيود الأوامر في السيرفر'))

      // ── view ──────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('view')
        .setDescription('👁️ عرض الرتب المخصصة لأمر معين')
        .addStringOption(o => o
          .setName('command')
          .setDescription('اسم الأمر')
          .setRequired(true)
          .setAutocomplete(true)))

      // ── list ──────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('list')
        .setDescription('📋 عرض جميع الأوامر المقيّدة في هذا السيرفر'))

      // ── browse ────────────────────────────────────────────────────────────
      .addSubcommand(s => s
        .setName('browse')
        .setDescription('🗂️ تصفح الأوامر حسب القسم وإدارتها')),

    // ── Autocomplete ────────────────────────────────────────────────────────
    async autocomplete(interaction) {
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = ALL_CMDS
        .filter(c => c.startsWith(focused) || c.includes(focused))
        .slice(0, 25)
        .map(c => ({ name: `/${c}`, value: c }));
      await interaction.respond(choices);
    },

    // ── Execute ─────────────────────────────────────────────────────────────
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, new EmbedBuilder()
          .setDescription('🚫 تحتاج صلاحية **Administrator** لإدارة صلاحيات الأوامر.')
          .setColor(Colors.Red), true);

      const sub     = i.options.getSubcommand();
      const gid     = i.guild.id;
      const gName   = i.guild.name;

      // ── /cmdrole set ───────────────────────────────────────────────────────
      if (sub === 'set') {
        const cmd = i.options.getString('command').toLowerCase().replace('/', '');
        if (!ALL_CMDS.includes(cmd))
          return reply(i, new EmbedBuilder()
            .setDescription(`❌ الأمر \`/${cmd}\` غير موجود في قائمة الأوامر.`)
            .setColor(Colors.Red), true);

        const roleIds = [1,2,3,4,5]
          .map(n => i.options.getRole(`role${n}`)?.id)
          .filter(Boolean);
        const unique = [...new Set(roleIds)];

        setCmdRole(gid, cmd, unique);

        return reply(i, new EmbedBuilder()
          .setTitle('✅ تم تعيين الرتب')
          .setDescription([
            `**الأمر:** \`/${cmd}\``,
            `**الرتب المصرح لها (${unique.length}):**`,
            unique.map(id => `> <@&${id}>`).join('\n'),
            '',
            '> أعضاء هذه الرتب يستطيعون استخدام الأمر.',
            '> الـ Admin يتجاوز هذا القيد دائماً.',
          ].join('\n'))
          .setColor(0x57f287)
          .setTimestamp());
      }

      // ── /cmdrole add ───────────────────────────────────────────────────────
      if (sub === 'add') {
        const cmd  = i.options.getString('command').toLowerCase().replace('/', '');
        const role = i.options.getRole('role');
        if (!ALL_CMDS.includes(cmd))
          return reply(i, new EmbedBuilder()
            .setDescription(`❌ الأمر \`/${cmd}\` غير موجود.`)
            .setColor(Colors.Red), true);

        const existing = getCmdRole(gid, cmd);
        if (existing.includes(role.id))
          return reply(i, new EmbedBuilder()
            .setDescription(`❌ <@&${role.id}> مضافة بالفعل لـ \`/${cmd}\`.`)
            .setColor(Colors.Red), true);
        if (existing.length >= 10)
          return reply(i, new EmbedBuilder()
            .setDescription('❌ الحد الأقصى 10 رتب لكل أمر.')
            .setColor(Colors.Red), true);

        setCmdRole(gid, cmd, [...existing, role.id]);

        return reply(i, new EmbedBuilder()
          .setTitle('✅ تمت الإضافة')
          .setDescription([
            `**الأمر:** \`/${cmd}\``,
            `**الرتبة المضافة:** <@&${role.id}>`,
            `**إجمالي الرتب:** ${existing.length + 1}`,
          ].join('\n'))
          .setColor(0x57f287));
      }

      // ── /cmdrole remove ────────────────────────────────────────────────────
      if (sub === 'remove') {
        const cmd  = i.options.getString('command').toLowerCase().replace('/', '');
        const role = i.options.getRole('role');
        const existing = getCmdRole(gid, cmd);

        if (!existing.includes(role.id))
          return reply(i, new EmbedBuilder()
            .setDescription(`❌ <@&${role.id}> غير مضافة لـ \`/${cmd}\`.`)
            .setColor(Colors.Red), true);

        const updated = existing.filter(id => id !== role.id);
        setCmdRole(gid, cmd, updated);

        return reply(i, new EmbedBuilder()
          .setTitle('✅ تمت الإزالة')
          .setDescription([
            `**الأمر:** \`/${cmd}\``,
            `**الرتبة المُزالة:** <@&${role.id}>`,
            updated.length
              ? `**الرتب المتبقية:** ${updated.map(id=>`<@&${id}>`).join(', ')}`
              : '> لا توجد رتب — الأمر يعمل بالصلاحيات الافتراضية الآن.',
          ].join('\n'))
          .setColor(0xe67e22));
      }

      // ── /cmdrole reset ─────────────────────────────────────────────────────
      if (sub === 'reset') {
        const cmd = i.options.getString('command').toLowerCase().replace('/', '');
        const old = getCmdRole(gid, cmd);
        if (!old.length)
          return reply(i, new EmbedBuilder()
            .setDescription(`ℹ️ \`/${cmd}\` ليس لديه قيود أصلاً.`)
            .setColor(Colors.Blue), true);

        deleteCmdRole(gid, cmd);
        return reply(i, new EmbedBuilder()
          .setTitle('🗑️ تم إزالة القيود')
          .setDescription(`تم حذف جميع قيود الأمر \`/${cmd}\` (${old.length} رتبة).\nالأمر يعمل بالصلاحيات الافتراضية الآن.`)
          .setColor(Colors.Orange));
      }

      // ── /cmdrole resetall ──────────────────────────────────────────────────
      if (sub === 'resetall') {
        const cfg   = getCmdRoles(gid);
        const count = Object.keys(cfg).length;
        if (!count)
          return reply(i, new EmbedBuilder()
            .setDescription('ℹ️ لا توجد قيود مفعّلة في هذا السيرفر.')
            .setColor(Colors.Blue), true);

        clearCmdRoles(gid);
        return reply(i, new EmbedBuilder()
          .setTitle('🗑️ تم مسح جميع القيود')
          .setDescription(`تم حذف قيود **${count}** أمر.\nجميع الأوامر تعمل بصلاحياتها الافتراضية الآن.`)
          .setColor(Colors.Orange));
      }

      // ── /cmdrole view ──────────────────────────────────────────────────────
      if (sub === 'view') {
        const cmd = i.options.getString('command').toLowerCase().replace('/', '');
        return reply(i, buildCmdEmbed(gid, cmd, gName));
      }

      // ── /cmdrole list ──────────────────────────────────────────────────────
      if (sub === 'list') {
        const cfg    = getCmdRoles(gid);
        const locked = Object.entries(cfg).filter(([, roles]) => roles.length);

        if (!locked.length)
          return reply(i, new EmbedBuilder()
            .setTitle('📋 الأوامر المقيّدة')
            .setDescription('لا توجد قيود مفعّلة في هذا السيرفر.\nاستخدم `/cmdrole set` لتقييد أمر.')
            .setColor(0x99aab5));

        // Group by category
        const grouped = {};
        for (const [cmd, roles] of locked) {
          const group = Object.entries(CMD_GROUPS).find(([, cmds]) => cmds.includes(cmd))?.[0] || '❓ أخرى';
          if (!grouped[group]) grouped[group] = [];
          grouped[group].push({ cmd, roles });
        }

        const embed = new EmbedBuilder()
          .setTitle(`📋 الأوامر المقيّدة — ${locked.length} أمر`)
          .setColor(0x5865f2)
          .setFooter({ text: gName })
          .setTimestamp();

        for (const [group, items] of Object.entries(grouped)) {
          embed.addFields({
            name:  group,
            value: items.map(({ cmd, roles }) =>
              `\`/${cmd}\` — ${roles.map(id=>`<@&${id}>`).join(', ')}`
            ).join('\n'),
            inline: false,
          });
        }

        return reply(i, embed);
      }

      // ── /cmdrole browse ────────────────────────────────────────────────────
      if (sub === 'browse') {
        const cfg = getCmdRoles(gid);

        // Build category select menu
        const menu = new StringSelectMenuBuilder()
          .setCustomId('cmdrole_browse')
          .setPlaceholder('📂 اختر قسماً لعرض أوامره...')
          .addOptions(
            Object.keys(CMD_GROUPS).map(group =>
              new StringSelectMenuOptionBuilder()
                .setLabel(group.replace(/^[^ ]+ /, ''))
                .setEmoji(group.split(' ')[0])
                .setValue(group)
            )
          );

        const row   = new ActionRowBuilder().addComponents(menu);
        const embed = buildOverviewEmbed(gid, gName);

        await i.reply({ embeds: [embed], components: [row] });

        const collector = i.channel.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 120_000,
          filter: s => s.user.id === i.user.id && s.customId === 'cmdrole_browse',
        });

        collector.on('collect', async sel => {
          const group = sel.values[0];
          const cmds  = CMD_GROUPS[group] || [];
          const lines = cmds.map(cmd => {
            const roles = getCmdRole(gid, cmd);
            const tag   = roles.length
              ? ` 🔐 ${roles.map(id=>`<@&${id}>`).join(', ')}`
              : ' *(افتراضي)*';
            return `\`/${cmd}\`${tag}`;
          });

          const catEmbed = new EmbedBuilder()
            .setTitle(`${group}`)
            .setDescription(lines.join('\n') || 'لا توجد أوامر.')
            .setColor(0x5865f2)
            .setFooter({ text: `${cmds.filter(c => getCmdRole(gid,c).length).length} مقيّد من ${cmds.length}` })
            .setTimestamp();

          await sel.update({ embeds: [catEmbed], components: [row] });
        });

        collector.on('end', () =>
          i.editReply({ components: [] }).catch(() => {})
        );
      }
    },
  },
];
