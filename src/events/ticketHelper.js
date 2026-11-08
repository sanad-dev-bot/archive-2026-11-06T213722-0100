const {
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');

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
    new ButtonBuilder().setCustomId(`ticket_close_confirm:${ticketId}`).setLabel('✅ تأكيد الإغلاق').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_close_cancel`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary),
  );
}

const { loadJSON, saveJSON } = require('../utils/storage');
const path = require('path');
const fs   = require('fs');
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

module.exports = { buildSelectMenu, mainRow, closeConfirmRow, ticketCounter };
