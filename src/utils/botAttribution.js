// Finds the human behind an action another bot (Dyno, Carl-bot, ...) did. Discord's audit log names the bot,
// so Sanad watches who invoked that bot: slash replies carry the invoker, prefix commands are plain messages.
const WINDOW_BEFORE = 45_000;
const WINDOW_AFTER = 15_000;
const KEEP_MS = 120_000;

const PREFIX_RE = /^[!?.\-+$%&,;:>~=*^/\\]{1,2}\s*(ban|kick|softban|hackban|massban|multiban|purge|clear|clean|prune|nuke|mute|timeout|tempban|deletechannel|delrole|delchannel)\b/i;

// The command words that can explain each kind of action
const RULE_CMD = {
  bans: /ban/i,
  kicks: /kick/i,
  prune: /prune|kick/i,
  timeouts: /mute|timeout|warn|strike|punish/i,
  bulk: /purge|clear|clean|prune|nuke/i,
  messages: /purge|clear|clean|delete/i,
  channels: /channel|nuke|delete/i,
  roles: /role|delete/i,
  dangerGrant: /role/i,
};

const MOD_CMD = /ban|kick|purge|clear|clean|prune|nuke|mute|timeout|role|channel|delete/i;

const invokes = new Map(); // guildId -> [{ at, botId, userId, cmd, channelId, targets }]

function note(guildId, entry) {
  const now = Date.now();
  const list = (invokes.get(guildId) || []).filter(e => now - e.at < KEEP_MS);
  list.push(entry);
  invokes.set(guildId, list.slice(-200));
}

function targetsIn(message) {
  const ids = new Set(message.mentions?.users?.keys?.() || []);
  for (const m of message.content.matchAll(/\b(\d{17,20})\b/g)) ids.add(m[1]);
  return [...ids];
}

// Called for every guild message
function observeMessage(client, message) {
  if (!message.guild) return;
  if (message.author.bot) {
    if (message.author.id === client.user.id) return;
    const user = message.interactionMetadata?.user || message.interaction?.user;
    if (!user || user.bot) return;
    note(message.guild.id, {
      at: Date.now(), botId: message.author.id, userId: user.id,
      cmd: message.interaction?.commandName || '', channelId: message.channelId, targets: targetsIn(message),
    });
    return;
  }
  const match = message.content.match(PREFIX_RE);
  if (!match) return;
  note(message.guild.id, {
    at: Date.now(), botId: '*', userId: message.author.id, cmd: match[1].toLowerCase(),
    channelId: message.channelId, targets: targetsIn(message),
  });
}

// at = when the bot acted. targetId / channelId come from the audit entry, rule says what kind of action it was.
// A match needs either the same target (or room, for purges) or a command word that explains this exact action.
function findInvoker(guildId, botId, at, { targetId, channelId, rule } = {}) {
  const near = (invokes.get(guildId) || []).filter(e => e.at >= at - WINDOW_BEFORE && e.at <= at + WINDOW_AFTER);
  const cmdFits = e => Boolean(e.cmd) && (RULE_CMD[rule] || MOD_CMD).test(e.cmd);
  const targetFits = e => (targetId ? e.targets.includes(targetId) : Boolean(channelId) && e.channelId === channelId);
  const fits = e => {
    if (e.botId !== botId && e.botId !== '*') return false;
    if (e.botId === '*') return targetFits(e) && cmdFits(e);
    // The bot's own reply names who ran it: trust it if it points at the same target or the command explains it
    return targetFits(e) || (cmdFits(e) && e.targets.length === 0);
  };
  const score = e => (e.botId === botId ? 0 : 2) + (targetFits(e) ? 0 : 1);
  const hits = near.filter(fits).sort((a, b) => score(a) - score(b) || Math.abs(a.at - at) - Math.abs(b.at - at));
  return hits[0]?.userId || null;
}

module.exports = { observeMessage, findInvoker, PREFIX_RE };
