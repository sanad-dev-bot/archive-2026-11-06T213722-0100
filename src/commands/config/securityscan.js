const { SlashCommandBuilder } = require('discord.js');
const { isTrusted } = require('../../utils/trust');
const { saveReport, report } = require('../../utils/securityScan');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('securityscan')
      .setDescription('🛡️ فحص أمان السيرفر وتصليح المشاكل الآمنة (للأونر والكو أونر)'),
    async execute(i) {
      if (!isTrusted(i.member)) return i.reply({ content: '🚫 الفحص للأونر والكو أونر بس.', ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const result = await saveReport(i.guild);
      return i.editReply(report(result));
    },
  },
];
