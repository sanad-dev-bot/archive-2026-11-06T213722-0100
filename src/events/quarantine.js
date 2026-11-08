const { onChannelCreate } = require('../utils/jail');
const { rejail } = require('../utils/incidentSystem');

module.exports = [
  // New rooms stay hidden from anyone in quarantine
  {
    name: 'channelCreate',
    async execute(client, channel) {
      await onChannelCreate(channel).catch(err => console.error('[QUARANTINE]', err.message));
    },
  },
  // Leaving and rejoining does not get someone out of a review
  {
    name: 'guildMemberAdd',
    async execute(client, member) {
      await rejail(member).catch(err => console.error('[QUARANTINE] rejoin:', err.message));
    },
  },
];
