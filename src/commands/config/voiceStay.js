const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, Colors } = require('discord.js');
const { em } = require('../../utils/embed');
const { getGuildConfig } = require('../../utils/storage');
const { setStayVoice, clearStayVoice } = require('../../utils/voiceStay');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('setvoice')
      .setDescription('تحديد روم صوتي يثبت فيه البوت')
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('الروم الصوتي الذي سيتثبت فيه البوت')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);

      const channel = i.options.getChannel('channel', true);
      try {
        await setStayVoice(i.guild, channel.id);
        return reply(i, em('🔊 تم تثبيت البوت', `تم تثبيت البوت في <#${channel.id}> وسيعود للروم تلقائياً إذا انقطع.`, Colors.Green));
      } catch (err) {
        return reply(i, em('❌ تعذر التثبيت', err.message || 'تأكد من صلاحيات البوت في الروم الصوتي.', Colors.Red), true);
      }
    },
  },
];
