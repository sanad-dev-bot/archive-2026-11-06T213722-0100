const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getAutoReplies, setAutoReply, deleteAutoReply } = require('../../utils/storage');

function reply(i, content, ephemeral = false) {
  return i.reply({ content, ephemeral });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('addautoreply')
      .setDescription('إضافة رد تلقائي لكلمة')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('word').setDescription('كلمة').setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName('reply').setDescription('الرد').setRequired(true).setMaxLength(1900)),
    async execute(i) {
      const word = i.options.getString('word', true).trim();
      const response = i.options.getString('reply', true).trim();
      if (!word || !response) return reply(i, 'اكتب الكلمة والرد.', true);
      setAutoReply(i.guild.id, word, response);
      return reply(i, `تمت إضافة الرد التلقائي للكلمة: ${word}`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('removeautoreply')
      .setDescription('حذف رد تلقائي')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('word').setDescription('الكلمة المراد حذف ردها').setRequired(true).setMaxLength(80)),
    async execute(i) {
      const word = i.options.getString('word', true).trim();
      return reply(i, deleteAutoReply(i.guild.id, word) ? `تم حذف الرد التلقائي للكلمة: ${word}` : `لا يوجد رد تلقائي للكلمة: ${word}`, !getAutoReplies(i.guild.id)[word.toLowerCase()]);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('autoreplies')
      .setDescription('عرض جميع الردود التلقائية')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const entries = Object.entries(getAutoReplies(i.guild.id));
      if (!entries.length) return reply(i, 'لا توجد ردود تلقائية حالياً.');
      const lines = entries.map(([word, response]) => `**${word}** → ${String(response).replace(/\n/g, ' ').slice(0, 180)}`);
      return reply(i, `**الردود التلقائية**\n\n${lines.join('\n')}`);
    },
  },
];
