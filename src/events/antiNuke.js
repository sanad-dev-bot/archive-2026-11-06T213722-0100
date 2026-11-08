const { AuditLogEvent, PermissionFlagsBits: P } = require('discord.js');
const { trackAction, trackBotAction, resolveInvoker } = require('../utils/nukeGuard');
const { observeMessage } = require('../utils/botAttribution');
const { isTrusted } = require('../utils/trust');

const SIMPLE = {
  [AuditLogEvent.MessageBulkDelete]: 'bulk',
  [AuditLogEvent.ChannelDelete]: 'channels',
  [AuditLogEvent.ChannelCreate]: 'channelCreate',
  [AuditLogEvent.RoleDelete]: 'roles',
  [AuditLogEvent.RoleCreate]: 'roleCreate',
  [AuditLogEvent.WebhookDelete]: 'webhooks',
  [AuditLogEvent.WebhookCreate]: 'webhookCreate',
  [AuditLogEvent.EmojiDelete]: 'expressions',
  [AuditLogEvent.StickerDelete]: 'expressions',
  [AuditLogEvent.MemberBanAdd]: 'bans',
  [AuditLogEvent.MemberKick]: 'kicks',
  [AuditLogEvent.MemberPrune]: 'prune',
  [AuditLogEvent.ChannelOverwriteCreate]: 'overwrites',
  [AuditLogEvent.ChannelOverwriteUpdate]: 'overwrites',
  [AuditLogEvent.ChannelOverwriteDelete]: 'overwrites',
};

// Granting these through a role is how a nuke gets prepared
const DANGER = P.Administrator | P.BanMembers | P.KickMembers | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.ManageWebhooks;

function change(entry, key) {
  return entry.changes?.find(c => c.key === key);
}

// Is this a dangerous grant? Returns how to undo it, or null. Undoing waits until we know who is behind it,
// so an owner granting through another bot is not reverted.
function dangerousGrant(guild, entry) {
  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const added = change(entry, '$add')?.new || [];
    const bad = added.map(r => guild.roles.cache.get(r.id)).filter(r => r && (r.permissions.bitfield & P.Administrator));
    if (!bad.length) return null;
    return async () => {
      const target = await guild.members.fetch(entry.targetId).catch(() => null);
      if (target) await target.roles.remove(bad.filter(r => r.editable), 'Protection: Administrator role given by a non-owner').catch(() => {});
    };
  }
  if (entry.action === AuditLogEvent.RoleUpdate) {
    const perms = change(entry, 'permissions');
    if (!perms) return null;
    const before = BigInt(perms.old ?? 0);
    const after = BigInt(perms.new ?? 0);
    const gained = after & ~before;
    const isEveryone = entry.targetId === guild.id;
    if (!(gained & P.Administrator) && !(isEveryone && (gained & DANGER))) return null;
    return async () => {
      const role = guild.roles.cache.get(entry.targetId);
      if (role?.editable) await role.setPermissions(before, 'Protection: dangerous permission added by a non-owner').catch(() => {});
    };
  }
  return null;
}

function isTimeout(entry) {
  if (entry.action !== AuditLogEvent.MemberUpdate) return false;
  const until = change(entry, 'communication_disabled_until')?.new;
  return Boolean(until) && new Date(until).getTime() > Date.now();
}

async function route(guild, entry, rule, amount, hint) {
  const executor = guild.members.cache.get(entry.executorId) || await guild.members.fetch(entry.executorId).catch(() => null);
  if (executor?.user.bot) return trackBotAction(guild, entry.executorId, rule, amount, hint);
  return trackAction(guild, entry.executorId, rule, amount);
}

// ── Message deletes ─────────────────────────────────────────────────────────
// Discord folds repeated deletes by the same person into ONE audit entry and only raises its count,
// and no event fires for that. So every delete schedules a short re-read of the log and charges the growth.
const bootAt = Date.now();
const FRESH_MS = 10 * 60_000; // an entry seen for the first time only counts if it is this recent
const seen = new Map(); // audit entry id -> { count already charged, when we last saw it }
const polls = new Map(); // guildId -> timer

async function pollDeletes(guild) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 25 });
  const now = Date.now();
  for (const entry of logs.entries.values()) {
    const count = Number(entry.extra?.count) || 1;
    const before = seen.get(entry.id);
    seen.set(entry.id, { count, at: now });
    const fresh = entry.createdTimestamp >= Math.max(bootAt, now - FRESH_MS);
    const grew = before === undefined ? (fresh ? count : 0) : count - before.count;
    if (grew <= 0 || !entry.executorId || entry.executorId === guild.client.user.id) continue;
    route(guild, entry, 'messages', grew, { targetId: entry.targetId, channelId: entry.extra?.channel?.id })
      .catch(err => console.error('[ANTI-NUKE]', err.message));
  }
  // Forget entries not seen for 3 hours; Discord stops folding into an entry long before that
  for (const [id, s] of seen) if (now - s.at > 3 * 60 * 60_000) seen.delete(id);
}

function scheduleDeletePoll(guild) {
  if (!guild || polls.has(guild.id)) return;
  polls.set(guild.id, setTimeout(() => {
    polls.delete(guild.id);
    pollDeletes(guild).catch(err => console.error('[ANTI-NUKE] audit read:', err.message));
  }, 1500));
}

module.exports = [
  {
    name: 'guildAuditLogEntryCreate',
    async execute(client, entry, guild) {
      if (!entry.executorId || entry.executorId === client.user.id) return;
      try {
        const simple = SIMPLE[entry.action];
        if (simple) {
          const amount = entry.action === AuditLogEvent.MessageBulkDelete ? Number(entry.extra?.count) || 1 : 1;
          const hint = entry.action === AuditLogEvent.MessageBulkDelete
            ? { channelId: entry.targetId }
            : { targetId: entry.targetId };
          return await route(guild, entry, simple, amount, hint);
        }
        if (isTimeout(entry)) return await route(guild, entry, 'timeouts', 1, { targetId: entry.targetId });
        if (entry.action === AuditLogEvent.BotAdd) {
          const executor = await guild.members.fetch(entry.executorId).catch(() => null);
          if (!executor || executor.user.bot || isTrusted(executor)) return;
          // A bot nobody trusted brought in is the classic way to nuke: it leaves before it can act
          const bot = await guild.members.fetch(entry.targetId).catch(() => null);
          if (bot?.kickable) await bot.kick('Protection: added by a non-owner').catch(() => {});
          return await trackAction(guild, entry.executorId, 'botAdd', 1);
        }
        if (entry.action === AuditLogEvent.MemberRoleUpdate || entry.action === AuditLogEvent.RoleUpdate) {
          const executor = await guild.members.fetch(entry.executorId).catch(() => null);
          if (executor && !executor.user.bot && isTrusted(executor)) return;
          const undo = dangerousGrant(guild, entry);
          if (undo) {
            let actor = entry.executorId;
            if (executor?.user.bot) {
              const invoker = await resolveInvoker(guild, executor.id, 'dangerGrant', { targetId: entry.targetId });
              const who = invoker && await guild.members.fetch(invoker).catch(() => null);
              if (who && isTrusted(who)) return; // the owner did it through a bot
              actor = invoker || executor.id;
            }
            await undo();
            return await trackAction(guild, actor, 'dangerGrant', 1);
          }
          // Mass role changes by a person. Reaction-role bots hand out roles all day, and members picking their own
          // roles (onboarding, "Channels & Roles") are not staff actions.
          if (entry.action === AuditLogEvent.MemberRoleUpdate && executor && !executor.user.bot && entry.executorId !== entry.targetId) {
            return await trackAction(guild, entry.executorId, 'roleEdits', 1);
          }
        }
      } catch (err) {
        console.error('[ANTI-NUKE]', err.message);
      }
    },
  },
  {
    name: 'messageDelete',
    async execute(client, message) {
      scheduleDeletePoll(message.guild);
    },
  },
  {
    name: 'messageCreate',
    async execute(client, message) {
      observeMessage(client, message);
    },
  },
];
