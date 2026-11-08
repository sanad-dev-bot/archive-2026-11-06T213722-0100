const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { postGuides } = require('../../utils/roomGuides');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('roomguides')
      .setDescription('📜 نشر أو تحديث القوانين ورسايل تعريف الرومات')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return i.reply({ content: '🚫 تحتاج صلاحية **Administrator**.', ephemeral: true });
      }
      await i.deferReply({ ephemeral: true });
      const results = await postGuides(i.guild);
      const failed = Object.entries(results).filter(([, r]) => r !== 'ok');
      return i.editReply({ content: failed.length ? '⚠️ فشل: ' + failed.map(f => f.join(' — ')).join('، ') : '✅ كل الرسايل اتحدثت.' });
    },
  },
];
