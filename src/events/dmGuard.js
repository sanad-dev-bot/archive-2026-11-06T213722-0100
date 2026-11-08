const { dmNotice } = require('../utils/dmNotice');

const WINDOW_MS = 30_000;
const SPAM_LIMIT = 5;
const SILENCE_MS = 60 * 60_000;
const REPLY_GAP_MS = 60_000;

const users = new Map(); // userId -> { hits, lastReply, silentUntil }

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (message.guild || message.author.bot) return;

    const now = Date.now();
    if (users.size > 5000) users.clear();
    const state = users.get(message.author.id) || { hits: [], lastReply: 0, silentUntil: 0 };
    users.set(message.author.id, state);
    if (state.silentUntil > now) return;

    state.hits = state.hits.filter(t => now - t < WINDOW_MS);
    state.hits.push(now);

    try {
      if (state.hits.length >= SPAM_LIMIT) {
        state.silentUntil = now + SILENCE_MS;
        state.hits = [];
        await message.author.send('⛔ بعت رسايل كتير، ومش هرد عليك لمدة ساعة.');
        return;
      }
      if (now - state.lastReply < REPLY_GAP_MS) return;
      state.lastReply = now;
      await message.author.send(dmNotice());
    } catch (err) {
      console.warn('[DM GUARD]', err.message);
    }
  },
};
