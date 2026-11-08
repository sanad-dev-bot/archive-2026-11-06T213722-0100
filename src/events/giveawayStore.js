const path = require('path');
const { activeGiveaways } = require('../utils/state');
const { loadJSON, saveJSON } = require('../utils/storage');

const FILE = path.join(process.cwd(), 'data', 'giveaways.json');
const SAVE_MS = 15_000;

function save() {
  const data = {};
  for (const [msgId, ga] of activeGiveaways) {
    const { timeout, ...plain } = ga;
    data[msgId] = plain;
  }
  saveJSON(FILE, data);
}

// Giveaways live in memory, so they are saved to disk to survive restarts
module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    const { endGiveaway } = require('../commands/systems/giveaway');

    for (const [msgId, ga] of Object.entries(loadJSON(FILE))) {
      const channel = await client.channels.fetch(ga.channelId).catch(() => null);
      if (!channel) continue;
      const restored = { ...ga, timeout: null };
      activeGiveaways.set(msgId, restored);
      if (!ga.paused) {
        restored.timeout = setTimeout(() => endGiveaway(msgId, channel), Math.max(ga.endsAt - Date.now(), 1000));
      }
    }

    setInterval(save, SAVE_MS);
    process.once('SIGTERM', save);
  },
};
