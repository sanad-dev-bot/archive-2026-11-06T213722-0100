const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setApplicationsOpen } = require('../../utils/applicationSystem');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('applications')
      .setDescription('📝 فتح أو قفل التقديم على الإدارة')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o
        .setName('status')
        .setDescription('الحالة')
        .setRequired(true)
        .addChoices({ name: 'فتح', value: 'open' }, { name: 'قفل', value: 'closed' })),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return i.reply({ content: '🚫 تحتاج صلاحية **Administrator**.', ephemeral: true });
      }
      const open = i.options.getString('status') === 'open';
      await i.deferReply({ ephemeral: true });
      await setApplicationsOpen(i.guild, open);
      return i.editReply({ content: open
        ? '✅ التقديم اتفتح، والروم والموقع بقوا ظاهرين للأعضاء.'
        : '🔒 التقديم اتقفل، والروم والموقع اتخفوا عن الأعضاء.' });
    },
  },
];
