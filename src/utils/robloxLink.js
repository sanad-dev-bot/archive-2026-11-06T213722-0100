const LOOKUP_TIMEOUT_MS = 8000;

/**
 * Asks Bloxlink which Roblox account a Discord member linked.
 * @returns {Promise<{state: 'disabled'|'linked'|'unlinked'|'error', robloxId?: string}>}
 */
async function lookupRoblox(guildId, userId) {
  const key = process.env.BLOXLINK_API_KEY;
  if (!key) return { state: 'disabled' };

  try {
    const res = await fetch('https://api.blox.link/v4/public/guilds/' + guildId + '/discord-to-roblox/' + userId, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.status === 404) return { state: 'unlinked' };
    if (!res.ok) {
      console.error('[ROBLOX] Bloxlink answered', res.status);
      return { state: 'error' };
    }
    const data = await res.json();
    return data.robloxID ? { state: 'linked', robloxId: String(data.robloxID) } : { state: 'unlinked' };
  } catch (err) {
    console.error('[ROBLOX] Lookup failed:', err.message);
    return { state: 'error' };
  }
}

module.exports = { lookupRoblox };
