const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { getTopXP, getXP } = require('./storage');

const PERIODS = { all: 'الشامل', day: 'اليومي', week: 'الأسبوعي', month: 'الشهري' };
const TYPES = { all: 'شامل', text: 'كتابي فقط', voice: 'صوتي فقط' };

function formatXP(n) { return Number(n || 0).toLocaleString('en-US'); }
function linesFor(list) {
  if (!list.length) return 'لا توجد بيانات للفترة المحددة.';
  return list.map((m, i) =>
    `**#${i + 1}** <@${m.userId}> — LVL ${Math.floor(Math.max(0, Number(m.xp) || 0) / 150) + 1} · ${formatXP(m.xp)} XP`
  ).join('\n');
}
function separator() { return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small); }

async function buildTopComponents(guild, requestedBy, type = 'all', period = 'all', suffix = '') {
  const text = type === 'voice' ? [] : getTopXP(guild.id, 'text', period, 5);
  const voice = type === 'text' ? [] : getTopXP(guild.id, 'voice', period, 5);
  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  if (type !== 'voice') {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## TOP TEXT'));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linesFor(text)));
  }
  if (type === 'all') container.addSeparatorComponents(separator());
  if (type !== 'text') {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## TOP VOICE'));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linesFor(voice)));
  }

  container.addSeparatorComponents(separator());
  const requesterXP = getXP(guild.id, requestedBy.id);
  const requesterValue = type === 'voice'
    ? Number(requesterXP?.voiceXp || 0)
    : type === 'text'
      ? Number(requesterXP?.textXp || 0)
      : Number(requesterXP?.textXp || 0) + Number(requesterXP?.voiceXp || 0);
  const requesterLevel = Math.floor(Math.max(0, requesterValue) / 150) + 1;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${requestedBy.id}> — LVL ${requesterLevel} · ${formatXP(requesterValue)} XP`)
  );
  container.addSeparatorComponents(separator());
  for (const row of buildTopRows(type, period, suffix)) container.addActionRowComponents(row);
  return [container];
}

function buildTopRows(type = 'all', period = 'all', suffix = '') {
  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId(`xp_top_type${suffix}`)
    .setPlaceholder('اختر نوع التوب')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('شامل').setDescription('أفضل 5 كتابي + أفضل 5 صوتي').setValue('all').setDefault(type === 'all'),
      new StringSelectMenuOptionBuilder().setLabel('كتابي فقط').setDescription('أفضل 5 في الشات').setValue('text').setDefault(type === 'text'),
      new StringSelectMenuOptionBuilder().setLabel('صوتي فقط').setDescription('أفضل 5 في الرومات الصوتية').setValue('voice').setDefault(type === 'voice'),
    );

  const periodMenu = new StringSelectMenuBuilder()
    .setCustomId(`xp_top_period${suffix}`)
    .setPlaceholder('اختر الفترة الزمنية')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('الشامل').setDescription('كل الوقت').setValue('all').setDefault(period === 'all'),
      new StringSelectMenuOptionBuilder().setLabel('اليومي').setDescription('بيانات اليوم').setValue('day').setDefault(period === 'day'),
      new StringSelectMenuOptionBuilder().setLabel('الأسبوعي').setDescription('بيانات الأسبوع').setValue('week').setDefault(period === 'week'),
      new StringSelectMenuOptionBuilder().setLabel('الشهري').setDescription('بيانات الشهر').setValue('month').setDefault(period === 'month'),
    );
  return [new ActionRowBuilder().addComponents(typeMenu), new ActionRowBuilder().addComponents(periodMenu)];
}
function isTopTypeId(id) { return id.startsWith('xp_top_type'); }
function isTopPeriodId(id) { return id.startsWith('xp_top_period'); }
module.exports = { buildTopComponents, buildTopRows, isTopTypeId, isTopPeriodId, TYPES, PERIODS };
