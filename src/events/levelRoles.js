const { syncLevelRole } = require('../utils/levelRoles');

const SWEEP_MS = 600_000;

// Catches level changes that skip the XP flow, like /setxp and /resetxp
async function sweep(client) {
  for (const [, guild] of client.guilds.cache) {
    const members = await guild.members.fetch();
    for (const [, member] of members) await syncLevelRole(member).catch(() => {});
  }
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    const run = () => sweep(client).catch(err => console.error('[LEVEL ROLES]', err.message));
    await run();
    setInterval(run, SWEEP_MS);
  },
};
