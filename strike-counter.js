const STRIKE_LIMIT = 3;
const STRIKE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function addStrike(config, userId, now = Date.now()) {
  if (!config.strikes || typeof config.strikes !== 'object') config.strikes = {};
  const cutoff = now - STRIKE_WINDOW_MS;

  // Prune expired strikes from every member so the per-guild config stays bounded.
  for (const [id, timestamps] of Object.entries(config.strikes)) {
    const recent = Array.isArray(timestamps)
      ? timestamps.filter(timestamp => Number.isFinite(timestamp) && timestamp > cutoff && timestamp <= now)
      : [];
    if (recent.length) config.strikes[id] = recent;
    else delete config.strikes[id];
  }

  const timestamps = config.strikes[userId] || [];
  timestamps.push(now);
  config.strikes[userId] = timestamps;
  return timestamps.length;
}

module.exports = { addStrike, STRIKE_LIMIT, STRIKE_WINDOW_MS };
