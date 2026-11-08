const {
  ActionRowBuilder, ChannelType, Colors, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits: P, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuildConfig } = require('./storage');
const { mainRow, closeConfirmRow, ticketCounter } = require('../events/ticketHelper');

const BRAND_COLOR = 0x5EF2D6;
const opening = new Set();
const closing = new Set();
const closeReasons = new Map();

function setCloseReason(channelId, reason) { closeReasons.set(channelId, reason); }

function staffRoles(guild, cfg) {
  return [cfg.ticket_support_role, ...(cfg.ticket_staff_roles || [])]
    .filter((id, n, all) => id && all.indexOf(id) === n && guild.roles.cache.has(id));
}

function isStaff(member, cfg) {
  return member.permissions.has(P.ManageChannels)
    || staffRoles(member.guild, cfg).some(id => member.roles.cache.has(id));
}

function ownerOf(channel) {
  return (channel.topic || '').match(/\((\d{17,20})\)/)?.[1] || null;
}

function findOpenTicket(guild, userId) {
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText
    && c.name.startsWith('ticket-') && ownerOf(c) === userId);
}

async function buildTranscript(channel) {
  const lines = [];
  let before;
  while (lines.length < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    batch.forEach(msg => {
      const parts = [msg.content];
      msg.embeds.forEach(e => parts.push('[embed] ' + [e.title, e.description].filter(Boolean).join(' - ')));
      msg.attachments.forEach(a => parts.push('[file] ' + a.url));
      lines.push('[' + new Date(msg.createdTimestamp).toISOString() + '] ' + msg.author.tag + ': ' + (parts.filter(Boolean).join(' | ') || '(empty)'));
    });
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  return lines.reverse().join('\n') || '(No messages)';
}

async function askDetails(i) {
  const existing = findOpenTicket(i.guild, i.user.id);
  if (existing) return i.reply({ content: 'عندك تذكرة مفتوحة بالفعل: <#' + existing.id + '>', ephemeral: true });

  const topic = i.values[0];
  const modal = new ModalBuilder()
    .setCustomId(('ticket_modal:' + topic).slice(0, 100))
    .setTitle(('تذكرة: ' + topic).slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('details')
        .setLabel('اشرح طلبك بالتفصيل')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5).setMaxLength(1000).setRequired(true),
    ));
  return i.showModal(modal);
}

async function createChannel(guild, options, parent) {
  try {
    return await guild.channels.create({ ...options, parent: parent?.id });
  } catch (err) {
    if (!parent) throw err;
    console.warn('[TICKET] Falling back to no category:', err.message);
    return guild.channels.create(options);
  }
}

async function openTicket(client, i) {
  await i.deferReply({ ephemeral: true });
  // Clears the menu selection so the same option can be picked again
  i.message?.edit({ components: i.message.components }).catch(() => {});

  const { guild, user } = i;
  if (opening.has(user.id)) return i.editReply({ content: 'تذكرتك بتتفتح دلوقتي، استنى ثانية.' });
  opening.add(user.id);

  try {
    const existing = findOpenTicket(guild, user.id);
    if (existing) return await i.editReply({ content: 'عندك تذكرة مفتوحة بالفعل: <#' + existing.id + '>' });

    const cfg = getGuildConfig(guild.id);
    const topic = i.customId.slice('ticket_modal:'.length).replace(/\|/g, '/');
    const details = i.fields.getTextInputValue('details');
    const staff = staffRoles(guild, cfg);
    const num = ticketCounter(guild.id);

    let cat = cfg.ticket_category ? guild.channels.cache.get(cfg.ticket_category) : null;
    if (cat && cat.children.cache.size >= 50) cat = null;

    const overwrites = [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
      { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageChannels, P.ManageMessages] },
      ...staff.map(id => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageMessages] })),
    ];

    const ticketCh = await createChannel(guild, {
      name: 'ticket-' + num,
      type: ChannelType.GuildText,
      topic: 'Ticket #' + num + ' | ' + user.tag + ' (' + user.id + ') | موضوع: ' + topic + ' | مفتوح',
      permissionOverwrites: overwrites,
    }, cat).catch(err => {
      console.error('[TICKET ERROR] Could not create channel:', err.message);
      return null;
    });
    if (!ticketCh) return await i.editReply({ content: '❌ تعذر فتح التذكرة، بلّغ الإدارة.' });

    const embed = new EmbedBuilder()
      .setTitle('🎫 تذكرة #' + num)
      .setDescription(['أهلاً <@' + user.id + '> 👋', 'فريق الدعم هيرد عليك هنا قريب.', '', '**التفاصيل:**', details].join('\n'))
      .setColor(BRAND_COLOR)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👤 العضو', value: '<@' + user.id + '>', inline: true },
        { name: '📋 النوع', value: topic, inline: true },
        { name: '📅 فُتحت', value: '<t:' + Math.floor(Date.now() / 1000) + ':R>', inline: true },
      )
      .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
      .setTimestamp();

    await ticketCh.send({
      content: [...staff.map(id => '<@&' + id + '>'), '<@' + user.id + '>'].join(' '),
      embeds: [embed],
      components: [mainRow(ticketCh.id)],
      allowedMentions: { roles: staff, users: [user.id] },
    });

    return await i.editReply({ content: '✅ تم فتح تذكرتك: <#' + ticketCh.id + '>' });
  } finally {
    opening.delete(user.id);
  }
}

function canClose(i, cfg) {
  return isStaff(i.member, cfg) || ownerOf(i.channel) === i.user.id;
}

async function promptClose(i) {
  if (i.channel.id !== i.customId.split(':')[1]) return i.reply({ content: 'خطأ في معرف التذكرة.', ephemeral: true });
  if (!canClose(i, getGuildConfig(i.guild.id))) return i.reply({ content: 'ليس لديك صلاحية لإغلاق هذه التذكرة.', ephemeral: true });
  return i.reply({
    embeds: [new EmbedBuilder().setTitle('🔒 تأكيد إغلاق التذكرة')
      .setDescription('هيتحفظ سجل المحادثة وبعدها الروم هيتمسح. متأكد؟').setColor(Colors.Red)],
    components: [closeConfirmRow(i.channel.id)],
    ephemeral: true,
  });
}

async function confirmClose(i) {
  const cfg = getGuildConfig(i.guild.id);
  const ch = i.guild.channels.cache.get(i.customId.split(':')[1]);
  if (!ch) return i.update({ content: 'القناة غير موجودة.', components: [], embeds: [] });
  if (!canClose(i, cfg)) return i.reply({ content: 'ليس لديك صلاحية لإغلاق هذه التذكرة.', ephemeral: true });
  if (closing.has(ch.id)) return i.reply({ content: 'التذكرة بتتقفل بالفعل.', ephemeral: true });

  closing.add(ch.id);
  await i.update({ content: '⏳ جاري حفظ السجل وإغلاق التذكرة...', components: [], embeds: [] });

  try {
    const topic = ch.topic || '';
    const num = topic.match(/Ticket #(\d+)/)?.[1] || ch.name.replace('ticket-', '');
    const userId = ownerOf(ch);
    const reason = closeReasons.get(ch.id) || 'لم يُذكر سبب';
    const subject = topic.match(/موضوع: (.+?) \|/)?.[1] || 'غير محدد';
    const transcript = Buffer.from(await buildTranscript(ch), 'utf-8');

    const logEmbed = new EmbedBuilder()
      .setTitle('🔒 تذكرة #' + num + ' اتقفلت')
      .setDescription([
        '**العضو:** ' + (userId ? '<@' + userId + '>' : 'غير معروف'),
        '**النوع:** ' + subject,
        '**السبب:** ' + reason,
        '**قفلها:** <@' + i.user.id + '>',
        '**الوقت:** <t:' + Math.floor(Date.now() / 1000) + ':F>',
      ].join('\n'))
      .setColor(0x2b2d31)
      .setTimestamp();

    if (cfg.ticket_log_channel) {
      const logCh = i.guild.channels.cache.get(cfg.ticket_log_channel);
      const saved = await logCh?.send({ embeds: [logEmbed], files: [{ attachment: transcript, name: 'transcript-' + num + '.txt' }] }).catch(err => {
        console.error('[TICKET ERROR] Could not save transcript:', err.message);
        return null;
      });
      if (!saved) {
        await i.followUp({ content: '❌ السجل ماتحفظش فالتذكرة لسه مفتوحة. راجع صلاحيات قناة اللوق.', ephemeral: true });
        return;
      }
    }

    if (userId) {
      const owner = await i.client.users.fetch(userId).catch(() => null);
      await owner?.send({ embeds: [new EmbedBuilder()
        .setTitle('🎫 تذكرتك في ' + i.guild.name + ' اتقفلت')
        .setDescription('**النوع:** ' + subject + '\n**السبب:** ' + reason)
        .setColor(BRAND_COLOR)] }).catch(() => {});
    }

    await ch.send({ embeds: [new EmbedBuilder()
      .setDescription('🔒 قفلها <@' + i.user.id + '>. الروم هيتمسح خلال 5 ثواني...').setColor(Colors.Red)] }).catch(() => {});
    closeReasons.delete(ch.id);
    setTimeout(() => ch.delete().catch(err => console.error('[TICKET ERROR] Could not delete channel:', err.message)), 5000);
  } finally {
    closing.delete(ch.id);
  }
}

async function claimTicket(i) {
  if (!isStaff(i.member, getGuildConfig(i.guild.id))) return i.reply({ content: 'فريق الدعم بس يقدر يستلم التذاكر.', ephemeral: true });
  await i.deferReply({ ephemeral: true });
  await i.channel.send({ embeds: [new EmbedBuilder()
    .setDescription('✋ <@' + i.user.id + '> استلم التذكرة وهيتابع معاك.').setColor(0x57f287).setTimestamp()] });
  const rows = i.message.components.map(row => {
    const json = row.toJSON();
    json.components = json.components.map(btn => (btn.custom_id === i.customId
      ? { ...btn, disabled: true, label: '✋ ' + i.user.username } : btn));
    return json;
  });
  await i.message.edit({ components: rows }).catch(() => {});
  return i.editReply({ content: '✅ تم استلام التذكرة.' });
}

async function toggleLock(i) {
  if (!isStaff(i.member, getGuildConfig(i.guild.id))) return i.reply({ content: 'فريق الدعم بس يقدر يقفل التذاكر.', ephemeral: true });
  const userId = ownerOf(i.channel);
  if (!userId) return i.reply({ content: 'مش لاقي صاحب التذكرة.', ephemeral: true });
  await i.deferReply({ ephemeral: true });

  // The overwrite is the source of truth: channel topics are rate limited to 2 edits per 10 minutes
  const locked = i.channel.permissionOverwrites.cache.get(userId)?.deny.has(P.SendMessages) || false;
  await i.channel.permissionOverwrites.edit(userId, { SendMessages: locked }, { type: 1 });
  await i.channel.send({ embeds: [new EmbedBuilder()
    .setDescription(locked ? '🔓 <@' + i.user.id + '> فتح التذكرة، تقدر ترد دلوقتي.' : '🔐 <@' + i.user.id + '> قفل التذكرة مؤقتاً.')
    .setColor(locked ? Colors.Green : Colors.Yellow).setTimestamp()] });
  return i.editReply({ content: locked ? '🔓 تم فتح التذكرة.' : '🔐 تم قفل التذكرة.' });
}

async function handleTicketInteraction(client, i) {
  if (!i.inCachedGuild()) return false;
  const id = i.customId || '';
  let run = null;
  if (i.isStringSelectMenu() && id.startsWith('ticket_open:')) run = () => askDetails(i);
  else if (i.isModalSubmit() && id.startsWith('ticket_modal:')) run = () => openTicket(client, i);
  else if (i.isButton() && id.startsWith('ticket_close_confirm:')) run = () => confirmClose(i);
  else if (i.isButton() && id === 'ticket_close_cancel') run = () => i.update({ content: '❌ تم إلغاء الإغلاق.', components: [], embeds: [] });
  else if (i.isButton() && id.startsWith('ticket_close:')) run = () => promptClose(i);
  else if (i.isButton() && id.startsWith('ticket_claim:')) run = () => claimTicket(i);
  else if (i.isButton() && id.startsWith('ticket_lock:')) run = () => toggleLock(i);
  if (!run) return false;

  try {
    await run();
  } catch (err) {
    console.error('[TICKET ERROR]', err);
    const payload = { content: '❌ حصل خطأ، جرب تاني أو بلّغ الإدارة.', ephemeral: true };
    await (i.deferred || i.replied ? i.followUp(payload) : i.reply(payload)).catch(() => {});
  }
  return true;
}

module.exports = { handleTicketInteraction, isStaff, setCloseReason };
