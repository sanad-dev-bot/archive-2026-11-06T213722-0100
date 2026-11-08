const {
  SlashCommandBuilder, Colors, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { em }              = require('../../utils/embed');
const { activeGiveaways } = require('../../utils/state');

// ─────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────
async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}

// ── Build giveaway embed ──────────────────────────────────────────────────
function buildEmbed(ga, ended = false) {
  const endTs = Math.floor(ga.endsAt / 1000);
  const bar   = buildBar(ga.entries.length, ga.maxEntries);

  const e = new EmbedBuilder()
    .setColor(ended ? 0x2b2d31 : ga.color || 0xf1c40f)
    .setTimestamp(ga.endsAt);

  if (ga.image) e.setImage(ga.image);
  if (ga.thumbnail) e.setThumbnail(ga.thumbnail);

  if (ended) {
    e.setTitle(`🎊 انتهى السحب — ${ga.prize}`);
    e.setDescription([
      ga.winnerLine || '> لم يفز أحد.',
      '',
      ga.description || '',
    ].filter(Boolean).join('\n'));
    e.addFields(
      { name: '🏆 الفائزون',    value: ga.winnerLine || 'لا أحد',             inline: true },
      { name: '👥 المشاركون',   value: `**${ga.entries.length}**`,            inline: true },
      { name: '🎟️ الفائزين',    value: `**${ga.winners}**`,                  inline: true },
    );
    e.setFooter({ text: `🎫 يستضيفه: ${ga.hostedBy}` });
  } else {
    e.setTitle(`🎉 ${ga.prize}`);
    const desc = [
      ga.description ? `> ${ga.description}\n` : '',
      '> اضغط على **🎉** للمشاركة!',
      '',
      bar,
    ].filter(s => s !== undefined).join('\n');
    e.setDescription(desc);
    e.addFields(
      { name: '⏰ ينتهي',       value: `<t:${endTs}:R>`,                      inline: true },
      { name: '🏆 عدد الفائزين',value: `**${ga.winners}**`,                   inline: true },
      { name: '👥 مشاركون',     value: `**${ga.entries.length}**${ga.maxEntries ? `/${ga.maxEntries}` : ''}`, inline: true },
    );
    if (ga.requiredRole) {
      e.addFields({ name: '🎭 شرط الرتبة', value: `<@&${ga.requiredRole}>`, inline: true });
    }
    if (ga.minAccountAge) {
      e.addFields({ name: '📅 عمر الحساب', value: `${ga.minAccountAge} يوم على الأقل`, inline: true });
    }
    if (ga.paused) {
      e.addFields({ name: '⏸️ الحالة', value: '**مؤقت**', inline: true });
      e.setColor(0x99aab5);
    }
    e.setFooter({ text: `🎫 يستضيفه: ${ga.hostedBy} • ${fmtDuration(ga.endsAt - Date.now())} متبقي` });
  }

  return e;
}

function buildBar(current, max) {
  if (!max) return '';
  const pct  = Math.min(current / max, 1);
  const fill = Math.round(pct * 10);
  return `\`[${'█'.repeat(fill)}${'░'.repeat(10 - fill)}]\` ${current}/${max}`;
}

// ── Action row for giveaway ───────────────────────────────────────────────
function giveawayRow(msgId, paused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`g_enter:${msgId}`)
      .setLabel('🎉 شارك')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`g_count:${msgId}`)
      .setLabel('👥 المشاركون')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── End a giveaway ────────────────────────────────────────────────────────
// A giveaway is only visible to commands run in the server it belongs to
function guildGiveaway(i, msgId) {
  const ga = activeGiveaways.get(msgId);
  return ga && i.guild.channels.cache.has(ga.channelId) ? ga : null;
}

async function endGiveaway(msgId, channel) {
  if (!activeGiveaways.has(msgId)) return;
  const ga = activeGiveaways.get(msgId);
  activeGiveaways.delete(msgId);
  clearTimeout(ga.timeout);

  let msg;
  try { msg = await channel.messages.fetch(msgId); } catch { return; }

  if (!ga.entries.length) {
    ga.winnerLine = 'لم يشارك أحد 😔';
    await msg.edit({ embeds: [buildEmbed(ga, true)], components: [] });
    return channel.send({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('😔 انتهى السحب — لا فائز')
        .setDescription(`سحب **${ga.prize}** انتهى بدون مشاركين.`)
        .setTimestamp()
      ],
    });
  }

  // Pick winners
  const count   = Math.min(ga.winners, ga.entries.length);
  const pool    = [...ga.entries];
  const winners = [];
  for (let k = 0; k < count; k++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  const mentions = winners.map(w => `<@${w}>`).join(', ');
  ga.winnerLine  = mentions;

  await msg.edit({ embeds: [buildEmbed(ga, true)], components: [] });

  await channel.send({
    content: winners.map(w => `<@${w}>`).join(' '),
    embeds: [new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎊 تهانينا! فزت في السحب')
      .setDescription([
        `**🎁 الجائزة:** ${ga.prize}`,
        `**🏆 الفائزون:** ${mentions}`,
        `**👥 إجمالي المشاركين:** ${ga.entries.length}`,
        '',
        `[انتقل إلى رسالة السحب](https://discord.com/channels/${channel.guild.id}/${channel.id}/${msgId})`,
      ].join('\n'))
      .setTimestamp()
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  COMMANDS
// ─────────────────────────────────────────────────────────────────────────
module.exports = [

  // ── /gstart ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gstart').setDescription('ابدأ سحباً جديداً')
      .addStringOption(o => o.setName('prize').setDescription('الجائزة').setRequired(true))
      .addIntegerOption(o => o.setName('duration').setDescription('المدة بالدقائق').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('winners').setDescription('عدد الفائزين (افتراضي: 1)').setMinValue(1).setMaxValue(20))
      .addChannelOption(o => o.setName('channel').setDescription('القناة'))
      .addStringOption(o => o.setName('description').setDescription('وصف إضافي للجائزة'))
      .addRoleOption(o => o.setName('required_role').setDescription('رتبة مطلوبة للمشاركة'))
      .addIntegerOption(o => o.setName('max_entries').setDescription('حد أقصى للمشاركين').setMinValue(1))
      .addIntegerOption(o => o.setName('min_account_age').setDescription('الحد الأدنى لعمر الحساب (بالأيام)').setMinValue(1))
      .addStringOption(o => o.setName('color').setDescription('لون الإيمبد hex (مثال: ff0000)'))
      .addStringOption(o => o.setName('image').setDescription('رابط صورة كبيرة'))
      .addStringOption(o => o.setName('thumbnail').setDescription('رابط صورة صغيرة')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const prize        = i.options.getString('prize');
      const duration     = i.options.getInteger('duration');
      const winners      = i.options.getInteger('winners')       || 1;
      const ch           = i.options.getChannel('channel')       || i.channel;
      const description  = i.options.getString('description')    || null;
      const requiredRole = i.options.getRole('required_role')?.id || null;
      const maxEntries   = i.options.getInteger('max_entries')   || null;
      const minAccountAge= i.options.getInteger('min_account_age')|| null;
      const colorHex     = i.options.getString('color');
      const image        = i.options.getString('image')          || null;
      const thumbnail    = i.options.getString('thumbnail')      || null;

      let color = 0xf1c40f;
      if (colorHex) {
        const c = colorHex.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(c)) color = parseInt(c, 16);
      }

      await i.deferReply({ ephemeral: true });

      const endsAt = Date.now() + duration * 60_000;
      const ga = {
        prize, winners, endsAt,
        hostedBy: i.user.tag,
        hostedById: i.user.id,
        channelId: ch.id,
        entries: [],
        paused: false,
        description, requiredRole, maxEntries,
        minAccountAge, color, image, thumbnail,
        timeout: null,
        winnerLine: null,
      };

      const msg = await ch.send({
        embeds:     [buildEmbed(ga)],
        components: [giveawayRow('pending')],
      });

      // Update component IDs with real message ID
      await msg.edit({ components: [giveawayRow(msg.id)] });

      ga.timeout = setTimeout(() => endGiveaway(msg.id, ch), duration * 60_000);
      activeGiveaways.set(msg.id, ga);

      i.editReply({ embeds: [new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ بدأ السحب')
        .addFields(
          { name: '🎁 الجائزة',   value: prize,                          inline: true },
          { name: '⏰ المدة',      value: fmtDuration(duration * 60_000), inline: true },
          { name: '🏆 الفائزون',  value: String(winners),                 inline: true },
          { name: '📍 القناة',    value: `<#${ch.id}>`,                  inline: true },
          { name: '🆔 المعرف',    value: `\`${msg.id}\``,                inline: true },
        )
      ]});
    },
  },

  // ── /gend ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gend').setDescription('أنهِ سحباً قبل انتهاء وقته')
      .addStringOption(o => o.setName('message_id').setDescription('معرف رسالة السحب').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const msgId = i.options.getString('message_id');
      if (!guildGiveaway(i, msgId))
        return reply(i, em('❌', 'لا يوجد سحب نشط بهذا المعرف.', Colors.Red), true);

      const ga = guildGiveaway(i, msgId);
      const ch = i.guild.channels.cache.get(ga.channelId);
      if (!ch) return reply(i, em('❌', 'لم أجد قناة السحب.', Colors.Red), true);

      await endGiveaway(msgId, ch);
      reply(i, em('✅', 'تم إنهاء السحب.', Colors.Green), true);
    },
  },

  // ── /greroll ──────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('greroll').setDescription('أعد السحب على فائز/فائزين جدد')
      .addStringOption(o => o.setName('message_id').setDescription('معرف رسالة السحب').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('عدد الفائزين الجدد (افتراضي: 1)').setMinValue(1)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const msgId = i.options.getString('message_id');
      const count = i.options.getInteger('winners') || 1;

      // Look for ga in state or reconstruct from button entries
      let pool;
      if (guildGiveaway(i, msgId)) {
        pool = [...guildGiveaway(i, msgId).entries];
      } else {
        // Try to read entries from button interactions — search any channel
        return reply(i, em('❌',
          'السحب لم يعد نشطاً في الذاكرة.\nاستخدم `/greroll` قبل إعادة تشغيل البوت.',
          Colors.Red), true);
      }

      if (!pool.length) return reply(i, em('❌', 'لا يوجد مشاركون لإعادة السحب.', Colors.Red), true);

      const winners = [];
      for (let k = 0; k < Math.min(count, pool.length); k++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
      }
      const mentions = winners.map(w => `<@${w}>`).join(', ');

      await i.channel.send({
        content: winners.map(w => `<@${w}>`).join(' '),
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🔄 إعادة السحب!')
          .setDescription([
            `**🎊 الفائز الجديد:** ${mentions}`,
            `**بواسطة:** <@${i.user.id}>`,
          ].join('\n'))
          .setTimestamp()
        ],
      });
      reply(i, em('✅ تمت إعادة السحب', `الفائز: ${mentions}`, Colors.Green), true);
    },
  },

  // ── /gpause ───────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gpause').setDescription('أوقف السحب مؤقتاً (لا يُقبل مشاركون جدد)')
      .addStringOption(o => o.setName('message_id').setDescription('معرف السحب').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const msgId = i.options.getString('message_id');
      const ga    = guildGiveaway(i, msgId);
      if (!ga) return reply(i, em('❌', 'لا يوجد سحب نشط بهذا المعرف.', Colors.Red), true);
      if (ga.paused) return reply(i, em('❌', 'السحب متوقف بالفعل.', Colors.Red), true);

      ga.paused = true;
      clearTimeout(ga.timeout);

      const ch  = i.guild.channels.cache.get(ga.channelId);
      const msg = await ch?.messages.fetch(msgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildEmbed(ga)] }).catch(() => {});

      reply(i, em('⏸️ تم الإيقاف المؤقت', `سحب **${ga.prize}** متوقف الآن.\nاستخدم \`/gresume\` لاستئنافه.`, Colors.Yellow));
    },
  },

  // ── /gresume ──────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gresume').setDescription('استأنف سحباً متوقفاً')
      .addStringOption(o => o.setName('message_id').setDescription('معرف السحب').setRequired(true)),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const msgId = i.options.getString('message_id');
      const ga    = guildGiveaway(i, msgId);
      if (!ga) return reply(i, em('❌', 'لا يوجد سحب بهذا المعرف.', Colors.Red), true);
      if (!ga.paused) return reply(i, em('❌', 'السحب يعمل بالفعل.', Colors.Red), true);

      ga.paused  = false;
      const remaining = ga.endsAt - Date.now();
      if (remaining <= 0) {
        const ch = i.guild.channels.cache.get(ga.channelId);
        if (ch) await endGiveaway(msgId, ch);
        return reply(i, em('⚠️', 'انتهى وقت السحب أثناء الإيقاف. تم إنهاؤه الآن.', Colors.Yellow), true);
      }

      const ch  = i.guild.channels.cache.get(ga.channelId);
      const msg = await ch?.messages.fetch(msgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildEmbed(ga)] }).catch(() => {});

      ga.timeout = setTimeout(() => endGiveaway(msgId, ch), remaining);
      reply(i, em('▶️ تم الاستئناف', `سحب **${ga.prize}** يعمل مجدداً.\nينتهي <t:${Math.floor(ga.endsAt/1000)}:R>.`, Colors.Green));
    },
  },

  // ── /gedit ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gedit').setDescription('عدّل معلومات سحب نشط')
      .addStringOption(o => o.setName('message_id').setDescription('معرف السحب').setRequired(true))
      .addStringOption(o => o.setName('prize').setDescription('جائزة جديدة'))
      .addIntegerOption(o => o.setName('winners').setDescription('عدد الفائزين').setMinValue(1).setMaxValue(20))
      .addStringOption(o => o.setName('description').setDescription('وصف جديد')),

    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Messages**.', Colors.Red), true);

      const msgId      = i.options.getString('message_id');
      const ga         = guildGiveaway(i, msgId);
      if (!ga) return reply(i, em('❌', 'لا يوجد سحب نشط بهذا المعرف.', Colors.Red), true);

      const newPrize   = i.options.getString('prize');
      const newWinners = i.options.getInteger('winners');
      const newDesc    = i.options.getString('description');

      if (newPrize)   ga.prize       = newPrize;
      if (newWinners) ga.winners     = newWinners;
      if (newDesc !== null) ga.description = newDesc;

      const ch  = i.guild.channels.cache.get(ga.channelId);
      const msg = await ch?.messages.fetch(msgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildEmbed(ga)] }).catch(() => {});

      reply(i, em('✅ تم التعديل', [
        newPrize   ? `**الجائزة:** ${ga.prize}` : '',
        newWinners ? `**الفائزون:** ${ga.winners}` : '',
        newDesc    ? `**الوصف:** ${ga.description}` : '',
      ].filter(Boolean).join('\n'), Colors.Green));
    },
  },

  // ── /glist ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('glist').setDescription('عرض جميع السحوبات النشطة'),

    async execute(i) {
      const mine = new Map([...activeGiveaways].filter(([, g]) => i.guild.channels.cache.has(g.channelId)));
      if (!mine.size)
        return reply(i, em('🎉', 'لا توجد سحوبات نشطة حالياً.', Colors.Blue));

      const embed = new EmbedBuilder()
        .setTitle(`🎉 السحوبات النشطة (${mine.size})`)
        .setColor(0xf1c40f)
        .setTimestamp();

      for (const [id, ga] of mine) {
        embed.addFields({
          name:  `${ga.paused ? '⏸️' : '🎉'} ${ga.prize}`,
          value: [
            `> ينتهي: <t:${Math.floor(ga.endsAt/1000)}:R>`,
            `> المشاركون: **${ga.entries.length}**${ga.maxEntries ? `/${ga.maxEntries}` : ''}`,
            `> الفائزون: **${ga.winners}** | القناة: <#${ga.channelId}>`,
            `> المعرف: \`${id}\``,
          ].join('\n'),
          inline: false,
        });
      }

      reply(i, embed);
    },
  },

  // ── /ginfo ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ginfo').setDescription('تفاصيل كاملة عن سحب معين')
      .addStringOption(o => o.setName('message_id').setDescription('معرف السحب').setRequired(true)),

    async execute(i) {
      const msgId = i.options.getString('message_id');
      const ga    = guildGiveaway(i, msgId);
      if (!ga) return reply(i, em('❌', 'لا يوجد سحب نشط بهذا المعرف.', Colors.Red), true);

      const embed = new EmbedBuilder()
        .setColor(ga.paused ? 0x99aab5 : ga.color || 0xf1c40f)
        .setTitle(`🎉 ${ga.prize}`)
        .addFields(
          { name: '⏰ ينتهي',        value: `<t:${Math.floor(ga.endsAt/1000)}:F>`,              inline: true },
          { name: '🏆 الفائزون',     value: `**${ga.winners}**`,                                inline: true },
          { name: '👥 مشاركون',      value: `**${ga.entries.length}**${ga.maxEntries?`/${ga.maxEntries}`:''}`, inline: true },
          { name: '🎤 يستضيفه',      value: `<@${ga.hostedById}>`,                              inline: true },
          { name: '📍 القناة',       value: `<#${ga.channelId}>`,                               inline: true },
          { name: '⏸️ الحالة',       value: ga.paused ? 'متوقف مؤقتاً' : 'نشط',               inline: true },
        )
        .setTimestamp();

      if (ga.description)   embed.addFields({ name: '📝 الوصف',        value: ga.description,             inline: false });
      if (ga.requiredRole)  embed.addFields({ name: '🎭 رتبة مطلوبة',  value: `<@&${ga.requiredRole}>`,  inline: true });
      if (ga.minAccountAge) embed.addFields({ name: '📅 عمر الحساب',  value: `${ga.minAccountAge} يوم`, inline: true });
      if (ga.maxEntries)    embed.addFields({ name: '🎟️ الحد الأقصى', value: `${ga.maxEntries}`,         inline: true });

      reply(i, embed);
    },
  },
];

module.exports.endGiveaway    = endGiveaway;
module.exports.buildEmbed     = buildEmbed;
module.exports.giveawayRow    = giveawayRow;
