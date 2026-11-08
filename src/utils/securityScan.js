// Server security scan: what in this server's own setup lets a nuke through, and what Sanad can fix safely.
// Fixes are only the ones that cannot break anything: @everyone staff permissions, verification level, media filter.
const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GuildExplicitContentFilter, GuildMFALevel,
  GuildVerificationLevel, OverwriteType, PermissionFlagsBits: P, WebhookType,
} = require('discord.js');
const { getGuildConfig } = require('./storage');
const { isTrusted } = require('./trust');

const STAFF = P.Administrator | P.BanMembers | P.KickMembers | P.ManageGuild | P.ManageRoles | P.ManageChannels
  | P.ManageWebhooks | P.ManageMessages | P.ModerateMembers | P.MentionEveryone | P.ManageNicknames | P.ViewAuditLog
  | P.ManageGuildExpressions | P.ManageEvents | P.ManageThreads;
const NUKE = P.Administrator | P.BanMembers | P.KickMembers | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.ManageWebhooks;
const SANAD_NEEDS = [
  ['ViewAuditLog', 'يشوف الـ Audit Log (من غيرها الحماية عامية)'], ['ManageRoles', 'يشيل الرتب'],
  ['ManageChannels', 'يقفل الرومات'], ['BanMembers', 'يحظر'], ['KickMembers', 'يطرد البوتات الغريبة'],
  ['ModerateMembers', 'يسكت'], ['ManageWebhooks', 'يمسح الـ webhooks'], ['ManageMessages', 'يمسح السبام'],
];
const LEVEL = { high: '🔴', medium: '🟠', low: '🟡', info: '🔵' };

function permNames(bits) {
  return Object.entries(P).filter(([, v]) => (bits & v) === v && v !== 0n).map(([k]) => k);
}

async function scanGuild(guild) {
  const findings = [];
  const add = (level, text, fix) => findings.push({ level, text, fix });
  const me = guild.members.me || await guild.members.fetchMe();
  const top = me.roles.highest;
  const everyone = guild.roles.everyone;

  // 1. What Sanad itself is missing
  const missing = SANAD_NEEDS.filter(([k]) => !me.permissions.has(P[k]));
  if (missing.length) add('high', 'سند ناقصه صلاحيات عشان الحماية تشتغل: ' + missing.map(([k, why]) => '`' + k + '` (' + why + ')').join('، '));

  // 2. Bots ranked above Sanad cannot be stopped by it
  const botsAbove = guild.roles.cache.filter(r => r.managed && r.id !== top.id && r.comparePositionTo(top) > 0 && (r.permissions.bitfield & NUKE));
  if (botsAbove.size) add('high', 'بوتات رتبتها فوق سند ومعاها صلاحيات خطيرة، سند مش هيقدر يوقفها: ' + botsAbove.map(r => '<@&' + r.id + '>').join(' ') + '\n➜ اسحب رتبة سند فوقهم من Server Settings > Roles.');

  // 3. @everyone with staff power
  const evBad = everyone.permissions.bitfield & STAFF;
  if (evBad) add('high', '`@everyone` معاه صلاحيات إدارية: ' + permNames(evBad).map(n => '`' + n + '`').join(' '), 'everyone');

  // 4. Administrator roles
  const adminRoles = guild.roles.cache.filter(r => r.id !== everyone.id && r.permissions.has(P.Administrator));
  const adminBots = adminRoles.filter(r => r.managed && r.id !== top.id);
  if (adminBots.size) add('medium', 'بوتات معاها Administrator كاملة: ' + adminBots.map(r => '<@&' + r.id + '>').join(' ') + '\n➜ لو اتخترق أي بوت منهم يقدر يمسح السيرفر. اديه الصلاحيات اللي محتاجها بس.');
  const adminHumans = adminRoles.filter(r => !r.managed);
  if (adminHumans.size) add('info', 'رتب بشرية معاها Administrator: ' + adminHumans.map(r => '<@&' + r.id + '>').join(' ') + '\n➜ الحماية بقت بتراقبهم (إلا الأونر والكو أونر).');

  // 5. Roles that can ping everyone but are not staff
  const pingers = guild.roles.cache.filter(r => r.id !== everyone.id && !r.managed && r.permissions.has(P.MentionEveryone)
    && !r.permissions.any(P.BanMembers | P.KickMembers | P.ManageMessages | P.Administrator));
  if (pingers.size) add('medium', 'رتب مش إدارية وتقدر تعمل @everyone: ' + pingers.map(r => '<@&' + r.id + '>').join(' '));

  // 6. Server safety settings
  if (guild.verificationLevel < GuildVerificationLevel.Medium) add('medium', 'مستوى التحقق ضعيف (أي حساب جديد يكتب على طول). الأفضل **Medium** على الأقل.', 'verification');
  if (guild.explicitContentFilter !== GuildExplicitContentFilter.AllMembers) add('low', 'فلتر الصور والفيديوهات المخلة مش شغال على كل الأعضاء.', 'filter');
  if (guild.mfaLevel !== GuildMFALevel.Elevated) add('medium', '2FA مش مطلوب للإدارة. لو حساب أدمن اتسرق يقدر يستخدم صلاحياته.\n➜ الأونر بس يفعّلها: Server Settings > Safety Setup > Require 2FA for moderator actions.');

  // 7. Channel overwrites handing out staff power
  const leaks = [];
  for (const ch of guild.channels.cache.values()) {
    for (const ow of ch.permissionOverwrites?.cache.values() || []) {
      const bad = ow.allow.bitfield & (NUKE | P.MentionEveryone);
      if (!bad) continue;
      if (ow.type === OverwriteType.Role && ow.id !== everyone.id) {
        const role = guild.roles.cache.get(ow.id);
        if (!role || role.managed || role.permissions.any(NUKE)) continue;
      }
      // Bots given rights on a room are doing their job (ServerStats renames its counter channels)
      if (ow.type === OverwriteType.Member && (ow.id === guild.client.user.id || guild.members.cache.get(ow.id)?.user.bot)) continue;
      leaks.push('<#' + ch.id + '> → ' + (ow.type === OverwriteType.Member ? '<@' + ow.id + '>' : '<@&' + ow.id + '>') + ': ' + permNames(bad).map(n => '`' + n + '`').join(' '));
    }
  }
  if (leaks.length) add('medium', 'رومات بتدّي صلاحيات خطيرة لحد مش من الإدارة:\n' + leaks.slice(0, 8).join('\n') + (leaks.length > 8 ? '\n… و ' + (leaks.length - 8) + ' كمان' : ''));

  // 8. Webhooks made by people (the classic @everyone spam tool)
  const hooks = await guild.fetchWebhooks().catch(() => null);
  const userHooks = hooks?.filter(h => h.type === WebhookType.Incoming && h.owner && !h.owner.bot);
  if (userHooks?.size) add('low', 'Webhooks عملها أعضاء: ' + userHooks.map(h => '**' + h.name + '** في <#' + h.channelId + '>').slice(0, 6).join('، ') + '\n➜ امسح أي واحد مش مستخدم.');

  // 9. Sanad's own protection switches
  const cfg = getGuildConfig(guild.id);
  const off = [['prot_antiraid', 'Anti-Raid'], ['prot_antispam', 'Anti-Spam'], ['prot_antimentions', 'Anti-Mention']].filter(([k]) => !cfg[k]);
  if (off.length) add('low', 'أنظمة حماية في سند مقفولة: ' + off.map(([, n]) => '**' + n + '**').join('، ') + '\n➜ شغّلها من `/protection`.');
  if (cfg.lockdown?.active) add('info', '🔒 السيرفر مقفول دلوقتي من الحماية. افتحه بـ `/protunlock` بعد المراجعة.');

  return { at: Date.now(), guild: guild.name, findings };
}

function report(result) {
  const order = ['high', 'medium', 'low', 'info'];
  const sorted = result.findings.slice().sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const counts = order.map(l => LEVEL[l] + ' ' + sorted.filter(f => f.level === l).length).join('  ');
  let text = sorted.map(f => LEVEL[f.level] + ' ' + f.text).join('\n\n') || '✅ مالقيتش مشاكل.';
  if (text.length > 3900) text = text.slice(0, 3900) + '\n…';
  const fixes = [...new Set(sorted.map(f => f.fix).filter(Boolean))];
  const labels = { everyone: 'شيل صلاحيات @everyone الإدارية', verification: 'خلي التحقق Medium', filter: 'شغّل فلتر الميديا' };
  const rows = fixes.length ? [new ActionRowBuilder().addComponents(fixes.map(k => new ButtonBuilder()
    .setCustomId('secfix:' + k).setLabel(labels[k]).setStyle(ButtonStyle.Danger)))] : [];
  return {
    embeds: [new EmbedBuilder().setTitle('🛡️ فحص أمان السيرفر').setDescription(counts + '\n\n' + text).setColor(0x5865F2).setTimestamp()],
    components: rows,
    allowedMentions: { parse: [] },
  };
}

async function saveReport(guild) {
  const result = await scanGuild(guild);
  const file = path.join(process.cwd(), 'data', 'security-scan-' + guild.id + '.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  return result;
}

async function handleFix(i) {
  if (!i.inCachedGuild() || !i.isButton() || !i.customId.startsWith('secfix:')) return false;
  if (!isTrusted(i.member)) {
    await i.reply({ content: '🚫 التصليح ده للأونر والكو أونر بس.', ephemeral: true });
    return true;
  }
  const what = i.customId.slice('secfix:'.length);
  try {
    if (what === 'everyone') {
      const ev = i.guild.roles.everyone;
      await ev.setPermissions(ev.permissions.bitfield & ~STAFF, 'Security scan fix by ' + i.user.tag);
    } else if (what === 'verification') {
      if (i.guild.verificationLevel < GuildVerificationLevel.Medium) await i.guild.setVerificationLevel(GuildVerificationLevel.Medium, 'Security scan fix by ' + i.user.tag);
    } else if (what === 'filter') {
      await i.guild.setExplicitContentFilter(GuildExplicitContentFilter.AllMembers, 'Security scan fix by ' + i.user.tag);
    } else {
      return false;
    }
    const fresh = await saveReport(i.guild);
    await i.update(report(fresh));
  } catch (err) {
    console.error('[SECURITY SCAN] fix', what, err.message);
    const payload = { content: '❌ التصليح ماكملش: ' + err.message, ephemeral: true };
    await (i.replied || i.deferred ? i.followUp(payload) : i.reply(payload)).catch(() => {});
  }
  return true;
}

module.exports = { scanGuild, report, saveReport, handleFix };
