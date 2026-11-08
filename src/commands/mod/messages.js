const {
  SlashCommandBuilder, Colors, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const { em } = require('../../utils/embed');
const { purge, botCanPurge, logPurge } = require('../../utils/purge');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

function resultEmbed(i, result, filters) {
  return new EmbedBuilder()
    .setTitle(result.deleted ? '🧹 تم الحذف' : '🧹 مفيش حاجة اتمسحت')
    .setDescription([
      `**حُذفت:** ${result.deleted} رسالة`,
      filters.length ? `**فلتر:** ${filters.join(' • ')}` : '',
      result.tooOld ? `⚠️ **${result.tooOld}** رسالة أقدم من 14 يوم، وديسكورد مابيسمحش بمسحها مرة واحدة.` : '',
      `**بواسطة:** <@${i.user.id}>`,
    ].filter(Boolean).join('\n'))
    .setColor(result.deleted ? Colors.Blue : Colors.Orange).setTimestamp();
}

module.exports = [

  // ── /clear ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('clear')
      .setDescription('🧹 حذف رسائل من القناة بفلاتر متعددة')
      .addIntegerOption(o => o.setName('amount').setDescription('عدد الرسائل (1–500)').setRequired(true).setMinValue(1).setMaxValue(500))
      .addUserOption(o => o.setName('member').setDescription('احذف رسائل عضو معين فقط'))
      .addBooleanOption(o => o.setName('bots_only').setDescription('احذف رسائل البوتات فقط'))
      .addBooleanOption(o => o.setName('has_links').setDescription('احذف الرسائل التي تحتوي روابط'))
      .addBooleanOption(o => o.setName('has_attachments').setDescription('احذف الرسائل التي تحتوي ملفات'))
      .addBooleanOption(o => o.setName('include_pinned').setDescription('امسح الرسايل المثبتة كمان (افتراضي: لأ)')),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);
      const problem = botCanPurge(i.channel);
      if (problem) return reply(i, em('❌', problem, Colors.Red), true);
      await i.deferReply({ ephemeral: true });

      const amount = i.options.getInteger('amount');
      const user   = i.options.getUser('member');
      const bots   = i.options.getBoolean('bots_only');
      const links  = i.options.getBoolean('has_links');
      const atts   = i.options.getBoolean('has_attachments');
      const pinned = i.options.getBoolean('include_pinned');
      const filter = m => (!user || m.author.id === user.id)
        && (!bots || m.author.bot)
        && (!links || /https?:\/\/|discord\.gg\//i.test(m.content))
        && (!atts || m.attachments.size > 0);

      const result = await purge(i.channel, amount, filter, { keepPinned: !pinned });
      const filters = [
        user   ? `من: **${user.tag}**` : '',
        bots   ? 'بوتات فقط' : '',
        links  ? 'تحتوي روابط' : '',
        atts   ? 'تحتوي ملفات' : '',
        pinned ? 'مع المثبتة' : '',
      ].filter(Boolean);
      await logPurge(i.guild, i.channel, i.user, result, filters.join(' • '));
      return i.editReply({ embeds: [resultEmbed(i, result, filters)] });
    },
  },

  // ── /clearuser ────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('clearuser')
      .setDescription('🧹 حذف رسائل عضو معين في القناة الحالية')
      .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('عدد رسايله اللي تتمسح (افتراضي: 100)').setMinValue(1).setMaxValue(500)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);
      const problem = botCanPurge(i.channel);
      if (problem) return reply(i, em('❌', problem, Colors.Red), true);
      await i.deferReply({ ephemeral: true });

      // Works for members who already left too: only the user id is needed
      const target = i.options.getUser('member', true);
      const amount = i.options.getInteger('amount') || 100;
      const result = await purge(i.channel, amount, m => m.author.id === target.id);
      await logPurge(i.guild, i.channel, i.user, result, 'من: ' + target.tag);
      return i.editReply({ embeds: [resultEmbed(i, result, ['من: **' + target.tag + '**']).setThumbnail(target.displayAvatarURL())] });
    },
  },

];
