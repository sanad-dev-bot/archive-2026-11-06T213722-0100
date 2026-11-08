const { textFor, langFor, primaryGuildId } = require('../utils/i18n');
const { restoreStayVoices } = require('../utils/voiceStay');
const { ActivityType } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    console.log('[READY] Logged in as ' + client.user.tag);
    console.log('[READY] Serving ' + client.guilds.cache.size + ' guild(s)');
    console.log('[READY] ' + client.commands.size + ' commands loaded');

    // Restore configured voice-stay rooms after every restart.
    await restoreStayVoices(client);

    client.user.setActivity(textFor(langFor(primaryGuildId()), 'دايمًا في ضهرك'), { type: ActivityType.Custom });
  },
};
