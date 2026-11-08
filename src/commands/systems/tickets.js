const {
  SlashCommandBuilder, Colors, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { em }                                               = require('../../utils/embed');
const { ticketPanels }                                     = require('../../utils/state');
const { getGuildConfig, setGuildConfig }                   = require('../../utils/storage');
const path = require('path');
const fs   = require('fs');
const { TICKET_OPTIONS, TICKET_PANEL_TITLE, TICKET_PANEL_TEXT, BRAND_COLOR } = require('../../utils/serverKit');
const { buildBanner } = require('../../utils/banner');
const { isStaff, setCloseReason } = require('../../utils/ticketSystem');

const TICKET_FILE = path.join(process.cwd(), 'data', 'tickets.json');

function ticketCounter(guildId) {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(TICKET_FILE, 'utf-8')); } catch {}
  if (!d[guildId]) d[guildId] = { count: 0 };
  d[guildId].count++;
  fs.mkdirSync(path.dirname(TICKET_FILE), { recursive: true });
  fs.writeFileSync(TICKET_FILE, JSON.stringify(d, null, 2));
  return String(d[guildId].count).padStart(4, '0');
}

async function reply(i, embed, ephemeral = false) {
  if (i.replied || i.deferred) return i.followUp({ embeds: [embed], ephemeral });
  return i.reply({ embeds: [embed], ephemeral });
}

function buildSelectMenu(panelId, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_open:${panelId}`)
    .setPlaceholder('📩 اختر نوع مشكلتك...')
    .setMinValues(1).setMaxValues(1);
  options.forEach(opt => {
    const o = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value);
    if (opt.description) o.setDescription(opt.description);
    if (opt.emoji)       o.setEmoji(opt.emoji);
    menu.addOptions(o);
  });
  return new ActionRowBuilder().addComponents(menu);
}

function mainRow(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close:${ticketId}`).setLabel('🔒 إغلاق').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_claim:${ticketId}`).setLabel('✋ استلام').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_lock:${ticketId}`).setLabel('🔐 قفل').setStyle(ButtonStyle.Secondary),
  );
}

function closeConfirmRow(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_confirm:${ticketId}`).setLabel('✅ تأكيد').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary),
  );
}

module.exports = [

  // ── /setticketrole ────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setticketrole')
      .setDescription('🎭 تحديد رتبة الدعم الفني — تُضاف لكل تذكرة تلقائياً')
      .addRoleOption(o => o.setName('role').setDescription('رتبة الدعم الفني').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const role = i.options.getRole('role');
      setGuildConfig(i.guild.id, 'ticket_support_role', role.id);
      reply(i, em('✅ رتبة الدعم الفني', `سيتم إضافة <@&${role.id}> لجميع التذاكر تلقائياً.`, Colors.Green));
    },
  },

  // ── /setticketlog ─────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setticketlog')
      .setDescription('📋 قناة حفظ سجل التذاكر المغلقة (Transcript)')
      .addChannelOption(o => o.setName('channel').setDescription('قناة اللوق').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const ch = i.options.getChannel('channel');
      setGuildConfig(i.guild.id, 'ticket_log_channel', ch.id);
      reply(i, em('✅ قناة لوق التذاكر', `التذاكر المغلقة ستُحفظ في <#${ch.id}>.`, Colors.Green));
    },
  },

  // ── /setticketcategory ────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setticketcategory')
      .setDescription('📁 تحديد القسم (Category) الذي تُنشأ فيه التذاكر')
      .addChannelOption(o => o.setName('category').setDescription('القسم').setRequired(true)),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const cat = i.options.getChannel('category');
      if (cat.type !== ChannelType.GuildCategory)
        return reply(i, em('❌', 'يجب اختيار قسم (Category) وليس قناة.', Colors.Red), true);
      setGuildConfig(i.guild.id, 'ticket_category', cat.id);
      reply(i, em('✅ قسم التذاكر', `التذاكر ستُنشأ داخل **${cat.name}**.`, Colors.Green));
    },
  },

  // ── /ticketpanel ──────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ticketpanel')
      .setDescription('🎫 إرسال بانل التذاكر بالقائمة المنسدلة')
      .addChannelOption(o => o.setName('channel').setDescription('القناة (افتراضي: الحالية)'))
      .addStringOption(o => o.setName('title').setDescription('عنوان البانل'))
      .addStringOption(o => o.setName('description').setDescription('وصف البانل'))
      .addStringOption(o => o.setName('color').setDescription('لون الإيمبد hex'))
      .addStringOption(o => o.setName('image').setDescription('رابط صورة')),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      await i.deferReply({ ephemeral: true });
      const ch    = i.options.getChannel('channel') || i.channel;
      const title = i.options.getString('title')       || TICKET_PANEL_TITLE;
      const desc  = i.options.getString('description') || TICKET_PANEL_TEXT;
      const colorHex = i.options.getString('color');
      const image    = i.options.getString('image');
      let color = BRAND_COLOR;
      if (colorHex) { const c = colorHex.replace('#',''); if (/^[0-9a-fA-F]{6}$/.test(c)) color = parseInt(c,16); }
      const panelEmbed = new EmbedBuilder()
        .setTitle(title).setDescription(desc).setColor(color)
        .setFooter({ text: i.guild.name, iconURL: i.guild.iconURL() || undefined })
        .setTimestamp();
      const files = [];
      if (image) panelEmbed.setImage(image);
      else { files.push(await buildBanner('tickets')); panelEmbed.setImage('attachment://banner.png'); }
      const defaultOpts = TICKET_OPTIONS.map(o => ({ ...o }));
      const msg = await ch.send({ embeds: [panelEmbed], files, components: [buildSelectMenu('pending', defaultOpts)] });
      ticketPanels.set(msg.id, defaultOpts);
      await msg.edit({ components: [buildSelectMenu(msg.id, defaultOpts)] });
      reply(i, em('✅ تم إرسال البانل', `البانل في <#${ch.id}>.\n**معرف البانل:** \`${msg.id}\`\n\nاستخدم \`/ticketoption add\` لإضافة خيارات.`, Colors.Green));
    },
  },

  // ── /ticketoption — merged: add / remove ─────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ticketoption')
      .setDescription('📋 إدارة خيارات قائمة التذاكر — إضافة أو حذف')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('➕ إضافة خيار للقائمة')
        .addStringOption(o => o.setName('message_id').setDescription('معرف رسالة البانل').setRequired(true))
        .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('وصف الخيار'))
        .addStringOption(o => o.setName('emoji').setDescription('إيموجي')))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('➖ حذف خيار من القائمة')
        .addStringOption(o => o.setName('message_id').setDescription('معرف رسالة البانل').setRequired(true))
        .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true))),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator))
        return reply(i, em('🚫', 'تحتاج صلاحية **Administrator**.', Colors.Red), true);
      const sub   = i.options.getSubcommand();
      const msgId = i.options.getString('message_id');
      const label = i.options.getString('label');
      let panelMsg = null;
      for (const [, ch] of i.guild.channels.cache) {
        if (ch.type !== ChannelType.GuildText) continue;
        try { panelMsg = await ch.messages.fetch(msgId); if (panelMsg) break; } catch {}
      }
      if (!panelMsg) return reply(i, em('❌', 'لم أجد الرسالة. تأكد من المعرف.', Colors.Red), true);
      // The in-memory list is empty after a restart, so fall back to the message itself
      const existing = ticketPanels.get(msgId)
        || (panelMsg.components[0]?.components[0]?.options || []).map(o => ({
          label: o.label, description: o.description || undefined, emoji: o.emoji?.name || undefined, value: o.value,
        }));
      if (sub === 'add') {
        const desc  = i.options.getString('description') || undefined;
        const emoji = i.options.getString('emoji')       || undefined;
        if (existing.length >= 25)           return reply(i, em('❌', 'الحد الأقصى 25 خيار.', Colors.Red), true);
        if (existing.find(o => o.label === label)) return reply(i, em('❌', 'يوجد خيار بهذا الاسم.', Colors.Red), true);
        existing.push({ label, description: desc, emoji, value: label });
        ticketPanels.set(msgId, existing);
        await panelMsg.edit({ components: [buildSelectMenu(msgId, existing)] });
        reply(i, em('✅ تمت الإضافة', `**${label}** أُضيف.\n**الإجمالي:** ${existing.length} خيار`, Colors.Green));
      } else {
        const idx = existing.findIndex(o => o.label === label);
        if (idx === -1)           return reply(i, em('❌', `لا يوجد خيار **${label}**.`, Colors.Red), true);
        if (existing.length === 1) return reply(i, em('❌', 'لا يمكن حذف الخيار الأخير.', Colors.Red), true);
        existing.splice(idx, 1);
        ticketPanels.set(msgId, existing);
        await panelMsg.edit({ components: [buildSelectMenu(msgId, existing)] });
        reply(i, em('✅ تمت الإزالة', `**${label}** أُزيل.\n**المتبقي:** ${existing.length} خيار`, Colors.Orange));
      }
    },
  },

  // ── /ticketmember — merged: add / remove ─────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ticketmember')
      .setDescription('👥 إضافة أو إزالة عضو من التذكرة الحالية')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('➕ إضافة عضو للتذكرة')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('➖ إزالة عضو من التذكرة')
        .addUserOption(o => o.setName('member').setDescription('العضو').setRequired(true))),
    async execute(i) {
      if (!i.channel.name.startsWith('ticket-'))
        return reply(i, em('❌', 'هذا الأمر يعمل داخل قنوات التذاكر فقط.', Colors.Red), true);
      const cfg = getGuildConfig(i.guild.id);
      const canManage =
        i.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        isStaff(i.member, cfg);
      if (!canManage)
        return reply(i, em('🚫', 'فقط فريق الدعم أو الإدارة.', Colors.Red), true);
      const target = i.options.getMember('member');
      if (!target) return reply(i, em('❌', 'العضو غير موجود.', Colors.Red), true);
      const isAdd = i.options.getSubcommand() === 'add';
      await i.channel.permissionOverwrites.edit(target.id, isAdd
        ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }
        : { ViewChannel: false, SendMessages: false }
      );
      await i.channel.send({ embeds: [new EmbedBuilder()
        .setDescription(`${isAdd ? '✅ تم إضافة' : '➖ تم إزالة'} <@${target.id}> ${isAdd ? 'للتذكرة' : 'من التذكرة'} بواسطة <@${i.user.id}>.`)
        .setColor(isAdd ? Colors.Green : Colors.Orange)
      ]});
      reply(i, em('✅', isAdd ? 'تمت الإضافة.' : 'تمت الإزالة.', isAdd ? Colors.Green : Colors.Orange), true);
    },
  },

  // ── /renameticket ─────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('renameticket')
      .setDescription('✏️ تغيير اسم قناة التذكرة الحالية')
      .addStringOption(o => o.setName('name').setDescription('الاسم الجديد').setRequired(true)),
    async execute(i) {
      if (!i.channel.name.startsWith('ticket-'))
        return reply(i, em('❌', 'هذا الأمر يعمل داخل قنوات التذاكر فقط.', Colors.Red), true);
      if (!isStaff(i.member, getGuildConfig(i.guild.id)))
        return reply(i, em('🚫', 'فقط فريق الدعم أو الإدارة.', Colors.Red), true);
      // Channel renames are rate limited, so acknowledge before waiting on Discord
      await i.deferReply();
      const name = i.options.getString('name').toLowerCase().replace(/\s+/g, '-');
      await i.channel.setName(`ticket-${name}`);
      reply(i, em('✅', `تم تغيير اسم القناة إلى \`ticket-${name}\`.`, Colors.Green));
    },
  },

  // ── /closeticket ──────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('closeticket')
      .setDescription('🔒 إغلاق التذكرة الحالية مع حفظ السجل')
      .addStringOption(o => o.setName('reason').setDescription('سبب الإغلاق (اختياري)')),
    async execute(i) {
      if (!i.channel.name.startsWith('ticket-'))
        return reply(i, em('❌', 'هذا الأمر يعمل داخل قنوات التذاكر فقط.', Colors.Red), true);
      const cfg = getGuildConfig(i.guild.id);
      const canClose =
        i.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        isStaff(i.member, cfg) ||
        i.channel.topic?.includes(i.user.id);
      if (!canClose) return reply(i, em('🚫', 'ليس لديك صلاحية لإغلاق هذه التذكرة.', Colors.Red), true);
      const reason = i.options.getString('reason') || 'لم يُذكر سبب';
      setCloseReason(i.channel.id, reason);
      await i.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🔒 تأكيد إغلاق التذكرة')
          .setDescription(`**السبب:** ${reason}\n\nسيتم حفظ سجل المحادثة وإرساله في قناة اللوق.`)
          .setColor(Colors.Red)
        ],
        components: [closeConfirmRow(i.channel.id)],
      });
    },
  },

  // ── /ticketstats ──────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('ticketstats')
      .setDescription('📊 إحصائيات نظام التذاكر'),
    async execute(i) {
      if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return reply(i, em('🚫', 'تحتاج صلاحية **Manage Channels**.', Colors.Red), true);
      let total = 0;
      try { const d = JSON.parse(fs.readFileSync(TICKET_FILE,'utf-8')); total = d[i.guild.id]?.count || 0; } catch {}
      const cfg  = getGuildConfig(i.guild.id);
      const open = i.guild.channels.cache.filter(c => c.name.startsWith('ticket-') && c.type === ChannelType.GuildText).size;
      reply(i, new EmbedBuilder()
        .setTitle('📊 إحصائيات التذاكر')
        .setColor(0x5865f2)
        .addFields(
          { name: '🎫 إجمالي التذاكر',  value: `**${total}**`,                                                      inline: true },
          { name: '🟢 مفتوحة الآن',     value: `**${open}**`,                                                       inline: true },
          { name: '🎭 رتبة الدعم',      value: cfg.ticket_support_role ? `<@&${cfg.ticket_support_role}>` : 'لم تُحدد', inline: true },
          { name: '📁 قسم التذاكر',     value: cfg.ticket_category ? `<#${cfg.ticket_category}>` : 'افتراضي',       inline: true },
          { name: '📋 قناة اللوق',      value: cfg.ticket_log_channel ? `<#${cfg.ticket_log_channel}>` : 'لم تُحدد', inline: true },
        )
        .setTimestamp());
    },
  },
];

module.exports.buildSelectMenu  = buildSelectMenu;
module.exports.mainRow          = mainRow;
module.exports.closeConfirmRow  = closeConfirmRow;
module.exports.ticketCounter    = ticketCounter;
