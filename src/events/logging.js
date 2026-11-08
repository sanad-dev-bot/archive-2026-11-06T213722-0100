const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getLogChannel } = require('../utils/storage');

// ── Helper ────────────────────────────────────────────────────────────────
async function log(guild, embed) {
  const ch = await getLogChannel(guild);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// Fetch most recent audit log entry for a given action (with small delay)
async function getAuditEntry(guild, type, delay = 800) {
  await new Promise(r => setTimeout(r, delay));
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    return logs.entries.first() || null;
  } catch { return null; }
}

function ts() { return Math.floor(Date.now() / 1000); }
function accountAge(user) {
  const days = Math.floor((Date.now() - user.createdTimestamp) / 86400000);
  return days < 1 ? '⚠️ أقل من يوم' : days < 7 ? `⚠️ ${days} أيام` : `${days} يوم`;
}

// ─────────────────────────────────────────────────────────────────────────
module.exports = [

  // ── Member Join ────────────────────────────────────────────────────────
  {
    name: 'guildMemberAdd',
    async execute(client, member) {
      const age   = accountAge(member.user);
      const isNew = (Date.now() - member.user.createdTimestamp) < 7 * 86400000;
      await log(member.guild, new EmbedBuilder()
        .setColor(isNew ? 0xfee75c : 0x57f287)
        .setTitle(isNew ? '⚠️ عضو جديد انضم (حساب جديد!)' : '📥 عضو انضم')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',       value: `<@${member.id}> (\`${member.user.tag}\`)`,              inline: true },
          { name: '🆔 الآيدي',      value: `\`${member.id}\``,                                     inline: true },
          { name: '📅 عمر الحساب',  value: age,                                                    inline: true },
          { name: '🕐 وقت الانضمام', value: `<t:${ts()}:F>`,                                       inline: true },
          { name: '👥 عدد الأعضاء', value: `${member.guild.memberCount}`,                          inline: true },
        )
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Member Leave ───────────────────────────────────────────────────────
  {
    name: 'guildMemberRemove',
    async execute(client, member) {
      const entry  = await getAuditEntry(member.guild, AuditLogEvent.MemberKick);
      const kicked = entry?.target?.id === member.id && (Date.now() - entry.createdTimestamp) < 3000;
      const roles  = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'لا يوجد';

      await log(member.guild, new EmbedBuilder()
        .setColor(kicked ? 0xed4245 : 0xfee75c)
        .setTitle(kicked ? '👢 تم طرد عضو' : '📤 عضو غادر')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',    value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
          { name: '🆔 الآيدي',   value: `\`${member.id}\``,                        inline: true },
          ...(kicked ? [{ name: '🔨 بواسطة', value: `<@${entry.executor?.id}>`, inline: true }] : []),
          ...(kicked && entry.reason ? [{ name: '📝 السبب', value: entry.reason, inline: false }] : []),
          { name: '🎭 الرتب',   value: roles.slice(0, 1024), inline: false },
          { name: '🕐 الوقت',   value: `<t:${ts()}:F>`,       inline: true },
        )
        .setFooter({ text: `ID: ${member.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Message Delete ────────────────────────────────────────────────────
  {
    name: 'messageDelete',
    async execute(client, message) {
      if (!message.guild || message.author?.bot) return;
      if (!message.content && !message.attachments?.size) return;

      const entry   = await getAuditEntry(message.guild, AuditLogEvent.MessageDelete, 600);
      const deleter = entry?.target?.id === message.author?.id
        && (Date.now() - entry.createdTimestamp) < 3000
        ? `<@${entry.executor?.id}>`
        : '*نفس العضو أو غير معروف*';

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ رسالة محذوفة')
        .addFields(
          { name: '✍️ الكاتب',  value: `<@${message.author?.id}> (\`${message.author?.tag}\`)`, inline: true },
          { name: '📍 القناة',  value: `<#${message.channel.id}>`,                               inline: true },
          { name: '🗑️ الحاذف', value: deleter,                                                   inline: true },
        )
        .setFooter({ text: `ID: ${message.author?.id}` })
        .setTimestamp();

      if (message.content) embed.addFields({ name: '💬 المحتوى', value: message.content.slice(0, 1024) || '*فارغ*', inline: false });
      if (message.attachments?.size) embed.addFields({ name: '📎 المرفقات', value: message.attachments.map(a => a.name).join('\n'), inline: false });

      await log(message.guild, embed);
    },
  },

  // ── Message Edit ──────────────────────────────────────────────────────
  {
    name: 'messageUpdate',
    async execute(client, before, after) {
      if (!before.guild || before.author?.bot || before.content === after.content) return;
      if (!before.content) return;

      await log(before.guild, new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('✏️ رسالة معدّلة')
        .setURL(after.url)
        .addFields(
          { name: '✍️ الكاتب', value: `<@${before.author.id}> (\`${before.author.tag}\`)`, inline: true },
          { name: '📍 القناة', value: `<#${before.channel.id}>`,                            inline: true },
          { name: '🔗 الرابط', value: `[انتقل للرسالة](${after.url})`,                    inline: true },
          { name: '📝 قبل',    value: before.content.slice(0, 512) || '*فارغ*',            inline: false },
          { name: '📝 بعد',    value: after.content.slice(0, 512)  || '*فارغ*',            inline: false },
        )
        .setFooter({ text: `ID: ${before.author.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Member Ban ────────────────────────────────────────────────────────
  {
    name: 'guildBanAdd',
    async execute(client, ban) {
      const entry = await getAuditEntry(ban.guild, AuditLogEvent.MemberBan);
      await log(ban.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔨 تم حظر عضو')
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',    value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
          { name: '🔨 بواسطة',  value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
          { name: '📝 السبب',   value: entry?.reason || ban.reason || 'لم يُذكر', inline: false },
          { name: '🕐 الوقت',   value: `<t:${ts()}:F>`, inline: true },
        )
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Member Unban ──────────────────────────────────────────────────────
  {
    name: 'guildBanRemove',
    async execute(client, ban) {
      const entry = await getAuditEntry(ban.guild, AuditLogEvent.MemberUnban);
      await log(ban.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ تم رفع الحظر')
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields(
          { name: '👤 العضو',   value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
          { name: '✅ بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
          { name: '🕐 الوقت',  value: `<t:${ts()}:F>`, inline: true },
        )
        .setFooter({ text: `ID: ${ban.user.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Role Add / Remove / Nickname ──────────────────────────────────────
  {
    name: 'guildMemberUpdate',
    async execute(client, before, after) {
      const rolesAdded   = after.roles.cache.filter(r => !before.roles.cache.has(r.id));
      const rolesRemoved = before.roles.cache.filter(r => !after.roles.cache.has(r.id));
      const nickChanged  = before.nickname !== after.nickname;

      if (!rolesAdded.size && !rolesRemoved.size && !nickChanged) return;

      const entry = await getAuditEntry(
        before.guild,
        rolesAdded.size || rolesRemoved.size ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate
      );
      const executor = entry ? `<@${entry.executor?.id}>` : 'غير معروف أو النظام';

      if (rolesAdded.size) {
        await log(before.guild, new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('➕ رتبة أُضيفت')
          .addFields(
            { name: '👤 العضو',        value: `<@${after.id}> (\`${after.user.tag}\`)`, inline: true },
            { name: '🎭 الرتب المضافة', value: rolesAdded.map(r => `<@&${r.id}>`).join(' '), inline: true },
            { name: '🔧 بواسطة',       value: executor, inline: true },
            { name: '🕐 الوقت',        value: `<t:${ts()}:F>`, inline: true },
          )
          .setFooter({ text: `ID: ${after.id}` })
          .setTimestamp()
        );
      }

      if (rolesRemoved.size) {
        await log(before.guild, new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('➖ رتبة أُزيلت')
          .addFields(
            { name: '👤 العضو',         value: `<@${after.id}> (\`${after.user.tag}\`)`, inline: true },
            { name: '🎭 الرتب المزالة', value: rolesRemoved.map(r => `<@&${r.id}>`).join(' '), inline: true },
            { name: '🔧 بواسطة',        value: executor, inline: true },
            { name: '🕐 الوقت',         value: `<t:${ts()}:F>`, inline: true },
          )
          .setFooter({ text: `ID: ${after.id}` })
          .setTimestamp()
        );
      }

      if (nickChanged) {
        const nickEntry = await getAuditEntry(before.guild, AuditLogEvent.MemberUpdate);
        await log(before.guild, new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('✏️ لقب تغيّر')
          .addFields(
            { name: '👤 العضو',   value: `<@${after.id}> (\`${after.user.tag}\`)`, inline: true },
            { name: '🔧 بواسطة', value: nickEntry ? `<@${nickEntry.executor?.id}>` : 'غير معروف', inline: true },
            { name: '📝 قبل',    value: before.nickname || '*بدون لقب*', inline: true },
            { name: '📝 بعد',    value: after.nickname  || '*بدون لقب*', inline: true },
          )
          .setFooter({ text: `ID: ${after.id}` })
          .setTimestamp()
        );
      }
    },
  },

  // ── Voice State ───────────────────────────────────────────────────────
  {
    name: 'voiceStateUpdate',
    async execute(client, before, after) {
      const member = after.member || before.member;
      if (!member || member.user.bot) return;

      // Mute/Deafen changes (server-side)
      if (before.channelId === after.channelId) {
        if (before.serverMute !== after.serverMute || before.serverDeaf !== after.serverDeaf) {
          const entry = await getAuditEntry(member.guild, AuditLogEvent.MemberUpdate);
          const action = after.serverMute ? '🔇 كتم صوت' : after.serverDeaf ? '🔕 صمّ' : before.serverMute ? '🔊 فك الكتم' : '🔔 فك الصمم';
          await log(member.guild, new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle(`🎙️ ${action} (صوتي)`)
            .addFields(
              { name: '👤 العضو',    value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
              { name: '📍 القناة',  value: after.channel?.name || 'غير معروف', inline: true },
              { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
            )
            .setTimestamp()
          );
        }
        return;
      }

      if (!before.channelId && after.channelId) {
        // Joined voice
        await log(member.guild, new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🔊 انضم لقناة صوتية')
          .addFields(
            { name: '👤 العضو',  value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
            { name: '📍 القناة', value: after.channel.name, inline: true },
            { name: '🕐 الوقت', value: `<t:${ts()}:R>`, inline: true },
          )
          .setFooter({ text: `ID: ${member.id}` })
          .setTimestamp()
        );
      } else if (before.channelId && !after.channelId) {
        // Left voice
        await log(member.guild, new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🔇 غادر القناة الصوتية')
          .addFields(
            { name: '👤 العضو',  value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
            { name: '📍 القناة', value: before.channel.name, inline: true },
            { name: '🕐 الوقت', value: `<t:${ts()}:R>`, inline: true },
          )
          .setFooter({ text: `ID: ${member.id}` })
          .setTimestamp()
        );
      } else if (before.channelId && after.channelId) {
        // Moved
        await log(member.guild, new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('↩️ انتقل بين القنوات الصوتية')
          .addFields(
            { name: '👤 العضو', value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
            { name: '📤 من',    value: before.channel.name, inline: true },
            { name: '📥 إلى',   value: after.channel.name,  inline: true },
          )
          .setFooter({ text: `ID: ${member.id}` })
          .setTimestamp()
        );
      }
    },
  },

  // ── Channel Create ────────────────────────────────────────────────────
  {
    name: 'channelCreate',
    async execute(client, channel) {
      if (!channel.guild) return;
      const entry = await getAuditEntry(channel.guild, AuditLogEvent.ChannelCreate);
      const types = { 0: 'نصية', 2: 'صوتية', 4: 'قسم', 5: 'إعلانات', 13: 'منصة', 15: 'منتدى' };
      await log(channel.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📢 قناة أُنشئت')
        .addFields(
          { name: '📍 القناة',  value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
          { name: '📂 النوع',   value: types[channel.type] || String(channel.type), inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Channel Delete ────────────────────────────────────────────────────
  {
    name: 'channelDelete',
    async execute(client, channel) {
      if (!channel.guild) return;
      const entry = await getAuditEntry(channel.guild, AuditLogEvent.ChannelDelete);
      await log(channel.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ قناة حُذفت')
        .addFields(
          { name: '📍 القناة',  value: `\`#${channel.name}\``, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Channel Update (name/topic/slowmode) ──────────────────────────────
  {
    name: 'channelUpdate',
    async execute(client, before, after) {
      if (!before.guild) return;
      const changes = [];
      if (before.name  !== after.name)  changes.push({ name: '📝 الاسم',      before: before.name,  after: after.name });
      if (before.topic !== after.topic) changes.push({ name: '📌 الموضوع',    before: before.topic || '*فارغ*', after: after.topic || '*فارغ*' });
      if (before.rateLimitPerUser !== after.rateLimitPerUser)
        changes.push({ name: '🐌 السلو مود', before: `${before.rateLimitPerUser}s`, after: `${after.rateLimitPerUser}s` });
      if (!changes.length) return;

      const entry = await getAuditEntry(before.guild, AuditLogEvent.ChannelUpdate);
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('✏️ قناة عُدّلت')
        .addFields(
          { name: '📍 القناة',  value: `<#${after.id}>`, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${after.id}` })
        .setTimestamp();

      changes.forEach(c => embed.addFields(
        { name: `${c.name} — قبل`, value: String(c.before).slice(0, 256), inline: true },
        { name: `${c.name} — بعد`, value: String(c.after).slice(0, 256),  inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
      ));
      await log(before.guild, embed);
    },
  },

  // ── Role Create ───────────────────────────────────────────────────────
  {
    name: 'roleCreate',
    async execute(client, role) {
      const entry = await getAuditEntry(role.guild, AuditLogEvent.RoleCreate);
      await log(role.guild, new EmbedBuilder()
        .setColor(role.color || 0x57f287)
        .setTitle('🎭 رتبة أُنشئت')
        .addFields(
          { name: '🎭 الرتبة',  value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
          { name: '🎨 اللون',   value: role.hexColor, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Role Delete ───────────────────────────────────────────────────────
  {
    name: 'roleDelete',
    async execute(client, role) {
      const entry = await getAuditEntry(role.guild, AuditLogEvent.RoleDelete);
      await log(role.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🗑️ رتبة حُذفت')
        .addFields(
          { name: '🎭 الرتبة',  value: `\`@${role.name}\``, inline: true },
          { name: '🎨 اللون',   value: role.hexColor, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${role.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Role Update ───────────────────────────────────────────────────────
  {
    name: 'roleUpdate',
    async execute(client, before, after) {
      const changes = [];
      if (before.name  !== after.name)  changes.push({ k: '📝 الاسم',  b: before.name,       a: after.name });
      if (before.color !== after.color) changes.push({ k: '🎨 اللون',  b: before.hexColor,   a: after.hexColor });
      if (before.hoist !== after.hoist) changes.push({ k: '🔝 عرض منفصل', b: before.hoist ? 'نعم' : 'لا', a: after.hoist ? 'نعم' : 'لا' });
      if (before.mentionable !== after.mentionable)
        changes.push({ k: '📢 قابل للذكر', b: before.mentionable ? 'نعم' : 'لا', a: after.mentionable ? 'نعم' : 'لا' });
      if (!changes.length) return;

      const entry = await getAuditEntry(before.guild, AuditLogEvent.RoleUpdate);
      const embed = new EmbedBuilder()
        .setColor(after.color || 0x3498db)
        .setTitle('✏️ رتبة عُدّلت')
        .addFields(
          { name: '🎭 الرتبة',  value: `<@&${after.id}>`, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${after.id}` })
        .setTimestamp();
      changes.forEach(c => embed.addFields({ name: `${c.k}: \`${c.b}\` → \`${c.a}\``, value: '\u200b', inline: true }));
      await log(before.guild, embed);
    },
  },

  // ── Emoji Create / Delete ─────────────────────────────────────────────
  {
    name: 'emojiCreate',
    async execute(client, emoji) {
      const entry = await getAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate);
      await log(emoji.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('😀 إيموجي أُضيف')
        .addFields(
          { name: '😀 الإيموجي', value: `${emoji} \`:${emoji.name}:\``, inline: true },
          { name: '🔧 بواسطة',  value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setThumbnail(emoji.url)
        .setFooter({ text: `ID: ${emoji.id}` })
        .setTimestamp()
      );
    },
  },
  {
    name: 'emojiDelete',
    async execute(client, emoji) {
      const entry = await getAuditEntry(emoji.guild, AuditLogEvent.EmojiDelete);
      await log(emoji.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('😀 إيموجي حُذف')
        .addFields(
          { name: '😀 الاسم',  value: `\`:${emoji.name}:\``, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${emoji.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Sticker Create / Delete ───────────────────────────────────────────
  {
    name: 'stickerCreate',
    async execute(client, sticker) {
      const entry = await getAuditEntry(sticker.guild, AuditLogEvent.StickerCreate);
      await log(sticker.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎨 ستيكر أُضيف')
        .addFields(
          { name: '🎨 الاسم',  value: sticker.name, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${sticker.id}` })
        .setTimestamp()
      );
    },
  },
  {
    name: 'stickerDelete',
    async execute(client, sticker) {
      const entry = await getAuditEntry(sticker.guild, AuditLogEvent.StickerDelete);
      await log(sticker.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🎨 ستيكر حُذف')
        .addFields(
          { name: '🎨 الاسم',  value: sticker.name, inline: true },
          { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
        )
        .setFooter({ text: `ID: ${sticker.id}` })
        .setTimestamp()
      );
    },
  },

  // ── Invite Create / Delete ────────────────────────────────────────────
  {
    name: 'inviteCreate',
    async execute(client, invite) {
      await log(invite.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔗 دعوة أُنشئت')
        .addFields(
          { name: '🔗 الرابط',   value: invite.url, inline: true },
          { name: '👤 المنشئ',   value: invite.inviter ? `<@${invite.inviter.id}>` : 'غير معروف', inline: true },
          { name: '📍 القناة',   value: `<#${invite.channel.id}>`, inline: true },
          { name: '⏰ المدة',    value: invite.maxAge ? `${invite.maxAge / 3600}h` : 'دائم', inline: true },
          { name: '🔢 الاستخدامات', value: invite.maxUses ? String(invite.maxUses) : 'غير محدود', inline: true },
        )
        .setTimestamp()
      );
    },
  },
  {
    name: 'inviteDelete',
    async execute(client, invite) {
      await log(invite.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔗 دعوة حُذفت')
        .addFields(
          { name: '🔗 الكود',   value: invite.code, inline: true },
          { name: '📍 القناة',  value: `<#${invite.channel.id}>`, inline: true },
          { name: '🔢 الاستخدامات', value: String(invite.uses || 0), inline: true },
        )
        .setTimestamp()
      );
    },
  },

  // ── Server Update ─────────────────────────────────────────────────────
  {
    name: 'guildUpdate',
    async execute(client, before, after) {
      const changes = [];
      if (before.name        !== after.name)        changes.push(`**الاسم:** \`${before.name}\` → \`${after.name}\``);
      if (before.icon        !== after.icon)        changes.push('**الصورة:** تغيّرت');
      if (before.banner      !== after.banner)      changes.push('**البانر:** تغيّر');
      if (before.description !== after.description) changes.push('**الوصف:** تغيّر');
      if (before.verificationLevel !== after.verificationLevel)
        changes.push(`**مستوى التحقق:** \`${before.verificationLevel}\` → \`${after.verificationLevel}\``);
      if (!changes.length) return;

      const entry = await getAuditEntry(after, AuditLogEvent.GuildUpdate);
      await log(after, new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('⚙️ السيرفر عُدّل')
        .setDescription(changes.join('\n'))
        .addFields({ name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true })
        .setTimestamp()
      );
    },
  },

  // ── Timeout (via member update) ───────────────────────────────────────
  {
    name: 'guildMemberUpdate',
    async execute(client, before, after) {
      const wasTimedOut = before.communicationDisabledUntil;
      const isTimedOut  = after.communicationDisabledUntil;

      if (!wasTimedOut && isTimedOut) {
        const entry = await getAuditEntry(before.guild, AuditLogEvent.MemberUpdate);
        await log(before.guild, new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('🔇 عضو تم إسكاته (Timeout)')
          .addFields(
            { name: '👤 العضو',       value: `<@${after.id}> (\`${after.user.tag}\`)`, inline: true },
            { name: '🔧 بواسطة',     value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
            { name: '⏰ ينتهي',       value: `<t:${Math.floor(after.communicationDisabledUntil.getTime()/1000)}:R>`, inline: true },
            { name: '📝 السبب',       value: entry?.reason || 'لم يُذكر', inline: false },
          )
          .setFooter({ text: `ID: ${after.id}` })
          .setTimestamp()
        );
      } else if (wasTimedOut && !isTimedOut) {
        const entry = await getAuditEntry(before.guild, AuditLogEvent.MemberUpdate);
        await log(before.guild, new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🔊 فُكّ إسكات عضو')
          .addFields(
            { name: '👤 العضو',   value: `<@${after.id}> (\`${after.user.tag}\`)`, inline: true },
            { name: '🔧 بواسطة', value: entry ? `<@${entry.executor?.id}>` : 'غير معروف', inline: true },
          )
          .setFooter({ text: `ID: ${after.id}` })
          .setTimestamp()
        );
      }
    },
  },
];
