const { saveReport } = require('../utils/securityScan');

// One scan per server shortly after start-up, saved to data/security-scan-<id>.json for the bot's maintainer
module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    setTimeout(async () => {
      for (const guild of client.guilds.cache.values()) {
        await saveReport(guild).catch(err => console.error('[SECURITY SCAN] ' + guild.id + ':', err.message));
      }
      console.log('[SECURITY SCAN] saved for ' + client.guilds.cache.size + ' servers');
    }, 20_000);
  },
};
