const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../../utils/storage');
const { applyLanguage } = require('../../utils/languageSwitch');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('language')
      .setDescription('🌐 تغيير لغة البوت في السيرفر')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o
        .setName('lang')
        .setDescription('اللغة')
        .setRequired(true)
        .addChoices({ name: 'العربية', value: 'ar' }, { name: 'English', value: 'en' })),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return i.reply({ content: '🚫 تحتاج صلاحية **Administrator**.', ephemeral: true });
      }
      const lang = i.options.getString('lang');
      if ((getGuildConfig(i.guild.id).language || 'ar') === lang) {
        return i.reply({ content: 'ℹ️ دي لغة البوت الحالية بالفعل.', ephemeral: true });
      }

      await i.deferReply({ ephemeral: true });
      setGuildConfig(i.guild.id, 'language', lang);
      const failed = await applyLanguage(i.guild, lang);
      if (failed.length) return i.editReply({ content: '⚠️ اللغة اتغيرت بس فيه حاجات ماتحدثتش: ' + failed.join('، ') });
      return i.editReply({ content: '✅ لغة البوت اتغيرت، والرسايل والأوامر اتحدثت.' });
    },
  },
];
