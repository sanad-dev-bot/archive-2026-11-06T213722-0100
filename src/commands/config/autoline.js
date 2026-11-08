const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const {
  getAutoLineConfig,
  setAutoLineImage,
  addAutoLineChannel,
  removeAutoLineChannel,
} = require('../../utils/storage');

function reply(i, content, ephemeral = false) {
  return i.reply({ content, ephemeral });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('setautoline')
      .setDescription('تحديد صورة الخط التلقائي')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o
        .setName('url')
        .setDescription('رابط صورة الخط')
        .setRequired(true)),

    async execute(i) {
      const url = i.options.getString('url', true).trim();
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        return reply(i, 'رابط الصورة غير صحيح. أرسل رابط صورة يبدأ بـ https://', true);
      }

      setAutoLineImage(i.guild.id, url);
      return reply(i, 'تم تحديد صورة الخط التلقائي بنجاح.');
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('setautolinechannel')
      .setDescription('تحديد روم لإرسال الخط تلقائياً')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('الروم الذي تريد تفعيل الخط فيه')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

    async execute(i) {
      const channel = i.options.getChannel('channel', true);
      const cfg = getAutoLineConfig(i.guild.id);
      if (!cfg.image) {
        return reply(i, 'حدد صورة الخط أولاً باستخدام /setautoline.', true);
      }

      const channels = addAutoLineChannel(i.guild.id, channel.id);
      return reply(i, `تم تفعيل الخط تلقائياً في <#${channel.id}>.\nالرومات المفعلة: ${channels.map(id => `<#${id}>`).join(' ')}`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('removeautolinechannel')
      .setDescription('إزالة الخط التلقائي من روم')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('الروم الذي تريد إزالة الخط منه')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

    async execute(i) {
      const channel = i.options.getChannel('channel', true);
      const removed = removeAutoLineChannel(i.guild.id, channel.id);
      return reply(i,
        removed
          ? `تم إزالة الخط التلقائي من <#${channel.id}>.`
          : `الخط التلقائي غير مفعل في <#${channel.id}>.`,
        !removed
      );
    },
  },
];
