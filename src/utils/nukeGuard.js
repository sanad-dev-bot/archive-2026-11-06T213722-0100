const { stripMember } = require('./incidentSystem');
const { isTrusted } = require('./trust');
const { findInvoker } = require('./botAttribution');
const { getGuildConfig, getLogChannel } = require('./storage');

const WINDOW_MS = 60_000;
// limit = hits inside one minute that trigger the protection (amount can be > 1, e.g. a bulk delete of 30 messages)
const RULES = {
  bulk: { limit: 10, reason: 'حذف رسايل كتير مرة واحدة' },
  messages: { limit: 5, reason: 'حذف رسايل أعضاء تانيين كتير' },
  channels: { limit: 2, reason: 'حذف أكتر من روم' },
  roles: { limit: 2, reason: 'حذف أكتر من رتبة' },
  webhooks: { limit: 2, reason: 'حذف أكتر من Webhook' },
  webhookCreate: { limit: 3, reason: 'عمل Webhooks كتير' },
  channelCreate: { limit: 5, reason: 'عمل رومات كتير ورا بعض' },
  roleCreate: { limit: 5, reason: 'عمل رتب كتير ورا بعض' },
  expressions: { limit: 2, reason: 'حذف إيموجي أو ستيكرز كتير' },
  bans: { limit: 3, reason: 'حظر أعضاء كتير في وقت قصير' },
  kicks: { limit: 3, reason: 'طرد أعضاء كتير في وقت قصير' },
  timeouts: { limit: 5, reason: 'إسكات أعضاء كتير في وقت قصير' },
  prune: { limit: 1, reason: 'طرد جماعي (Prune)' },
  dangerGrant: { limit: 1, reason: 'إدّى صلاحية Administrator أو صلاحيات خطيرة من غير الأونر' },
  overwrites: { limit: 12, reason: 'غيّر صلاحيات رومات كتير ورا بعض' },
  roleEdits: { limit: 10, reason: 'شال أو إدّى رتب لأعضاء كتير ورا بعض' },
  botAdd: { limit: 1, reason: 'دخّل بوت للسيرفر من غير الأونر أو الكو أونر' },
};

// A bot nobody can be found behind is only charged for real damage, with room for normal bot work
// (ticket and temp-voice bots delete channels, automod bots purge and time out all day)
const BOT_LIMITS = { bans: 10, kicks: 10, prune: 1, dangerGrant: 1, roles: 3, channels: 6, webhooks: 4, expressions: 5 };

const counts = new Map();

function addHits(id, amount) {
  const now = Date.now();
  const recent = (counts.get(id) || []).filter(hit => now - hit.at < WINDOW_MS);
  recent.push({ at: now, amount });
  counts.set(id, recent);
  return recent.reduce((total, hit) => total + hit.amount, 0);
}

// Someone who acted and then left cannot be stripped: they are banned by id instead, and the owner is told
async function banGone(guild, userId, rule) {
  await guild.bans.create(userId, { reason: 'Protection: ' + rule.reason + ' (left the server)' }).catch(() => {});
  const log = await getLogChannel(guild);
  await log?.send({ content: '🚨 <@' + userId + '> عمل حركة خطيرة (' + rule.reason + ') وخرج من السيرفر، فاتحظر.', allowedMentions: { parse: [] } }).catch(() => {});
}

// Counts an action for whoever is really behind it. Sanad's own commands call this with the command author,
// because Discord logs those under Sanad's name. Owner and co-owner are exempt; Administrators are NOT.
async function trackAction(guild, userId, ruleKey, amount = 1) {
  const rule = RULES[ruleKey];
  if (!rule || !userId || userId === guild.client.user.id) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member?.user.bot) {
    if ((getGuildConfig(guild.id).trusted_bots || []).includes(member.id) || !BOT_LIMITS[ruleKey]) return false;
  } else if (member && isTrusted(member)) {
    return false;
  }

  const limit = member?.user.bot ? BOT_LIMITS[ruleKey] : rule.limit;
  const id = guild.id + ':' + userId + ':' + ruleKey;
  if (addHits(id, amount) < limit) return false;
  counts.delete(id);
  if (!member) {
    await banGone(guild, userId, rule);
    return true;
  }
  await stripMember(guild, member, rule.reason + (member.user.bot ? ' (ومفيش حد معروف شغّل البوت)' : ''))
    .catch(err => console.error('[PROTECTION]', err.message));
  return true;
}

// Called BEFORE Sanad acts for someone, so a scripted burst cannot get through while the strip is running.
// The action that reaches the limit still goes through (and triggers the protection); everything after it is refused.
const frozen = new Map(); // guildId:userId -> until
function reserve(guild, member, ruleKey) {
  const rule = RULES[ruleKey];
  if (!rule || isTrusted(member)) return true;
  const key = guild.id + ':' + member.id;
  if ((frozen.get(key) || 0) > Date.now()) return false;
  const total = addHits(key + ':' + ruleKey, 1);
  if (total < rule.limit) return true;
  frozen.set(key, Date.now() + 10 * 60_000);
  counts.delete(key + ':' + ruleKey);
  stripMember(guild, member, rule.reason).catch(err => console.error('[PROTECTION]', err.message));
  return total === rule.limit;
}

function isFrozen(guildId, userId) {
  return (frozen.get(guildId + ':' + userId) || 0) > Date.now();
}

function unfreeze(guildId, userId) {
  frozen.delete(guildId + ':' + userId);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Who ran the bot? Its reply usually lands within a few seconds; look again later for slow replies.
async function resolveInvoker(guild, botId, ruleKey, hint = {}) {
  const at = Date.now();
  await wait(4000);
  let invoker = findInvoker(guild.id, botId, at, { ...hint, rule: ruleKey });
  if (!invoker) {
    await wait(8000);
    invoker = findInvoker(guild.id, botId, at, { ...hint, rule: ruleKey });
  }
  return invoker;
}

// Another bot did it: charge the person who ran it, or the bot itself.
async function trackBotAction(guild, botId, ruleKey, amount, hint = {}) {
  const invoker = await resolveInvoker(guild, botId, ruleKey, hint);
  return trackAction(guild, invoker || botId, ruleKey, amount);
}

module.exports = { trackAction, trackBotAction, resolveInvoker, reserve, isFrozen, unfreeze, RULES, BOT_LIMITS };
