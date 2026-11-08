const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { sendVerifyPanel } = require('../../utils/serverKit');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('verifypanel')
      .setDescription('✅ إرسال رسالة التحقق في القناة الحالية')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      await i.deferReply({ ephemeral: true });
      await sendVerifyPanel(i.channel);
      return i.editReply({ content: '✅ تم إرسال رسالة التحقق.' });
    },
  },
];
