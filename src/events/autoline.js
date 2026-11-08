const { getAutoLineConfig } = require('../utils/storage');

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (!message.guild || message.author.bot) return;

    const cfg = getAutoLineConfig(message.guild.id);
    if (!cfg.image || !cfg.channels.includes(message.channel.id)) return;

    try {
      await message.channel.send({
        files: [{ attachment: cfg.image, name: 'autoline.png' }],
      });
    } catch (err) {
      console.error('[AUTOLINE ERROR]', err.message);
    }
  },
};
