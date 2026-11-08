const { getAutoReplies } = require('../utils/storage');

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (!message.guild || message.author.bot) return;
    const replies = getAutoReplies(message.guild.id);
    if (!Object.keys(replies).length) return;
    const text = message.content.trim().toLowerCase();
    if (!text) return;
    const response = replies[text];
    if (!response) return;
    await message.reply({ content: response, allowedMentions: { parse: [] } }).catch(() => {});
  },
};
