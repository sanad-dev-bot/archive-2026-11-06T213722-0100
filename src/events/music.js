const { players, leave } = require('../utils/music');

const EMPTY_MS = 2 * 60_000;
const timers = new Map(); // guildId -> timer

const humansWithBot = guild => {
  const room = guild.members.me?.voice?.channel;
  return room ? room.members.filter(m => !m.user.bot).size : 0;
};

// Nobody left listening: pause, and leave after two minutes unless someone comes back
module.exports = {
  name: 'voiceStateUpdate',
  async execute(client, oldState, newState) {
    const guild = newState.guild;
    const st = players.get(guild.id);
    if (!st?.current) return;
    const humans = humansWithBot(guild);

    if (humans === 0 && !timers.has(guild.id)) {
      if (st.player.pause()) st.autoPaused = true;
      timers.set(guild.id, setTimeout(() => {
        timers.delete(guild.id);
        if (humansWithBot(guild) === 0) leave(guild, 'idle').catch(err => console.error('[MUSIC] leave:', err.message));
      }, EMPTY_MS));
    } else if (humans > 0 && timers.has(guild.id)) {
      clearTimeout(timers.get(guild.id));
      timers.delete(guild.id);
      if (st.autoPaused) st.player.unpause();
      st.autoPaused = false;
    }
  },
};
