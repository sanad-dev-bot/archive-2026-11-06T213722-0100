const fs   = require('fs');
const path = require('path');

const WARNS_FILE  = path.join(process.cwd(), 'warns.json');
const CONFIG_FILE = path.join(process.cwd(), 'config.json');

// A broken file is kept aside (once) instead of being silently replaced by {} on the next save
const keptAside = new Set();
function loadJSON(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  try { return JSON.parse(raw); } catch (err) {
    if (!keptAside.has(file)) {
      keptAside.add(file);
      const aside = file + '.corrupt-' + Date.now();
      try { fs.copyFileSync(file, aside); } catch {}
      console.error('[STORAGE] ' + path.basename(file) + ' was unreadable, copy kept at ' + path.basename(aside) + ':', err.message);
    }
    return {};
  }
}

// A crash mid-write must never leave a half-written file
function saveJSON(file, data) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

// ── Warns helpers ────────────────────────────────────────────────
function getWarns(guildId, userId) {
  const d = loadJSON(WARNS_FILE);
  return d?.[guildId]?.[userId] || [];
}

function addWarn(guildId, userId, entry) {
  const d = loadJSON(WARNS_FILE);
  if (!d[guildId])         d[guildId]         = {};
  if (!d[guildId][userId]) d[guildId][userId] = [];
  d[guildId][userId].push(entry);
  saveJSON(WARNS_FILE, d);
  return d[guildId][userId].length;
}

function clearWarns(guildId, userId) {
  const d = loadJSON(WARNS_FILE);
  if (d[guildId]) delete d[guildId][userId];
  saveJSON(WARNS_FILE, d);
}

function removeWarn(guildId, userId, index) {
  const d = loadJSON(WARNS_FILE);
  if (!d[guildId]?.[userId]) return false;
  d[guildId][userId].splice(index, 1);
  saveJSON(WARNS_FILE, d);
  return true;
}

// ── Config helpers ───────────────────────────────────────────────
function getGuildConfig(guildId) {
  return loadJSON(CONFIG_FILE)[guildId] || {};
}

function setGuildConfig(guildId, key, value) {
  const d = loadJSON(CONFIG_FILE);
  if (!d[guildId]) d[guildId] = {};
  d[guildId][key] = value;
  saveJSON(CONFIG_FILE, d);
}

function deleteGuildConfigKey(guildId, key) {
  const d = loadJSON(CONFIG_FILE);
  if (d[guildId]) delete d[guildId][key];
  saveJSON(CONFIG_FILE, d);
}

async function getLogChannel(guild) {
  const cfg = getGuildConfig(guild.id);
  return cfg.log_channel ? guild.channels.cache.get(cfg.log_channel) : null;
}

module.exports = {
  loadJSON, saveJSON,
  getWarns, addWarn, clearWarns, removeWarn,
  getGuildConfig, setGuildConfig, deleteGuildConfigKey,
  getLogChannel,
};

// ── XP / Leveling helpers ────────────────────────────────────────
const XP_FILE = path.join(process.cwd(), 'data', 'xp.json');
const XP_PER_LEVEL = 150;

function loadXP() {
  return loadJSON(XP_FILE);
}
function saveXP(d) {
  fs.mkdirSync(path.dirname(XP_FILE), { recursive: true });
  saveJSON(XP_FILE, d);
}

function xpToLevel(xp) {
  return Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL) + 1;
}
function levelToXP(lvl) {
  return Math.max(0, (Math.max(1, Number(lvl) || 1) - 1) * XP_PER_LEVEL);
}
function xpForNextLevel(lvl) {
  return Math.max(1, Number(lvl) || 1) * XP_PER_LEVEL;
}

function normalizeXPMember(member) {
  if (!member) return { textXp: 0, voiceXp: 0, xp: 0, messages: 0, lastXp: 0 };
  // Keep old xp data usable as text XP when upgrading this project.
  if (member.textXp == null) member.textXp = Number(member.xp) || 0;
  if (member.voiceXp == null) member.voiceXp = 0;
  member.textXp = Math.max(0, Number(member.textXp) || 0);
  member.voiceXp = Math.max(0, Number(member.voiceXp) || 0);
  member.xp = member.textXp + member.voiceXp;
  member.level = xpToLevel(member.xp);
  member.messages = Number(member.messages) || 0;
  member.lastXp = Number(member.lastXp) || 0;
  if (!Array.isArray(member.history)) member.history = [];
  return member;
}

function getMember(guildId, userId) {
  const d = loadXP();
  if (!d[guildId]) d[guildId] = {};
  if (!d[guildId][userId]) {
    d[guildId][userId] = { textXp: 0, voiceXp: 0, xp: 0, level: 1, messages: 0, lastXp: 0 };
  }
  normalizeXPMember(d[guildId][userId]);
  return { data: d, member: d[guildId][userId] };
}

function saveMemberXP(guildId, userId, updater) {
  const { data, member } = getMember(guildId, userId);
  const oldLevel = xpToLevel(member.xp);
  updater(member);
  normalizeXPMember(member);
  const newLevel = xpToLevel(member.xp);
  saveXP(data);
  return {
    textXp: member.textXp,
    voiceXp: member.voiceXp,
    xp: member.xp,
    level: newLevel,
    leveled: newLevel > oldLevel,
    oldLevel,
  };
}

// The top lists look back 30 days at most; older entries only made xp.json grow on every message
const HISTORY_MS = 32 * 24 * 60 * 60 * 1000;
function trimHistory(member) {
  const since = Date.now() - HISTORY_MS;
  if (member.history.length && member.history[0].at < since) member.history = member.history.filter(e => e.at >= since);
  if (member.history.length > 5000) member.history.splice(0, member.history.length - 5000);
}

function addTextXP(guildId, userId, amount = 10) {
  return saveMemberXP(guildId, userId, member => {
    const value = Math.max(0, Number(amount) || 0);
    member.textXp += value;
    member.messages += 1;
    member.lastXp = Date.now();
    if (value > 0) {
      member.history.push({ type: 'text', amount: value, at: Date.now() });
      trimHistory(member);
    }
  });
}

function addVoiceXP(guildId, userId, amount = 5) {
  return saveMemberXP(guildId, userId, member => {
    const value = Math.max(0, Number(amount) || 0);
    member.voiceXp += value;
    member.lastXp = Date.now();
    if (value > 0) {
      member.history.push({ type: 'voice', amount: value, at: Date.now() });
      trimHistory(member);
    }
  });
}

// Backwards-compatible helper.
function addXP(guildId, userId, amount) {
  return addTextXP(guildId, userId, amount);
}

function getXP(guildId, userId) {
  return getMember(guildId, userId).member;
}

function setXP(guildId, userId, xp) {
  const { data, member } = getMember(guildId, userId);
  member.textXp = Math.max(0, Number(xp) || 0);
  member.voiceXp = 0;
  normalizeXPMember(member);
  saveXP(data);
  return member;
}

function resetXP(guildId, userId) {
  const d = loadXP();
  if (d[guildId]?.[userId]) {
    d[guildId][userId] = { textXp: 0, voiceXp: 0, xp: 0, level: 1, messages: 0, lastXp: 0 };
    saveXP(d);
  }
}

function getLeaderboard(guildId, limit = 10) {
  const d = loadXP()[guildId] || {};
  return Object.entries(d)
    .map(([userId, raw]) => {
      const m = normalizeXPMember(raw);
      return {
        userId,
        xp: m.xp,
        textXp: m.textXp,
        voiceXp: m.voiceXp,
        level: m.level,
        messages: m.messages,
      };
    })
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

function getTopXP(guildId, type = 'all', period = 'all', limit = 5) {
  const d = loadXP()[guildId] || {};
  const now = Date.now();
  const starts = {
    day: now - 24 * 60 * 60 * 1000,
    week: now - 7 * 24 * 60 * 60 * 1000,
    month: now - 30 * 24 * 60 * 60 * 1000,
  };
  const since = starts[period] || 0;

  return Object.entries(d).map(([userId, raw]) => {
    const m = normalizeXPMember(raw);
    let textXp = m.textXp;
    let voiceXp = m.voiceXp;
    if (period !== 'all') {
      textXp = 0; voiceXp = 0;
      for (const e of m.history) {
        if (!e || Number(e.at) < since) continue;
        const amount = Math.max(0, Number(e.amount) || 0);
        if (e.type === 'text') textXp += amount;
        if (e.type === 'voice') voiceXp += amount;
      }
    }
    const xp = type === 'text' ? textXp : type === 'voice' ? voiceXp : textXp + voiceXp;
    return { userId, xp, textXp, voiceXp, level: m.level, messages: m.messages };
  }).filter(x => x.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

function getRankPosition(guildId, userId) {
  const all = getLeaderboard(guildId, Number.MAX_SAFE_INTEGER);
  const index = all.findIndex(x => x.userId === userId);
  return index === -1 ? 1 : index + 1;
}

// ── Modlog helpers ────────────────────────────────────────────────
const MOD_FILE = path.join(process.cwd(), 'data', 'modlogs.json');

function loadModlogs() {
  return loadJSON(MOD_FILE);
}
function saveModlogs(d) {
  fs.mkdirSync(path.dirname(MOD_FILE), { recursive: true });
  saveJSON(MOD_FILE, d);
}

function addModlog(guildId, targetId, entry) {
  const d = loadModlogs();
  if (!d[guildId])           d[guildId]           = {};
  if (!d[guildId][targetId]) d[guildId][targetId] = [];
  entry.id = (d[guildId][targetId].length + 1);
  d[guildId][targetId].push(entry);
  saveModlogs(d);
  return entry.id;
}

function getModlogs(guildId, userId) {
  return loadModlogs()[guildId]?.[userId] || [];
}

function clearModlogs(guildId, userId) {
  const d = loadModlogs();
  if (d[guildId]?.[userId]) { delete d[guildId][userId]; saveModlogs(d); }
}


// ── Message command shortcuts ─────────────────────────────────────────────
const SHORTCUTS_FILE = path.join(process.cwd(), 'data', 'shortcuts.json');
function loadShortcuts() {
  return loadJSON(SHORTCUTS_FILE);
}
function saveShortcuts(d) {
  fs.mkdirSync(path.dirname(SHORTCUTS_FILE), { recursive: true });
  saveJSON(SHORTCUTS_FILE, d);
}
function getShortcuts(guildId) {
  return loadShortcuts()[guildId] || {};
}
function setShortcut(guildId, shortcut, command) {
  const d = loadShortcuts();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][shortcut] = command;
  saveShortcuts(d);
}
function deleteShortcut(guildId, shortcut) {
  const d = loadShortcuts();
  if (d[guildId]) {
    delete d[guildId][shortcut];
    saveShortcuts(d);
  }
}
function clearShortcuts(guildId) {
  const d = loadShortcuts();
  if (d[guildId]) {
    delete d[guildId];
    saveShortcuts(d);
  }
}

module.exports = Object.assign(module.exports, {
  loadXP, saveXP, addXP, addTextXP, addVoiceXP, getXP, setXP, resetXP, getLeaderboard, getRankPosition,
  xpToLevel, levelToXP, xpForNextLevel, getTopXP,
  addModlog, getModlogs, clearModlogs,
});

// ── Command Roles helpers ─────────────────────────────────────────────────
const CMDROLES_FILE = path.join(process.cwd(), 'data', 'cmdroles.json');

function loadCmdRoles() {
  return loadJSON(CMDROLES_FILE);
}
function saveCmdRoles(d) {
  fs.mkdirSync(path.dirname(CMDROLES_FILE), { recursive: true });
  saveJSON(CMDROLES_FILE, d);
}

/** Get all role overrides for a guild */
function getCmdRoles(guildId) {
  return loadCmdRoles()[guildId] || {};
}

/** Get allowed roles for a specific command (array of role IDs) */
function getCmdRole(guildId, cmdName) {
  return loadCmdRoles()[guildId]?.[cmdName] || [];
}

/** Set allowed roles for a command */
function setCmdRole(guildId, cmdName, roleIds) {
  const d = loadCmdRoles();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][cmdName] = roleIds;
  saveCmdRoles(d);
}

/** Remove all role overrides for a command */
function deleteCmdRole(guildId, cmdName) {
  const d = loadCmdRoles();
  if (d[guildId]?.[cmdName]) { delete d[guildId][cmdName]; saveCmdRoles(d); }
}

/** Clear all role overrides for a guild */
function clearCmdRoles(guildId) {
  const d = loadCmdRoles();
  if (d[guildId]) { delete d[guildId]; saveCmdRoles(d); }
}

// Administrator, Manage Server, Manage Roles, Manage Channels, Ban, Kick, Timeout, Manage Messages
const STAFF_PERMS = 0x8n | 0x20n | 0x10000000n | 0x10n | 0x4n | 0x2n | 0x10000000000n | 0x2000n;

/**
 * Check if a member can use a command:
 * 1. Admins always pass
 * 2. If command has role overrides → member must have one of them, or a staff role ranked at or above the lowest one
 * 3. If no overrides → fall through to the command's own permission checks
 * Returns: { allowed: bool, reason: string|null }
 */
function checkCmdRole(guildId, member, cmdName) {
  if (!member) return { allowed: false, reason: 'no_member' };
  // Administrators always bypass
  if (member.permissions.has(0x8n)) return { allowed: true, reason: null };

  const roles = getCmdRole(guildId, cmdName);
  if (!roles.length) return { allowed: true, reason: null }; // no override → normal flow

  const hasRole = roles.some(id => member.roles.cache.has(id));
  if (hasRole) return { allowed: true, reason: null };

  // A promotion must not lose access: any staff role placed at or above the lowest allowed role passes too
  const listed = roles.map(id => member.guild.roles.cache.get(id)).filter(Boolean);
  if (listed.length) {
    const floor = Math.min(...listed.map(r => r.position));
    const promoted = member.roles.cache.some(r => r.id !== member.guild.id && !r.managed
      && r.position >= floor && (r.permissions.bitfield & STAFF_PERMS) !== 0n);
    if (promoted) return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason:  roles.map(id => `<@&${id}>`).join(', '),
  };
}

module.exports = Object.assign(module.exports, {
  getCmdRoles, getCmdRole, setCmdRole, deleteCmdRole, clearCmdRoles, checkCmdRole,
  getShortcuts, setShortcut, deleteShortcut, clearShortcuts,
});

// ── Auto-line helpers ──────────────────────────────────────────────────────
const AUTOLINE_FILE = path.join(process.cwd(), 'data', 'autoline.json');

function loadAutoLine() {
  return loadJSON(AUTOLINE_FILE);
}

function saveAutoLine(d) {
  fs.mkdirSync(path.dirname(AUTOLINE_FILE), { recursive: true });
  saveJSON(AUTOLINE_FILE, d);
}

function getAutoLineConfig(guildId) {
  const d = loadAutoLine();
  const cfg = d[guildId] || {};
  return {
    image: typeof cfg.image === 'string' ? cfg.image : null,
    channels: Array.isArray(cfg.channels) ? cfg.channels : [],
  };
}

function setAutoLineImage(guildId, image) {
  const d = loadAutoLine();
  if (!d[guildId]) d[guildId] = { image: null, channels: [] };
  d[guildId].image = image;
  if (!Array.isArray(d[guildId].channels)) d[guildId].channels = [];
  saveAutoLine(d);
}

function addAutoLineChannel(guildId, channelId) {
  const d = loadAutoLine();
  if (!d[guildId]) d[guildId] = { image: null, channels: [] };
  if (!Array.isArray(d[guildId].channels)) d[guildId].channels = [];
  if (!d[guildId].channels.includes(channelId)) d[guildId].channels.push(channelId);
  saveAutoLine(d);
  return d[guildId].channels;
}

function removeAutoLineChannel(guildId, channelId) {
  const d = loadAutoLine();
  if (!d[guildId]) return false;
  const before = Array.isArray(d[guildId].channels) ? d[guildId].channels.length : 0;
  d[guildId].channels = (d[guildId].channels || []).filter(id => id !== channelId);
  saveAutoLine(d);
  return d[guildId].channels.length < before;
}

module.exports = Object.assign(module.exports, {
  getAutoLineConfig, setAutoLineImage, addAutoLineChannel, removeAutoLineChannel,
});

// ── Auto-reply helpers ─────────────────────────────────────────────────────
const AUTOREPLY_FILE = path.join(process.cwd(), 'data', 'autoreplies.json');
function loadAutoReplies() {
  return loadJSON(AUTOREPLY_FILE);
}
function saveAutoReplies(d) {
  fs.mkdirSync(path.dirname(AUTOREPLY_FILE), { recursive: true });
  saveJSON(AUTOREPLY_FILE, d);
}
function getAutoReplies(guildId) {
  return loadAutoReplies()[guildId] || {};
}
function setAutoReply(guildId, trigger, response) {
  const d = loadAutoReplies();
  if (!d[guildId]) d[guildId] = {};
  d[guildId][trigger.toLowerCase()] = response;
  saveAutoReplies(d);
}
function deleteAutoReply(guildId, trigger) {
  const d = loadAutoReplies();
  if (!d[guildId]) return false;
  const key = trigger.toLowerCase();
  if (!(key in d[guildId])) return false;
  delete d[guildId][key];
  saveAutoReplies(d);
  return true;
}
module.exports = Object.assign(module.exports, { getAutoReplies, setAutoReply, deleteAutoReply });
