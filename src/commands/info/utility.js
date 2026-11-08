const { outranks } = require('../../utils/rank');
const { SlashCommandBuilder, Colors, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { em } = require('../../utils/embed');

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

module.exports = [

  // ── /serverinfo ───────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('📊 معلومات كاملة عن السيرفر'),
    async execute(i) {
      const g = i.guild;
      const owner = await g.fetchOwner().catch(() => null);
      reply(i, new EmbedBuilder()
        .setTitle(`📊 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .setColor(0x5865f2)
        .addFields(
          { name: '👑 المالك',      value: owner ? `<@${owner.id}>` : 'غير معروف', inline: true },
          { name: '🆔 ID',          value: `\`${g.id}\``,                          inline: true },
          { name: '📅 تاريخ الإنشاء',value: `<t:${Math.floor(g.createdTimestamp/1000)}:D>`, inline: true },
          { name: '👥 الأعضاء',     value: `${g.memberCount}`,                     inline: true },
          { name: '📢 القنوات',     value: `${g.channels.cache.size}`,              inline: true },
          { name: '🎭 الرتب',       value: `${g.roles.cache.size}`,                 inline: true },
          { name: '😀 الإيموجيات',  value: `${g.emojis.cache.size}`,               inline: true },
          { name: '🔰 التحقق',      value: `${g.verificationLevel}`,               inline: true },
          { name: '🚀 Boost',       value: `${g.premiumSubscriptionCount || 0}`,   inline: true },
        )
        .setImage(g.bannerURL({ size: 1024 }) || null)
        .setTimestamp());
    },
  },

  // ── /userinfo ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('userinfo').setDescription('👤 معلومات تفصيلية عن عضو')
      .addUserOption(o => o.setName('member').setDescription('العضو (افتراضي: أنت)')),
    async execute(i) {
      const target = i.options.getMember('member') || i.member;
      const roles  = target.roles.cache.filter(r => r.id !== i.guild.id).map(r => `<@&${r.id}>`);
      reply(i, new EmbedBuilder()
        .setTitle(`👤 ${target.displayName}`)
        .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
        .setColor(target.displayColor || 0x5865f2)
        .addFields(
          { name: '🏷️ المعرّف',     value: `${target.user.tag}`,                                   inline: true },
          { name: '🆔 ID',          value: `\`${target.id}\``,                                     inline: true },
          { name: '🤖 بوت',         value: target.user.bot ? '✅' : '❌',                          inline: true },
          { name: '📅 انضم لديسكورد', value: `<t:${Math.floor(target.user.createdTimestamp/1000)}:R>`, inline: true },
          { name: '📥 انضم للسيرفر',  value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp/1000)}:R>` : 'غير معروف', inline: true },
          { name: '🎭 الحالة',       value: target.presence?.status || 'offline',                  inline: true },
          { name: `🎭 الرتب (${roles.length})`, value: roles.slice(0, 10).join(' ') || 'لا شيء',  inline: false },
        )
        .setTimestamp());
    },
  },

  // ── /avatar ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('avatar').setDescription('🖼️ عرض صورة عضو بالحجم الكامل')
      .addUserOption(o => o.setName('member').setDescription('العضو (افتراضي: أنت)')),
    async execute(i) {
      const target = i.options.getMember('member') || i.member;
      const url    = target.user.displayAvatarURL({ size: 1024 });
      reply(i, new EmbedBuilder()
        .setTitle(`🖼️ صورة ${target.displayName}`)
        .setImage(url)
        .setColor(target.displayColor || 0x5865f2)
        .setDescription(`[تنزيل](${url})`));
    },
  },

  // ── /banner ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('banner').setDescription('🖼️ عرض بانر عضو')
      .addUserOption(o => o.setName('member').setDescription('العضو (افتراضي: أنت)')),
    async execute(i) {
      const target = i.options.getUser('member') || i.user;
      const user   = await i.client.users.fetch(target.id, { force: true });
      if (!user.banner)
        return reply(i, new EmbedBuilder().setDescription('❌ هذا العضو ليس لديه بانر.').setColor(Colors.Red));
      const url = user.bannerURL({ size: 1024 });
      reply(i, new EmbedBuilder()
        .setTitle(`🖼️ بانر ${user.tag}`)
        .setImage(url)
        .setColor(0x5865f2)
        .setDescription(`[تنزيل](${url})`));
    },
  },

  // ── /servericon ───────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('servericon').setDescription('🖼️ عرض صورة السيرفر'),
    async execute(i) {
      const url = i.guild.iconURL({ size: 1024 });
      if (!url) return reply(i, new EmbedBuilder().setDescription('❌ السيرفر ليس لديه صورة.').setColor(Colors.Red));
      reply(i, new EmbedBuilder()
        .setTitle(`🖼️ صورة ${i.guild.name}`)
        .setImage(url).setColor(0x5865f2).setDescription(`[تنزيل](${url})`));
    },
  },

  // ── /serverbanner ─────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('serverbanner').setDescription('🖼️ عرض بانر السيرفر'),
    async execute(i) {
      const url = i.guild.bannerURL({ size: 1024 });
      if (!url) return reply(i, new EmbedBuilder().setDescription('❌ السيرفر ليس لديه بانر.').setColor(Colors.Red));
      reply(i, new EmbedBuilder()
        .setTitle(`🖼️ بانر ${i.guild.name}`)
        .setImage(url).setColor(0x5865f2).setDescription(`[تنزيل](${url})`));
    },
  },

  // ── /membercount ──────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('membercount').setDescription('👥 إحصائيات أعضاء السيرفر'),
    async execute(i) {
      await i.guild.members.fetch();
      const bots   = i.guild.members.cache.filter(m => m.user.bot).size;
      const humans = i.guild.memberCount - bots;
      reply(i, new EmbedBuilder()
        .setTitle(`👥 أعضاء ${i.guild.name}`)
        .setThumbnail(i.guild.iconURL())
        .setColor(0x5865f2)
        .addFields(
          { name: '👥 الإجمالي',  value: `**${i.guild.memberCount}**`, inline: true },
          { name: '🧑 بشر',       value: `**${humans}**`,              inline: true },
          { name: '🤖 بوتات',     value: `**${bots}**`,               inline: true },
        )
        .setTimestamp());
    },
  },

  // ── /ping ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('🏓 سرعة استجابة البوت'),
    async execute(i) {
      const latency = i.client.ws.ping;
      const color   = latency < 100 ? Colors.Green : latency < 200 ? Colors.Yellow : Colors.Red;
      reply(i, new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .addFields(
          { name: '📡 WebSocket',    value: `**${latency}ms**`,                        inline: true },
          { name: '⏱️ API Latency',  value: `**${Date.now() - i.createdTimestamp}ms**`, inline: true },
        )
        .setColor(color));
    },
  },

  // ── /uptime ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('uptime').setDescription('⏱️ مدة تشغيل البوت'),
    async execute(i) {
      const ms  = i.client.uptime;
      const d   = Math.floor(ms / 86400000);
      const h   = Math.floor((ms % 86400000) / 3600000);
      const m   = Math.floor((ms % 3600000) / 60000);
      const s   = Math.floor((ms % 60000) / 1000);
      reply(i, new EmbedBuilder()
        .setTitle('⏱️ مدة التشغيل')
        .setDescription(`**${d}d ${h}h ${m}m ${s}s**`)
        .setColor(0x5865f2).setTimestamp());
    },
  },

  // ── /invite ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('invite').setDescription('🔗 إنشاء رابط دعوة للسيرفر')
      .addChannelOption(o => o.setName('channel').setDescription('القناة (افتراضي: الحالية)')),
    async execute(i) {
      const ch  = i.options.getChannel('channel') || i.channel;
      // Only people who could make an invite themselves get one, and it is reused instead of piling up
      if (!ch.permissionsFor(i.member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite])) {
        return reply(i, new EmbedBuilder().setDescription('🚫 ماعندكش صلاحية تعمل دعوة للروم ده.').setColor(0xed4245), true);
      }
      const inv = await ch.createInvite({ maxAge: 86400, maxUses: 25, unique: false, reason: 'Invite by ' + i.user.tag });
      reply(i, new EmbedBuilder()
        .setTitle('🔗 رابط الدعوة')
        .setDescription(`**${inv.url}**\n\nالقناة: <#${ch.id}> • صالح 24 ساعة / 25 استخدام`)
        .setColor(0x5865f2));
    },
  },

  // ── /invites ──────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('invites').setDescription('📊 عرض دعوات عضو')
      .addUserOption(o => o.setName('member').setDescription('العضو (افتراضي: أنت)')),
    async execute(i) {
      const target = i.options.getMember('member') || i.member;
      const invites = await i.guild.invites.fetch();
      const userInvs = invites.filter(inv => inv.inviter?.id === target.id);
      const total = userInvs.reduce((sum, inv) => sum + (inv.uses || 0), 0);
      reply(i, new EmbedBuilder()
        .setDescription(`📊 **${target.displayName}** لديه **${userInvs.size}** دعوة بإجمالي **${total}** استخدام.`)
        .setColor(0x5865f2));
    },
  },

  // ── /nick ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('nick').setDescription('✏️ تغيير لقب عضو')
      .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
      .addStringOption(o => o.setName('nickname').setDescription('اللقب الجديد').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageNicknames))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Nicknames**.').setColor(Colors.Red), true);
      const target = i.options.getMember('member');
      const nick   = i.options.getString('nickname');
      if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
      if (target.id !== i.user.id && !outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      await target.setNickname(nick);
      reply(i, new EmbedBuilder()
        .setDescription(`✅ لقب <@${target.id}> تغير إلى **${nick}**.\n**بواسطة:** <@${i.user.id}>`)
        .setColor(Colors.Green));
    },
  },

  // ── /resetnick ────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('resetnick').setDescription('🔄 إعادة لقب عضو لاسمه الأصلي')
      .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageNicknames))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Manage Nicknames**.').setColor(Colors.Red), true);
      const target = i.options.getMember('member');
      if (!target) return reply(i, new EmbedBuilder().setDescription('❌ العضو غير موجود.').setColor(Colors.Red), true);
      if (target.id !== i.user.id && !outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      await target.setNickname(null);
      reply(i, new EmbedBuilder()
        .setDescription(`✅ تم إعادة لقب <@${target.id}> لاسمه الأصلي.\n**بواسطة:** <@${i.user.id}>`)
        .setColor(Colors.Green));
    },
  },

  // ── /vmove ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('vmove').setDescription('🔊 نقل عضو لقناة صوتية أخرى')
      .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('القناة الصوتية').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.MoveMembers))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Move Members**.').setColor(Colors.Red), true);
      const target = i.options.getMember('member');
      const ch     = i.options.getChannel('channel');
      if (!target?.voice?.channel) return reply(i, new EmbedBuilder().setDescription('❌ العضو ليس في قناة صوتية.').setColor(Colors.Red), true);
      if (!outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      await target.voice.setChannel(ch);
      reply(i, new EmbedBuilder()
        .setDescription(`✅ <@${target.id}> انتقل إلى **${ch.name}**.`)
        .setColor(Colors.Green));
    },
  },

  // ── /vkick ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('vkick').setDescription('🔇 فصل عضو من القناة الصوتية')
      .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.MoveMembers))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Move Members**.').setColor(Colors.Red), true);
      const target = i.options.getMember('member');
      if (!target?.voice?.channel) return reply(i, new EmbedBuilder().setDescription('❌ العضو ليس في قناة صوتية.').setColor(Colors.Red), true);
      if (!outranks(i.member, target)) return reply(i, new EmbedBuilder().setDescription('❌ لا يمكنك التعامل مع عضو رتبته أعلى أو مساوية لرتبتك.').setColor(Colors.Red), true);
      await target.voice.disconnect();
      reply(i, new EmbedBuilder()
        .setDescription(`✅ <@${target.id}> فُصل من القناة الصوتية.`)
        .setColor(Colors.Green));
    },
  },

  // ── /vmuteall ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('vmuteall').setDescription('🔇 إسكات الجميع في قناتك الصوتية'),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.MuteMembers))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Mute Members**.').setColor(Colors.Red), true);
      if (!i.member.voice?.channel) return reply(i, new EmbedBuilder().setDescription('❌ أنت لست في قناة صوتية.').setColor(Colors.Red), true);
      const members = i.member.voice.channel.members.filter(m => !m.user.bot && m.id !== i.user.id);
      let count = 0;
      for (const [, m] of members) { try { await m.voice.setMute(true); count++; } catch {} }
      reply(i, new EmbedBuilder().setDescription(`🔇 تم إسكات **${count}** عضو.`).setColor(Colors.Green));
    },
  },

  // ── /vunmuteall ───────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('vunmuteall').setDescription('🔊 فك إسكات الجميع في قناتك الصوتية'),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.MuteMembers))
        return reply(i, new EmbedBuilder().setDescription('🚫 تحتاج صلاحية **Mute Members**.').setColor(Colors.Red), true);
      if (!i.member.voice?.channel) return reply(i, new EmbedBuilder().setDescription('❌ أنت لست في قناة صوتية.').setColor(Colors.Red), true);
      const members = i.member.voice.channel.members.filter(m => !m.user.bot);
      let count = 0;
      for (const [, m] of members) { try { await m.voice.setMute(false); count++; } catch {} }
      reply(i, new EmbedBuilder().setDescription(`🔊 تم فك إسكات **${count}** عضو.`).setColor(Colors.Green));
    },
  },
];
