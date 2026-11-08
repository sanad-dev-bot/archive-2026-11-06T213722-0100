const { EmbedBuilder, PermissionFlagsBits, WebhookType } = require('discord.js');
const { getGuildConfig, getLogChannel }  = require('../utils/storage');
const { lockServer } = require('../utils/lockdown');
const { isTrusted } = require('../utils/trust');

// ── In-memory state ───────────────────────────────────────────────────────
const joinLog    = new Map(); // guildId -> [timestamps]
const msgLog     = new Map(); // `${guildId}:${userId}` -> [timestamps]
const mentionLog = new Map(); // `${guildId}:${userId}` -> [timestamps]

// ── Helpers ───────────────────────────────────────────────────────────────
function now() { return Date.now(); }

async function punish(member, reason, action = 'mute', duration = 600_000) {
  try {
    if (action === 'mute') await member.timeout(duration, reason);
    if (action === 'kick') await member.kick(reason);
    if (action === 'ban')  await member.ban({ reason });
  } catch {}
}

async function logProtection(guild, title, desc, color = 0xed4245) {
  const ch = await getLogChannel(guild);
  if (!ch) return;
  await ch.send({ embeds: [new EmbedBuilder()
    .setColor(color)
    .setTitle(`🛡️ الحماية — ${title}`)
    .setDescription(desc)
    .setTimestamp()
  ]}).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────
module.exports = [

  // ── Anti-Raid: mass join detection ────────────────────────────────────
  {
    name: 'guildMemberAdd',
    async execute(client, member) {
      const cfg = getGuildConfig(member.guild.id);
      if (!cfg.prot_antiraid) return;

      const threshold = cfg.prot_antiraid_threshold || 8;  // joins
      const window    = (cfg.prot_antiraid_window || 10) * 1000; // seconds → ms

      const gid = member.guild.id;
      if (!joinLog.has(gid)) joinLog.set(gid, []);

      const joins = joinLog.get(gid);
      joins.push(now());

      // Keep only recent
      const recent = joins.filter(t => now() - t < window);
      joinLog.set(gid, recent);

      if (recent.length >= threshold) {
        joinLog.delete(gid); // Reset to avoid spam

        await logProtection(member.guild,
          '⚠️ مداهمة محتملة (Anti-Raid)',
          `**${recent.length}** عضو انضم خلال **${window/1000}** ثانية!\n\n` +
          `تم قفل جميع القنوات مؤقتاً.\nاستخدم \`/protunlock\` لفتحها بعد مراجعة الوضع.`,
          0xed4245
        );

        // Every room is locked and its old state saved, so /protunlock puts each one back exactly
        await lockServer(member.guild, 'Anti-Raid').catch(err => console.error('[ANTI-RAID] lock:', err.message));

        // DM the owner
        try {
          const owner = await member.guild.fetchOwner();
          await owner.send(`⚠️ **Anti-Raid**: تم رصد مداهمة في سيرفر **${member.guild.name}**!\n**${recent.length}** عضو انضم خلال **${window/1000}** ثانية.\n\nجميع القنوات قُفلت. استخدم \`/protunlock\` لفتحها.`);
        } catch {}
      }
    },
  },

  // ── Anti-Spam: message flood ─────────────────────────────────────────
  {
    name: 'messageCreate',
    async execute(client, message) {
      if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const cfg = getGuildConfig(message.guild.id);
      if (!cfg.prot_antispam) return;

      const limit  = cfg.prot_antispam_limit  || 6;   // messages
      const window = (cfg.prot_antispam_window || 5) * 1000; // seconds → ms

      const key = `${message.guild.id}:${message.author.id}`;
      if (!msgLog.has(key)) msgLog.set(key, []);

      const msgs   = msgLog.get(key);
      msgs.push(now());
      const recent = msgs.filter(t => now() - t < window);
      msgLog.set(key, recent);

      if (recent.length >= limit) {
        msgLog.delete(key);

        await punish(message.member, 'Anti-Spam: تجاوز حد الرسائل', 'mute', 5 * 60_000);

        // Delete recent messages
        try {
          const toDelete = await message.channel.messages.fetch({ limit: 20 });
          const spamMsgs = toDelete.filter(m => m.author.id === message.author.id);
          await message.channel.bulkDelete(spamMsgs, true).catch(() => {});
        } catch {}

        await message.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🛡️ Anti-Spam')
            .setDescription(`<@${message.author.id}> تم إسكاته لمدة **5 دقائق** بسبب إرسال رسائل متكررة.`)
            .setTimestamp()
          ],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));

        await logProtection(message.guild,
          'Anti-Spam',
          `**العضو:** <@${message.author.id}> (\`${message.author.tag}\`)\n**القناة:** <#${message.channel.id}>\n**تم إسكاته لـ 5 دقائق.**`
        );
      }
    },
  },

  // ── Anti-Mention Spam ─────────────────────────────────────────────────
  {
    name: 'messageCreate',
    async execute(client, message) {
      if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const cfg = getGuildConfig(message.guild.id);
      if (!cfg.prot_antimentions) return;

      const limit = cfg.prot_antimentions_limit || 5; // mentions per message

      const totalMentions = message.mentions.users.size + message.mentions.roles.size;
      if (message.mentions.everyone || totalMentions >= limit) {
        await message.delete().catch(() => {});
        await punish(message.member, 'Anti-Mentions: ذكر مفرط', 'mute', 10 * 60_000);

        await message.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🛡️ Anti-Mention Spam')
            .setDescription(`<@${message.author.id}> تم إسكاته لمدة **10 دقائق** بسبب الذكر المفرط.`)
            .setTimestamp()
          ],
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));

        await logProtection(message.guild,
          'Anti-Mention Spam',
          `**العضو:** <@${message.author.id}> (\`${message.author.tag}\`)\n**الذكريات:** ${totalMentions}${message.mentions.everyone ? ' + everyone' : ''}\n**القناة:** <#${message.channel.id}>`
        );
      }
    },
  },

  // ── Anti-Link ─────────────────────────────────────────────────────────
  {
    name: 'messageCreate',
    async execute(client, message) {
      if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const cfg = getGuildConfig(message.guild.id);
      if (!cfg.prot_antilink) return;
      if (/^(ticket|incident)-/.test(message.channel.name || '')) return; // members share proof links in tickets

      const LINK_REGEX = /(https?:\/\/|www\.|discord\.gg\/|dsc\.gg\/|discord(app)?\.com\/invite\/)/i;
      if (!LINK_REGEX.test(message.content)) return;

      await message.delete().catch(() => {});

      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('🛡️ Anti-Link')
          .setDescription(`<@${message.author.id}> الروابط غير مسموح بها في هذا السيرفر.`)
          .setTimestamp()
        ],
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));

      await logProtection(message.guild,
        'Anti-Link',
        `**العضو:** <@${message.author.id}>\n**القناة:** <#${message.channel.id}>\n**الرسالة:** ${message.content.slice(0, 200)}`,
        0xfee75c
      );
    },
  },

  // ── Webhook @everyone ─────────────────────────────────────────────────
  // Webhooks skip every other check (they count as bots). A user-made webhook that pings everyone is removed.
  {
    name: 'messageCreate',
    async execute(client, message) {
      if (!message.guild || !message.webhookId || message.interactionMetadata || !message.mentions.everyone) return;
      const hook = await message.fetchWebhook().catch(() => null);
      if (!hook || hook.type !== WebhookType.Incoming || hook.applicationId) return;
      // The owner's own announcement webhooks, and ones a bot made, are left alone
      const maker = hook.owner && await message.guild.members.fetch(hook.owner.id).catch(() => null);
      if (hook.owner?.bot || (maker && isTrusted(maker))) return;
      await message.delete().catch(() => {});
      await hook.delete('Protection: webhook pinged @everyone').catch(() => {});
      await logProtection(message.guild,
        'Webhook',
        `Webhook **${hook.name}** عمل منشن @everyone في <#${message.channel.id}>، فاتمسح هو والرسالة.`
          + (hook.owner ? `\n**اللي عمله:** <@${hook.owner.id}>` : ''),
      );
    },
  },
];
