const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { buildSelectMenu } = require('../events/ticketHelper');
const { ticketPanels } = require('./state');
const { buildBanner } = require('./banner');
const { langFor } = require('./i18n');

const BRAND_COLOR = 0x5EF2D6;

const TICKET_OPTIONS = [
  { label: 'دعم عام', description: 'سؤال أو استفسار عن السيرفر', emoji: '💬', value: 'دعم عام' },
  { label: 'شكوى أو بلاغ', description: 'بلاغ عن عضو أو مخالفة للقوانين', emoji: '🚨', value: 'شكوى أو بلاغ' },
  { label: 'مشكلة في اللعب', description: 'مشكلة حصلت معاك في الجيم', emoji: '🎮', value: 'مشكلة في اللعب' },
  { label: 'مشكلة في البوت', description: 'أمر مش شغال أو نظام فيه خطأ', emoji: '🤖', value: 'مشكلة في البوت' },
  { label: 'شراكة', description: 'طلب شراكة مع سيرفر تاني', emoji: '🤝', value: 'شراكة' },
  { label: 'استلام جايزة', description: 'كسبت جايزة وعايز تستلمها', emoji: '🎁', value: 'استلام جايزة' },
];

const TICKET_PANEL_TITLE = '🎫 مركز الدعم';
const TICKET_PANEL_TEXT = [
  'محتاج مساعدة؟ اختار نوع طلبك من القائمة تحت واكتب التفاصيل، وفريق الدعم هيرد عليك في روم خاص.',
  '',
  '**قبل ما تفتح تذكرة:**',
  '• تذكرة واحدة بس لكل عضو في نفس الوقت',
  '• اكتب طلبك بوضوح وابعت صور لو عندك',
  '• ماتمنشنش الإدارة، التذكرة بتوصلهم تلقائي',
  '• بعد الحل التذكرة بتتقفل وسجلها بيتحفظ',
].join('\n');

async function ticketPanelMessage(guild, lang = langFor(guild.id)) {
  const embed = new EmbedBuilder()
    .setTitle(TICKET_PANEL_TITLE)
    .setDescription(TICKET_PANEL_TEXT)
    .setColor(BRAND_COLOR)
    .setImage('attachment://banner.png')
    .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined });
  return { embeds: [embed], files: [await buildBanner('tickets', lang)] };
}

async function sendTicketPanel(channel) {
  const options = TICKET_OPTIONS.map(o => ({ ...o }));
  const msg = await channel.send({
    ...(await ticketPanelMessage(channel.guild, langFor(channel.guild.id, channel.id))),
    components: [buildSelectMenu('pending', options)],
  });
  ticketPanels.set(msg.id, options);
  await msg.edit({ components: [buildSelectMenu(msg.id, options)] });
  return msg;
}

const VERIFY_STEPS = [
  '**1.** اضغط **تحقق** وجاوب على سؤال بسيط',
  '**2.** اربط حساب Roblox عن طريق Bloxlink',
  '**3.** هتاخد رتبتك وتتفتحلك كل الرومات',
].join('\n');

async function verifyPanelMessage(guild, lang = langFor(guild.id)) {
  const embed = new EmbedBuilder()
    .setTitle('✅ تحقق عشان تدخل السيرفر')
    .setDescription([
      'أهلاً بيك في **' + guild.name + '** 👋',
      '',
      VERIFY_STEPS,
      'لو مش عارف تكمل، كلم حد من الإدارة.',
    ].join('\n'))
    .setColor(BRAND_COLOR)
    .setImage('attachment://banner.png')
    .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_start').setLabel('تحقق').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], files: [await buildBanner('verify', lang)], components: [row] };
}

async function sendVerifyPanel(channel) {
  return channel.send(await verifyPanelMessage(channel.guild, langFor(channel.guild.id, channel.id)));
}

module.exports = {
  BRAND_COLOR, VERIFY_STEPS, TICKET_OPTIONS, TICKET_PANEL_TITLE, TICKET_PANEL_TEXT,
  ticketPanelMessage, verifyPanelMessage, sendTicketPanel, sendVerifyPanel,
};
